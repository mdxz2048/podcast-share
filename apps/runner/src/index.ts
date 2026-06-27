import { spawn } from "node:child_process";
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
	secretConfig: z.record(z.string()).default({})
});

type RunnerEvent = Record<string, unknown> & { __runnerMediaRoot?: string };

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

		const runResult = await new Promise<{ exitCode: number | null; stdout: string; stderr: string }>((resolvePromise) => {
			const child = spawn(pythonCmd, [entrypoint], {
				cwd: extractedDir,
				env: {
					...process.env,
					CONNECTOR_INPUT_JSON: JSON.stringify(body.inputConfig ?? {}),
					CONNECTOR_SECRET_JSON: JSON.stringify(body.secretConfig ?? {}),
					CONNECTOR_OUTPUT_ROOT: workOutputDir
				}
			});

			let stdout = "";
			let stderr = "";

			child.stdout.on("data", (chunk) => {
				stdout += chunk.toString();
			});
			child.stderr.on("data", (chunk) => {
				stderr += chunk.toString();
			});

			child.on("close", (code) => {
				resolvePromise({ exitCode: code, stdout, stderr });
			});
		});

		const events: RunnerEvent[] = parseJsonlLines(runResult.stdout).map((item) => ({ ...item, __runnerMediaRoot: workOutputDir }));
		if (runResult.stderr.trim()) {
			events.push({ type: "log", level: "warn", message: runResult.stderr.trim() });
		}

		const copiedMedia = await stageMediaFiles(body.jobId, events);
		const normalizedEvents = events.map((item) => {
			const { __runnerMediaRoot, ...rest } = item;
			return rest;
		});

		return {
			status: runResult.exitCode === 0 ? "completed" : "failed",
			exitCode: runResult.exitCode,
			events: normalizedEvents,
			copiedMediaCount: copiedMedia.length,
			stderr: runResult.stderr || null
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
