import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import AdmZip from "adm-zip";
import Fastify from "fastify";
import { z } from "zod";

const app = Fastify({ logger: true });

const requestSchema = z.object({
	jobId: z.string().uuid(),
	packagePath: z.string().min(1),
	manifest: z.object({
		runtime: z.object({
			entrypoint: z.string().min(1)
		})
	}),
	inputConfig: z.record(z.any()).default({}),
	secretConfig: z.record(z.string()).default({}),
	eventCallbackUrl: z.string().url().optional(),
	eventCallbackToken: z.string().optional()
});

type RunnerEvent = Record<string, unknown> & { __runnerMediaRoot?: string };

type ProcessResult = {
	exitCode: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
	error?: string;
};

function parseTimeout(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return Math.min(86_400_000, Math.max(1_000, Math.trunc(parsed)));
}

const processTimeoutMs = parseTimeout(process.env.RUNNER_PROCESS_TIMEOUT_MS, 1_800_000);
const eventCallbackTimeoutMs = parseTimeout(process.env.RUNNER_EVENT_CALLBACK_TIMEOUT_MS, 10_000);

function parseJsonlLines(raw: string) {
	const events: Array<Record<string, unknown>> = [];
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		try {
			const parsed = JSON.parse(trimmed);
			events.push(parsed);
		} catch {
			events.push({ type: "log", level: "warn", message: trimmed });
		}
	}
	return events;
}

async function runProcess(
	command: string,
	args: string[],
	options: {
		cwd: string;
		env?: NodeJS.ProcessEnv;
		timeoutMs?: number;
		onStdout?: (text: string) => void;
		onStderr?: (text: string) => void;
	}
): Promise<ProcessResult> {
	return new Promise((resolvePromise) => {
		let stdout = "";
		let stderr = "";
		let settled = false;
		let child: ChildProcessWithoutNullStreams | undefined;
		const finish = (result: ProcessResult) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			resolvePromise(result);
		};
		const timeout = setTimeout(() => {
			child?.kill("SIGKILL");
			finish({ exitCode: null, stdout, stderr, timedOut: true });
		}, options.timeoutMs ?? processTimeoutMs);

		try {
			const spawnedChild = spawn(command, args, {
				cwd: options.cwd,
				env: options.env
			});
			child = spawnedChild;
			spawnedChild.stdout.on("data", (chunk) => {
				const text = chunk.toString();
				stdout += text;
				options.onStdout?.(text);
			});
			spawnedChild.stderr.on("data", (chunk) => {
				const text = chunk.toString();
				stderr += text;
				options.onStderr?.(text);
			});
			spawnedChild.on("error", (error) => {
				finish({ exitCode: null, stdout, stderr, timedOut: false, error: error.message });
			});
			spawnedChild.on("close", (code) => {
				finish({ exitCode: code, stdout, stderr, timedOut: false });
			});
		} catch (error) {
			finish({
				exitCode: null,
				stdout,
				stderr,
				timedOut: false,
				error: error instanceof Error ? error.message : "failed to start process"
			});
			return;
		}
	});
}

async function postRunnerEvent(
	callbackUrl: string | undefined,
	callbackToken: string | undefined,
	event: { eventType: string; level?: string | null; message?: string | null; payload?: Record<string, unknown> }
) {
	if (!callbackUrl) {
		return;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), eventCallbackTimeoutMs);
	try {
		const response = await fetch(callbackUrl, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(callbackToken ? { "x-runner-token": callbackToken } : {})
			},
			body: JSON.stringify(event),
			signal: controller.signal
		});
		if (!response.ok) {
			app.log.warn({ status: response.status, callbackUrl, eventType: event.eventType }, "runner event callback failed");
		}
	} catch (error) {
		app.log.warn({ error, callbackUrl, eventType: event.eventType }, "runner event callback error");
	} finally {
		clearTimeout(timeout);
	}
}

async function stageMediaFiles(jobId: string, events: RunnerEvent[]) {
	const mediaRoot = process.env.MEDIA_LOCAL_ROOT ?? "storage/media";
	const updates: Array<{ from: string; to: string }> = [];

	for (const event of events) {
		if (event.type !== "media_ready") {
			continue;
		}

		const fileValue = typeof event.file === "string" ? event.file : "";
		if (!fileValue.startsWith("media/")) {
			continue;
		}

		const sourcePath = event.__runnerMediaRoot
			? resolve(event.__runnerMediaRoot, fileValue)
			: "";

		if (!sourcePath || !existsSync(sourcePath)) {
			continue;
		}

		const targetRelative = join("imports", jobId, basename(fileValue));
		const targetAbsolute = resolve(process.cwd(), mediaRoot, targetRelative);
		await mkdir(dirname(targetAbsolute), { recursive: true });
		await cp(sourcePath, targetAbsolute);

		event.file = targetRelative.replaceAll("\\", "/");
		delete event.__runnerMediaRoot;
		updates.push({ from: sourcePath, to: targetAbsolute });
	}

	return updates;
}

app.post("/internal/run-import", async (request, reply) => {
	const parsedBody = requestSchema.safeParse(request.body);
	if (!parsedBody.success) {
		return reply.status(400).send({ message: "请求参数错误", issues: parsedBody.error.flatten() });
	}

	const body = parsedBody.data;

	const tempDir = await mkdtemp(join(tmpdir(), "podcast-hub-runner-"));
	const extractedDir = resolve(tempDir, "connector");
	const workOutputDir = resolve(tempDir, "work/output");
	await mkdir(extractedDir, { recursive: true });
	await mkdir(resolve(workOutputDir, "media"), { recursive: true });

	try {
		const zip = new AdmZip(readFileSync(body.packagePath));
		zip.extractAllTo(extractedDir, true);

		const entrypoint = resolve(extractedDir, body.manifest.runtime.entrypoint);
		if (!existsSync(entrypoint)) {
			return reply.status(400).send({ message: "connector entrypoint 不存在" });
		}

		const pythonCmd = process.env.RUNNER_PYTHON_CMD ?? "python3";
		const requirementsPath = resolve(extractedDir, "requirements.lock");
		const venvDir = resolve(tempDir, "venv");
		const venvPython = resolve(venvDir, "bin/python3");
		const venvPip = resolve(venvDir, "bin/pip3");

		await postRunnerEvent(body.eventCallbackUrl, body.eventCallbackToken, {
			eventType: "runner_setup",
			level: "info",
			message: "creating python virtual environment"
		});

		const venvCreate = await runProcess(pythonCmd, ["-m", "venv", venvDir], {
			cwd: extractedDir,
			env: process.env
		});
		if (venvCreate.timedOut) {
			return reply.status(504).send({ status: "timeout", message: "创建 Python 虚拟环境超时" });
		}
		if (venvCreate.exitCode !== 0) {
			await postRunnerEvent(body.eventCallbackUrl, body.eventCallbackToken, {
				eventType: "runner_setup",
				level: "error",
				message: "failed to create python virtual environment"
			});
			return reply.status(500).send({
				status: "failed",
				message: "创建 Python 虚拟环境失败",
				stderr: venvCreate.stderr || null
			});
		}

		await postRunnerEvent(body.eventCallbackUrl, body.eventCallbackToken, {
			eventType: "runner_setup",
			level: "info",
			message: "initializing python build tools"
		});

		const pipInstallTools = await runProcess(venvPython, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"], {
			cwd: extractedDir,
			env: process.env
		});
		if (pipInstallTools.timedOut) {
			return reply.status(504).send({ status: "timeout", message: "初始化 Python 依赖环境超时" });
		}
		if (pipInstallTools.exitCode !== 0) {
			await postRunnerEvent(body.eventCallbackUrl, body.eventCallbackToken, {
				eventType: "runner_setup",
				level: "error",
				message: "failed to initialize python build tools"
			});
			return reply.status(500).send({
				status: "failed",
				message: "初始化 Python 依赖环境失败",
				stderr: pipInstallTools.stderr || null
			});
		}

		if (existsSync(requirementsPath)) {
			await postRunnerEvent(body.eventCallbackUrl, body.eventCallbackToken, {
				eventType: "runner_setup",
				level: "info",
				message: "installing connector dependencies"
			});
			const pipInstallDeps = await runProcess(venvPip, ["install", "-r", requirementsPath], {
				cwd: extractedDir,
				env: process.env
			});
			if (pipInstallDeps.timedOut) {
				return reply.status(504).send({ status: "timeout", message: "安装 connector 依赖超时" });
			}
			if (pipInstallDeps.exitCode !== 0) {
				await postRunnerEvent(body.eventCallbackUrl, body.eventCallbackToken, {
					eventType: "runner_setup",
					level: "error",
					message: "failed to install connector dependencies"
				});
				return reply.status(500).send({
					status: "failed",
					message: "安装 connector 依赖失败",
					stderr: pipInstallDeps.stderr || null
				});
			}
		}

		await postRunnerEvent(body.eventCallbackUrl, body.eventCallbackToken, {
			eventType: "runner_setup",
			level: "info",
			message: "launching connector entrypoint"
		});

		let stdoutBuffer = "";
		let stderrBuffer = "";
		const flushBufferedLine = (channel: "stdout" | "stderr", line: string) => {
			void postRunnerEvent(body.eventCallbackUrl, body.eventCallbackToken, {
				eventType: channel === "stdout" ? "runner_stdout" : "runner_stderr",
				level: channel === "stdout" ? "info" : "warn",
				message: line,
				payload: { channel }
			});
		};
		const reportLines = (channel: "stdout" | "stderr", text: string) => {
			const combined = `${channel === "stdout" ? stdoutBuffer : stderrBuffer}${text}`;
			const lines = combined.split(/\r?\n/);
			const remainder = lines.pop() ?? "";
			if (channel === "stdout") {
				stdoutBuffer = remainder;
			} else {
				stderrBuffer = remainder;
			}
			for (const line of lines) {
				if (line.trim()) {
					flushBufferedLine(channel, line);
				}
			}
		};
		const runResult = await runProcess(venvPython, [entrypoint], {
			cwd: extractedDir,
			env: {
				...process.env,
				CONNECTOR_INPUT_JSON: JSON.stringify(body.inputConfig ?? {}),
				CONNECTOR_SECRET_JSON: JSON.stringify(body.secretConfig ?? {}),
				CONNECTOR_OUTPUT_ROOT: workOutputDir
			},
			onStdout: (text) => reportLines("stdout", text),
			onStderr: (text) => reportLines("stderr", text)
		});
		if (stdoutBuffer.trim()) {
			flushBufferedLine("stdout", stdoutBuffer.trim());
		}
		if (stderrBuffer.trim()) {
			flushBufferedLine("stderr", stderrBuffer.trim());
		}

		const events: RunnerEvent[] = parseJsonlLines(runResult.stdout).map((item) => ({ ...item, __runnerMediaRoot: workOutputDir }));
		if (runResult.stderr.trim()) {
			events.push({ type: "log", level: "warn", message: runResult.stderr.trim() });
		}

		const copiedMedia = await stageMediaFiles(body.jobId, events);
		const normalizedEvents = events.map((item) => {
			const { __runnerMediaRoot, ...rest } = item;
			return rest;
		});

		const hasAuthRequired = normalizedEvents.some((item) => item.type === "auth_required");
		const hasInputRequired = normalizedEvents.some((item) => item.type === "input_required");
		let status: "completed" | "failed" | "timeout" | "waiting_for_input" | "waiting_for_auth" = runResult.timedOut
			? "timeout"
			: runResult.exitCode === 0
				? "completed"
				: "failed";
		if (runResult.exitCode === 0 && hasAuthRequired) {
			status = "waiting_for_auth";
		} else if (runResult.exitCode === 0 && hasInputRequired) {
			status = "waiting_for_input";
		}

		return {
			status,
			exitCode: runResult.exitCode,
			events: normalizedEvents,
			copiedMediaCount: copiedMedia.length,
			stderr: runResult.stderr || runResult.error || null
		};
	} catch (error) {
		request.log.error(error);
		return reply.status(500).send({
			status: "failed",
			message: error instanceof Error ? error.message : "runner 执行失败"
		});
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

app.get("/health", async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 4300);
const host = process.env.HOST ?? "0.0.0.0";

app
	.listen({ port, host })
	.then(() => {
		app.log.info(`Runner listening on ${host}:${port}`);
	})
	.catch((err) => {
		app.log.error(err);
		process.exit(1);
	});
