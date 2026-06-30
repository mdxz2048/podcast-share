"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

type Source = {
  id: string;
  name: string;
  enabled: boolean;
  authStatus: string;
  runPolicy: string;
  lastSuccessSyncAt: string | null;
  jobCount: number;
  inUse: boolean;
  activeJob: {
    id: string;
    status: string;
  } | null;
  stats: {
    programs: number;
    episodes: number;
    media: number;
    mediaBytes: number;
  };
  connector: {
    displayName: string;
    version: string;
    versionId: string;
  };
  schedule: {
    id: string;
    enabled: boolean;
    paused: boolean;
    scheduleType: string;
    intervalHours: number | null;
    nextRunAt: string | null;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastErrorAt: string | null;
  } | null;
};

type Job = {
  id: string;
  status: string;
  triggerType: string;
  discoveredPrograms: number;
  discoveredEpisodes: number;
  importedMedia: number;
  failedCount: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
};

type JobEvent = {
  created_at: string;
  event_type: string;
  level: string | null;
  message: string | null;
  payload_json?: Record<string, unknown> | null;
};

type ConnectorOption = {
  id: string;
  displayName: string;
  status: string;
  latestVersion: string | null;
  latestVersionId: string | null;
};

export default function AdminSourcesPage() {
  const [items, setItems] = useState<Source[]>([]);
  const [connectors, setConnectors] = useState<ConnectorOption[]>([]);
  const [name, setName] = useState("默认 Source");
  const [connectorVersionId, setConnectorVersionId] = useState("");
  const [message, setMessage] = useState("加载中...");
  const [expandedSourceId, setExpandedSourceId] = useState("");
  const [jobsBySource, setJobsBySource] = useState<Record<string, Job[]>>({});
  const [logJob, setLogJob] = useState<{ id: string; status: string; events: JobEvent[] } | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalFullscreen, setTerminalFullscreen] = useState(false);
  const [activeJobId, setActiveJobId] = useState("");
  const [activeJobStatus, setActiveJobStatus] = useState("");
  const [terminalLine, setTerminalLine] = useState("");
  const [jobEvents, setJobEvents] = useState<JobEvent[]>([]);
  const [settingsSource, setSettingsSource] = useState<Source | null>(null);
  const [runMode, setRunMode] = useState<"manual" | "scheduled">("manual");
  const [intervalHours, setIntervalHours] = useState(6);
  const terminalBodyRef = useRef<HTMLDivElement | null>(null);
  const terminalInputRef = useRef<HTMLTextAreaElement | null>(null);

  function focusTerminalInput() {
    terminalInputRef.current?.focus();
  }

  function parseShellLiteral(value: string): unknown {
    const lower = value.toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
    if (lower === "null") return null;
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && value.trim() !== "") return numeric;
    return value;
  }

  function parseTerminalLineToInput(line: string): Record<string, unknown> {
    const trimmed = line.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, unknown>;
      return { input: parsed };
    } catch {
      const assignment = trimmed.match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.+)$/);
      if (assignment) {
        return { [assignment[1]]: parseShellLiteral(assignment[2]) };
      }
      return { input: trimmed };
    }
  }

  async function load() {
    const res = await fetch(`${apiBase}/admin/sources`, { credentials: "include" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "加载失败");
      return;
    }
    setItems(json.items ?? []);
    setMessage("");
  }

  async function loadConnectors() {
    const res = await fetch(`${apiBase}/admin/connectors`, { credentials: "include" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "Connector 列表加载失败");
      return;
    }

    const options = (json.items ?? []).filter(
      (item: ConnectorOption) => item.latestVersionId && item.status === "enabled"
    );
    setConnectors(options);
    if (!connectorVersionId && options.length > 0) {
      setConnectorVersionId(options[0].latestVersionId as string);
    }
  }

  useEffect(() => {
    void Promise.all([load(), loadConnectors()]);
  }, []);

  async function toggleEnabled(sourceId: string, nextEnabled: boolean) {
    const endpoint = nextEnabled ? "enable" : "disable";
    const res = await fetch(`${apiBase}/admin/sources/${sourceId}/${endpoint}`, {
      method: "POST",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "操作成功" : "操作失败"));
    await load();
  }

  async function loadSourceJobs(sourceId: string) {
    const res = await fetch(`${apiBase}/admin/jobs?sourceId=${sourceId}`, { credentials: "include" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "运行记录加载失败");
      return;
    }
    setJobsBySource((current) => ({ ...current, [sourceId]: json.items ?? [] }));
  }

  async function toggleSourceJobs(sourceId: string) {
    const next = expandedSourceId === sourceId ? "" : sourceId;
    setExpandedSourceId(next);
    if (next && !jobsBySource[next]) {
      await loadSourceJobs(next);
    }
  }

  async function openJobLog(jobId: string) {
    const res = await fetch(`${apiBase}/admin/jobs/${jobId}`, { credentials: "include" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "运行日志加载失败");
      return;
    }
    setLogJob({ id: jobId, status: json.status ?? "", events: json.events ?? [] });
  }

  async function loadJob(jobId: string) {
    const res = await fetch(`${apiBase}/admin/jobs/${jobId}`, { credentials: "include" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "任务详情加载失败");
      return;
    }
    setActiveJobStatus(json.status ?? "");
    setJobEvents(json.events ?? []);
    return json as { status?: string; events?: JobEvent[] };
  }

  async function openJobTerminal(jobId: string, status = "") {
    setActiveJobId(jobId);
    setActiveJobStatus(status);
    setTerminalOpen(true);
    await loadJob(jobId);
  }

  async function openActiveJobTerminalForSource(sourceId: string, attempts = 6, waitMs = 1000) {
    for (let i = 0; i < attempts; i += 1) {
      const res = await fetch(`${apiBase}/admin/jobs?sourceId=${sourceId}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok) {
        const active = (json.items ?? []).find((job: Job) =>
          ["queued", "running", "waiting_for_input", "waiting_for_auth"].includes(job.status)
        );
        if (active) {
          await openJobTerminal(active.id, active.status);
          return true;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    return false;
  }

  async function runSourceNow(source: Source) {
    if (source.activeJob) {
      await openJobTerminal(source.activeJob.id, source.activeJob.status);
      return;
    }

    setMessage("正在创建同步任务并连接运行终端...");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${apiBase}/admin/sources/${source.id}/run`, {
        method: "POST",
        credentials: "include",
        signal: controller.signal
      });
      const json = await res.json();
      if (!res.ok) {
        const text = String(json.message ?? "");
        if (res.status === 400 && text.includes("running job")) {
          const opened = await openActiveJobTerminalForSource(source.id);
          if (opened) {
            setMessage("该 Source 已有运行中的任务，已为你打开运行终端。");
            return;
          }
        }
        setMessage(json.message ?? "运行失败");
        return;
      }
      setMessage(`同步任务已创建，Job ID: ${json.jobId}`);
      if (json.jobId) {
        await openJobTerminal(json.jobId, json.status ?? "");
      }
      await load();
      if (expandedSourceId === source.id) {
        await loadSourceJobs(source.id);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        const opened = await openActiveJobTerminalForSource(source.id);
        if (opened) {
          setMessage("同步任务已创建，正在显示实时输出...");
          return;
        }
        await load();
        setMessage("同步任务可能已创建，但暂未检索到运行中的 Job，请稍后重试。");
        return;
      }
      setMessage(error instanceof Error ? error.message : "运行失败");
    } finally {
      clearTimeout(timeout);
    }
  }

  async function submitJobInput(text: string) {
    if (!activeJobId) {
      setMessage("当前没有可提交输入的任务");
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;

    const res = await fetch(`${apiBase}/admin/jobs/${activeJobId}/submit-input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ input: parseTerminalLineToInput(trimmed) })
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "输入已提交" : "提交失败"));
    if (res.ok) {
      setTerminalLine("");
      await loadJob(activeJobId);
    }
  }

  useEffect(() => {
    if (!terminalOpen || !activeJobId) return;
    const timer = setInterval(async () => {
      await loadJob(activeJobId);
    }, 2000);
    return () => clearInterval(timer);
  }, [terminalOpen, activeJobId]);

  useEffect(() => {
    if (terminalOpen) focusTerminalInput();
  }, [terminalOpen]);

  useEffect(() => {
    const view = terminalBodyRef.current;
    if (view) view.scrollTop = view.scrollHeight;
  }, [jobEvents, terminalLine]);

  function formatTime(value: string | null) {
    if (!value) {
      return "-";
    }
    return new Date(value).toLocaleString();
  }

  function formatShortTime(value: string | null) {
    if (!value) {
      return "-";
    }
    return new Date(value).toLocaleString(undefined, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function scheduleIntervalHours(source: Source) {
    if (!source.schedule) return 6;
    if (source.schedule.scheduleType === "interval_hours" && source.schedule.intervalHours) {
      return source.schedule.intervalHours;
    }
    if (source.schedule.scheduleType === "hourly") return 1;
    if (source.schedule.scheduleType === "every_6_hours") return 6;
    if (source.schedule.scheduleType === "daily") return 24;
    if (source.schedule.scheduleType === "weekly") return 168;
    return 6;
  }

  function runModeLabel(source: Source) {
    if (source.runPolicy !== "scheduled_allowed" || !source.schedule?.enabled) {
      return "手动";
    }
    const label = `每 ${scheduleIntervalHours(source)} 小时`;
    return source.schedule.paused ? `${label}（已暂停）` : label;
  }

  function sourceDots(source: Source) {
    return [
      {
        label: source.enabled ? "已启用" : "已停用",
        className: source.enabled ? "bg-emerald-500" : "bg-slate-300"
      },
      {
        label: source.inUse && source.activeJob ? `运行中：${source.activeJob.status}` : "空闲",
        className: source.inUse ? "bg-amber-500" : "bg-sky-500"
      },
      {
        label: runModeLabel(source),
        className: source.runPolicy === "scheduled_allowed" && source.schedule?.enabled && !source.schedule.paused ? "bg-violet-500" : "bg-slate-300"
      }
    ];
  }

  function openRunSettings(source: Source) {
    setSettingsSource(source);
    setRunMode(source.runPolicy === "scheduled_allowed" && source.schedule?.enabled ? "scheduled" : "manual");
    setIntervalHours(scheduleIntervalHours(source));
  }

  function estimatedNextRun() {
    return formatShortTime(new Date(Date.now() + intervalHours * 60 * 60 * 1000).toISOString());
  }

  async function saveRunSettings() {
    if (!settingsSource) return;
    const res = await fetch(`${apiBase}/admin/sources/${settingsSource.id}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(
        runMode === "manual"
          ? { scheduleType: "manual", enabled: false }
          : { scheduleType: "interval_hours", intervalHours, enabled: true }
      )
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "运行设置已保存" : "保存失败"));
    if (res.ok) {
      setSettingsSource(null);
      await load();
    }
  }

  function formatLogLine(event: JobEvent) {
    const message = event.message ?? "";
    if (event.event_type === "runner_stdout" || event.event_type === "runner_stderr") {
      try {
        const parsed = JSON.parse(message) as { message?: unknown };
        if (typeof parsed.message === "string") {
          return parsed.message;
        }
      } catch {
        // Keep raw script output.
      }
      return message;
    }

    if (event.event_type === "log" || event.event_type === "job_log" || event.event_type === "runner_setup") {
      return message;
    }

    return `[${event.event_type}] ${message}`.trim();
  }

  function isRunnerOutput(event: JobEvent) {
    return event.event_type === "runner_stdout" || event.event_type === "runner_stderr";
  }

  function renderTextEvent(event: JobEvent, index: number) {
    const line = formatLogLine(event);
    return (
      <p
        className={`font-mono tracking-normal ${
          isRunnerOutput(event) ? "w-max whitespace-pre leading-none" : "whitespace-pre-wrap leading-5"
        }`}
        key={`${event.created_at}-${index}`}
      >
        {line}
      </p>
    );
  }

  function renderQrImageEvent(event: JobEvent, index: number) {
    const connectorEvent = event.payload_json?.connectorEvent as { image_data_url?: unknown } | undefined;
    const imageDataUrl =
      typeof event.payload_json?.image_data_url === "string"
        ? event.payload_json.image_data_url
        : typeof connectorEvent?.image_data_url === "string"
          ? connectorEvent.image_data_url
          : "";

    if (!imageDataUrl) {
      return renderTextEvent(event, index);
    }

    return (
      <div className="my-2 w-max rounded-md bg-white p-4 text-slate-950" key={`${event.created_at}-${index}`}>
        <p className="mb-2 text-sm font-medium">{event.message ?? "Scan this QR code with WeChat."}</p>
        <img alt={event.message ?? "QR code"} className="block h-auto w-[360px] max-w-none bg-white" src={imageDataUrl} />
      </div>
    );
  }

  function renderTerminalEvents() {
    const nodes: ReactNode[] = [];
    jobEvents.forEach((event, index) => {
      if (event.event_type === "qr_image") {
        nodes.push(renderQrImageEvent(event, index));
      } else {
        nodes.push(renderTextEvent(event, index));
      }
    });
    return nodes;
  }

  async function deleteSource(sourceId: string, sourceName: string) {
    if (!confirm(`确认删除 Source「${sourceName}」吗？`)) {
      return;
    }

    const res = await fetch(`${apiBase}/admin/sources/${sourceId}`, {
      method: "DELETE",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "Source 已删除" : "删除失败"));
    await load();
  }

  async function createSource() {
    if (!connectorVersionId) {
      setMessage("请先选择一个可用 Connector");
      return;
    }

    const res = await fetch(`${apiBase}/admin/sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        connectorVersionId,
        name,
        inputConfig: {},
        secretConfig: {},
        runPolicy: "manual_only"
      })
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "创建失败");
      return;
    }
    setMessage("Source 创建成功");
    await load();
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Source 管理</h1>
        <p className="mt-1 text-sm text-muted">Source 保存 Connector 的运行配置，并承载它导入出的节目、单集和音频。</p>
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="card space-y-3">
        <h2 className="text-base font-medium">创建 Source</h2>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Source 名称" />
        <select
          className="input"
          value={connectorVersionId}
          onChange={(event) => setConnectorVersionId(event.target.value)}
        >
          <option value="">请选择 Connector</option>
          {connectors.map((item) => (
            <option key={item.id} value={item.latestVersionId ?? ""}>
              {item.displayName}（{item.latestVersion ?? "-"}）
            </option>
          ))}
        </select>
        <p className="break-all text-xs text-muted">
          已选 Connector Version ID：{connectorVersionId || "-"}
        </p>
        <button className="button" onClick={createSource}>
          创建
        </button>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <article className="card space-y-4" key={item.id}>
            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_auto]">
              <div className="space-y-3">
                <div>
                  <h2 className="text-base font-medium">{item.name}</h2>
                  <p className="mt-1 text-xs text-muted">
                    {item.connector.displayName} / {item.connector.version}
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                  {sourceDots(item).map((dot) => (
                    <span className="inline-flex items-center gap-1.5" key={dot.label}>
                      <span className={`h-2 w-2 rounded-full ${dot.className}`} />
                      {dot.label}
                    </span>
                  ))}
                </div>
                <div className="space-y-1 text-xs text-muted">
                  <p>下次运行：{item.runPolicy === "scheduled_allowed" && item.schedule?.enabled && !item.schedule.paused ? formatShortTime(item.schedule.nextRunAt) : "-"}</p>
                  <p>上次成功：{formatShortTime(item.lastSuccessSyncAt ?? item.schedule?.lastSuccessAt ?? null)}</p>
                  <p>认证：{item.authStatus} / 历史任务：{item.jobCount}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded border border-line p-3">
                  <p className="text-lg font-semibold">{item.stats?.programs ?? 0}</p>
                  <p className="text-xs text-muted">节目</p>
                </div>
                <div className="rounded border border-line p-3">
                  <p className="text-lg font-semibold">{item.stats?.episodes ?? 0}</p>
                  <p className="text-xs text-muted">单集</p>
                </div>
                <div className="rounded border border-line p-3">
                  <p className="text-lg font-semibold">{item.stats?.media ?? 0}</p>
                  <p className="text-xs text-muted">音频</p>
                </div>
                <div className="rounded border border-line p-3">
                  <p className="text-lg font-semibold">{formatBytes(item.stats?.mediaBytes ?? 0)}</p>
                  <p className="text-xs text-muted">大小</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  className="button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={item.enabled}
                  onClick={() => toggleEnabled(item.id, true)}
                >
                  启用
                </button>
                <button
                  className="button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!item.enabled || item.inUse}
                  onClick={() => toggleEnabled(item.id, false)}
                  title={item.inUse ? "Source 正在运行，不能停用" : !item.enabled ? "Source 已停用" : "停用 Source"}
                >
                  停用
                </button>
                <button
                  className="button disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!item.enabled || (item.inUse && !item.activeJob)}
                  onClick={() => runSourceNow(item)}
                  title={!item.enabled ? "Source 已停用，请先启用" : item.activeJob ? "查看当前运行终端" : "立即运行并打开终端"}
                >
                  {item.activeJob ? "查看终端" : "立即同步"}
                </button>
                <button className="button-secondary" onClick={() => openRunSettings(item)}>
                  运行设置
                </button>
                <button
                  className="button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={item.inUse}
                  onClick={() => deleteSource(item.id, item.name)}
                  title={item.inUse ? "Source 有活动任务，不能删除" : "删除 Source"}
                >
                  删除
                </button>
                <button className="text-left text-sm text-accent" onClick={() => toggleSourceJobs(item.id)}>
                  {expandedSourceId === item.id ? "收起运行记录" : "查看运行记录"}
                </button>
              </div>
            </div>

            {expandedSourceId === item.id ? (
              <div className="rounded border border-line">
                <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.8fr_auto] gap-3 border-b border-line bg-slate-50 px-3 py-2 text-xs text-muted">
                  <span>运行时间</span>
                  <span>触发</span>
                  <span>状态</span>
                  <span>导入结果</span>
                  <span>日志</span>
                </div>
                <div className="max-h-80 divide-y divide-line overflow-auto">
                  {(jobsBySource[item.id] ?? []).map((job) => (
                    <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.8fr_auto] gap-3 px-3 py-2 text-sm" key={job.id}>
                      <div>
                        <p>{formatTime(job.startedAt ?? job.createdAt)}</p>
                        <p className="break-all text-xs text-muted">{job.id}</p>
                      </div>
                      <span>{job.triggerType}</span>
                      <span>{job.status}</span>
                      <span className="text-xs text-muted">
                        单集 {job.discoveredEpisodes} / 音频 {job.importedMedia} / 失败 {job.failedCount}
                      </span>
                      <button className="text-sm text-accent" onClick={() => openJobLog(job.id)}>
                        查看运行日志
                      </button>
                    </div>
                  ))}
                  {(jobsBySource[item.id] ?? []).length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted">暂无运行记录</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {logJob ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="h-[86vh] w-full max-w-6xl rounded-lg border border-line bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-medium">运行日志</h2>
                <p className="mt-1 break-all text-xs text-muted">Job ID：{logJob.id} / 状态：{logJob.status}</p>
              </div>
              <button className="button-secondary" onClick={() => setLogJob(null)}>
                关闭
              </button>
            </div>
            <div className="h-[74vh] overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
              {logJob.events.length === 0 ? <p className="text-slate-300">暂无输出...</p> : null}
              {logJob.events.map((event, index) => (
                <p className="whitespace-pre-wrap font-mono leading-5" key={`${event.created_at}-${index}`}>
                  {formatLogLine(event)}
                </p>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {settingsSource ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-lg rounded-lg border border-line bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-medium">运行设置</h2>
                <p className="mt-1 text-xs text-muted">{settingsSource.name}</p>
              </div>
              <button className="button-secondary" onClick={() => setSettingsSource(null)}>
                关闭
              </button>
            </div>

            <div className="space-y-4">
              <label className="flex cursor-pointer items-start gap-3 rounded border border-line p-3">
                <input
                  checked={runMode === "manual"}
                  className="mt-1"
                  name="run-mode"
                  onChange={() => setRunMode("manual")}
                  type="radio"
                />
                <span>
                  <span className="block text-sm font-medium">手动触发</span>
                  <span className="mt-1 block text-xs text-muted">只在点击“立即同步”时运行。</span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded border border-line p-3">
                <input
                  checked={runMode === "scheduled"}
                  className="mt-1"
                  name="run-mode"
                  onChange={() => setRunMode("scheduled")}
                  type="radio"
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium">定时同步</span>
                  <span className="mt-1 block text-xs text-muted">按固定小时间隔自动运行。</span>
                  {runMode === "scheduled" ? (
                    <span className="mt-3 grid gap-2">
                      <span className="text-xs text-muted">同步间隔</span>
                      <span className="flex items-center gap-2">
                        <input
                          className="input w-28"
                          max={168}
                          min={1}
                          onChange={(event) => setIntervalHours(Math.min(168, Math.max(1, Number(event.target.value) || 1)))}
                          type="number"
                          value={intervalHours}
                        />
                        <span className="text-sm">小时</span>
                      </span>
                      <span className="text-xs text-muted">下次运行预计：{estimatedNextRun()}</span>
                    </span>
                  ) : null}
                </span>
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className="button-secondary" onClick={() => setSettingsSource(null)}>
                取消
              </button>
              <button className="button" onClick={saveRunSettings}>
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {terminalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div
            className={`w-full rounded-lg border border-line bg-white p-4 shadow-xl ${
              terminalFullscreen ? "h-[98vh] max-w-none" : "h-[90vh] max-w-6xl"
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-medium">Connector 运行终端</h2>
              <div className="flex gap-2">
                <button className="button-secondary" onClick={() => setTerminalFullscreen((prev) => !prev)}>
                  {terminalFullscreen ? "退出全屏" : "全屏"}
                </button>
                <button className="button-secondary" onClick={() => setTerminalOpen(false)}>
                  关闭
                </button>
              </div>
            </div>
            <p className="mb-2 text-xs text-muted">Job ID: {activeJobId || "-"}</p>
            <p className="mb-3 text-xs text-muted">状态: {activeJobStatus || "-"}</p>

            <div
              ref={terminalBodyRef}
              tabIndex={0}
              className={`relative mb-3 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100 outline-none ${
                terminalFullscreen ? "h-[86vh]" : "h-[64vh]"
              }`}
              onClick={focusTerminalInput}
            >
              <textarea
                ref={terminalInputRef}
                value={terminalLine}
                onChange={(event) => setTerminalLine(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const line = terminalLine;
                    setTerminalLine("");
                    void submitJobInput(line);
                  }
                }}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="absolute left-0 top-0 h-px w-px opacity-0"
              />
              {jobEvents.length === 0 ? <p className="text-slate-300">暂无输出...</p> : null}
              {renderTerminalEvents()}
              <p className="w-max whitespace-pre font-mono leading-none text-emerald-300">
                $ {terminalLine}
                <span className="animate-pulse">_</span>
              </p>
            </div>

            <div className="flex gap-2">
              <button className="button-secondary" onClick={() => activeJobId && loadJob(activeJobId)}>
                刷新日志
              </button>
              <p className="text-xs text-muted">点击黑色终端区域后可直接输入，按回车发送。</p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
