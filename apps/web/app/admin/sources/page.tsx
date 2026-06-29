"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

  function formatTime(value: string | null) {
    if (!value) {
      return "-";
    }
    return new Date(value).toLocaleString();
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
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-medium">{item.name}</h2>
                  <span className={`rounded px-2 py-0.5 text-xs ${item.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-muted"}`}>
                    {item.enabled ? "已启用" : "已停用"}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs ${item.inUse ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-muted"}`}>
                    {item.inUse && item.activeJob ? `运行中：${item.activeJob.status}` : "空闲"}
                  </span>
                </div>
                <p className="text-xs text-muted">Connector：{item.connector.displayName}</p>
                <p className="text-xs text-muted">版本：{item.connector.version}</p>
                <p className="text-xs text-muted">认证状态：{item.authStatus}</p>
                <p className="text-xs text-muted">历史任务数：{item.jobCount}</p>
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
                  className="button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={item.inUse}
                  onClick={() => deleteSource(item.id, item.name)}
                  title={item.inUse ? "Source 有活动任务，不能删除" : "删除 Source"}
                >
                  删除
                </button>
                <Link className="text-sm text-accent" href={`/admin/sources/${item.id}`}>
                  配置
                </Link>
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
                <div className="divide-y divide-line">
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
    </section>
  );
}
