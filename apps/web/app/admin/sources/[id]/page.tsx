"use client";

import { useEffect, useRef, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export default function AdminSourceDetailPage({ params }: { params: { id: string } }) {
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [scheduleId, setScheduleId] = useState("");
  const [scheduleType, setScheduleType] = useState("hourly");
  const [schedulePaused, setSchedulePaused] = useState(false);
  const [authMode, setAuthMode] = useState("manual_otp");
  const [authInputText, setAuthInputText] = useState('{"otp":""}');
  const [inputConfigText, setInputConfigText] = useState("{}");
  const [secretConfigText, setSecretConfigText] = useState("{}");
  const [message, setMessage] = useState("加载中...");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState("");
  const [activeJobStatus, setActiveJobStatus] = useState("");
  const [terminalLine, setTerminalLine] = useState("");
  const [jobEvents, setJobEvents] = useState<
    Array<{
      created_at: string;
      event_type: string;
      level: string | null;
      message: string | null;
      payload_json?: Record<string, unknown> | null;
    }>
  >([]);
  const terminalBodyRef = useRef<HTMLDivElement | null>(null);
  const terminalInputRef = useRef<HTMLTextAreaElement | null>(null);
  const autoResumeAttemptedRef = useRef<Set<string>>(new Set());

  function focusTerminalInput() {
    terminalInputRef.current?.focus();
  }

  function parseShellLiteral(value: string): unknown {
    const lower = value.toLowerCase();
    if (lower === "true") {
      return true;
    }
    if (lower === "false") {
      return false;
    }
    if (lower === "null") {
      return null;
    }
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && value.trim() !== "") {
      return numeric;
    }
    return value;
  }

  function parseTerminalLineToInput(line: string): Record<string, unknown> {
    const trimmed = line.trim();
    if (!trimmed) {
      return {};
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
      return { input: parsed };
    } catch {
      const assignment = trimmed.match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.+)$/);
      if (assignment) {
        const key = assignment[1];
        const value = assignment[2];
        return { [key]: parseShellLiteral(value) };
      }
      return { input: trimmed };
    }
  }

  async function openActiveJobTerminal() {
    const res = await fetch(`${apiBase}/admin/jobs`, { credentials: "include" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "任务列表加载失败");
      return false;
    }

    const active = (json.items ?? []).find(
      (item: { id: string; status: string; source?: { id?: string } }) =>
        item.source?.id === params.id && ["queued", "running", "waiting_for_input", "waiting_for_auth"].includes(item.status)
    );

    if (!active) {
      setMessage("当前没有运行中的任务");
      return false;
    }

    setActiveJobId(active.id);
    setActiveJobStatus(active.status ?? "");
    setTerminalOpen(true);
    await loadJob(active.id);
    return true;
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
    return json as {
      status?: string;
      events?: Array<{ event_type?: string }>;
    };
  }

  async function autoResumeQrIfNeeded(jobId: string, jobDetail?: { status?: string; events?: Array<{ event_type?: string }> }) {
    if (autoResumeAttemptedRef.current.has(jobId)) {
      return;
    }

    const detail =
      jobDetail ??
      ((await loadJob(jobId)) as {
        status?: string;
        events?: Array<{ event_type?: string }>;
      });

    const waitingForAuth = detail?.status === "waiting_for_auth";
    const hasAuthRequired = (detail?.events ?? []).some((event) => event?.event_type === "auth_required");
    if (!waitingForAuth || !hasAuthRequired) {
      return;
    }

    autoResumeAttemptedRef.current.add(jobId);
    const res = await fetch(`${apiBase}/admin/jobs/${jobId}/submit-input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ input: { qr_confirmed: true } })
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "自动确认扫码失败，请手动输入 qr_confirmed=true");
      return;
    }

    setMessage("已自动提交 qr_confirmed=true，任务继续执行中...");
    await loadJob(jobId);
  }

  async function load() {
    const res = await fetch(`${apiBase}/admin/sources/${params.id}`, { credentials: "include" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "加载失败");
      return;
    }

    setName(json.name ?? "");
    setEnabled(Boolean(json.enabled));
    setInputConfigText(JSON.stringify(json.inputConfig ?? {}, null, 2));
    setScheduleId(json.schedule?.id ?? "");
    setScheduleType(json.schedule?.schedule_type ?? "hourly");
    setSchedulePaused(Boolean(json.schedule?.paused));
    setMessage("");
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function save() {
    let inputConfig: Record<string, unknown>;
    let secretConfig: Record<string, string>;
    try {
      inputConfig = JSON.parse(inputConfigText);
      secretConfig = JSON.parse(secretConfigText);
    } catch {
      setMessage("配置 JSON 格式错误");
      return;
    }

    const res = await fetch(`${apiBase}/admin/sources/${params.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, inputConfig, secretConfig })
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "已保存" : "保存失败"));
    await load();
  }

  async function toggleEnabled(nextEnabled: boolean) {
    const endpoint = nextEnabled ? "enable" : "disable";
    const res = await fetch(`${apiBase}/admin/sources/${params.id}/${endpoint}`, {
      method: "POST",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "操作成功" : "操作失败"));
    await load();
  }

  async function deleteSource() {
    if (!confirm(`确认删除 Source「${name || params.id}」吗？`)) {
      return;
    }

    const res = await fetch(`${apiBase}/admin/sources/${params.id}`, {
      method: "DELETE",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "删除成功" : "删除失败"));
    if (res.ok) {
      window.location.href = "/admin/sources";
    }
  }

  async function runNow() {
    const res = await fetch(`${apiBase}/admin/sources/${params.id}/run`, {
      method: "POST",
      credentials: "include"
    });
    const json = await res.json();
    if (!res.ok) {
      const text = String(json.message ?? "运行失败");
      if (res.status === 400 && text.includes("running job")) {
        const opened = await openActiveJobTerminal();
        if (opened) {
          setMessage("该 Source 已有运行中的任务，已为你打开运行终端。");
          return;
        }
      }
      setMessage(json.message ?? "运行失败");
      return;
    }
    setMessage(`任务已执行，状态：${json.status}，Job ID: ${json.jobId}`);
    setActiveJobId(json.jobId ?? "");
    setActiveJobStatus(json.status ?? "");
    setTerminalOpen(true);
    if (json.jobId) {
      const detail = await loadJob(json.jobId);
      await autoResumeQrIfNeeded(json.jobId, detail);
    }
  }

  async function submitJobInput(text: string) {
    if (!activeJobId) {
      setMessage("当前没有可提交输入的任务");
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const input = parseTerminalLineToInput(trimmed);

    const res = await fetch(`${apiBase}/admin/jobs/${activeJobId}/submit-input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ input })
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "输入已提交" : "提交失败"));
    if (res.ok) {
      setTerminalLine("");
      await loadJob(activeJobId);
    }
  }

  useEffect(() => {
    if (!terminalOpen || !activeJobId) {
      return;
    }

    const timer = setInterval(async () => {
      await loadJob(activeJobId);
    }, 2000);

    return () => clearInterval(timer);
  }, [terminalOpen, activeJobId]);

  useEffect(() => {
    if (!terminalOpen) {
      return;
    }
    focusTerminalInput();
  }, [terminalOpen]);

  useEffect(() => {
    const view = terminalBodyRef.current;
    if (!view) {
      return;
    }
    view.scrollTop = view.scrollHeight;
  }, [jobEvents, terminalLine]);

  function formatEventLine(event: {
    created_at: string;
    event_type: string;
    level: string | null;
    message: string | null;
  }): string {
    const ts = event.created_at ? `[${event.created_at}]` : "";
    const typ = event.event_type ? `[${event.event_type}]` : "";
    const lvl = event.level ? `[${event.level}]` : "";
    const msg = event.message ?? "";
    return `${ts}${typ}${lvl} ${msg}`.trim();
  }

  async function updateAuthProfile() {
    const res = await fetch(`${apiBase}/admin/sources/${params.id}/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ mode: authMode, unattendedReady: true })
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "认证方式已更新" : "更新失败"));
  }

  async function submitAuthInput() {
    let input: Record<string, string>;
    try {
      input = JSON.parse(authInputText);
    } catch {
      setMessage("认证输入 JSON 格式错误");
      return;
    }

    const res = await fetch(`${apiBase}/admin/sources/${params.id}/auth/submit-input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ input })
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "认证输入已提交" : "提交失败"));
    await load();
  }

  async function saveSchedule() {
    const res = await fetch(`${apiBase}/admin/sources/${params.id}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ scheduleType, enabled: true })
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "保存周期任务失败");
      return;
    }
    setMessage("周期任务已保存");
    await load();
  }

  async function toggleSchedulePaused() {
    if (!scheduleId) {
      setMessage("请先保存周期任务");
      return;
    }
    const endpoint = schedulePaused ? "resume" : "pause";
    const res = await fetch(`${apiBase}/admin/schedules/${scheduleId}/${endpoint}`, {
      method: "POST",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "操作成功" : "操作失败"));
    await load();
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Source 配置</h1>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="card space-y-3">
        <label className="text-sm">Source 名称</label>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} />

        <label className="text-sm">公开输入参数 JSON</label>
        <textarea className="input min-h-32" value={inputConfigText} onChange={(event) => setInputConfigText(event.target.value)} />

        <label className="text-sm">敏感参数 JSON（仅填写新增或更新项）</label>
        <textarea className="input min-h-32" value={secretConfigText} onChange={(event) => setSecretConfigText(event.target.value)} />

        <div className="flex gap-3">
          <button className="button" onClick={save}>
            保存配置
          </button>
          <button className="button" onClick={runNow}>
            立即运行
          </button>
          <button className="button-secondary" onClick={openActiveJobTerminal}>
            打开运行终端
          </button>
          <button className="button" onClick={() => toggleEnabled(!enabled)}>
            {enabled ? "禁用 Source" : "启用 Source"}
          </button>
          <button className="button-secondary" onClick={deleteSource}>
            删除 Source
          </button>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="text-base font-medium">认证配置</h2>
        <input className="input" value={authMode} onChange={(event) => setAuthMode(event.target.value)} placeholder="认证模式" />
        <textarea className="input min-h-24" value={authInputText} onChange={(event) => setAuthInputText(event.target.value)} />
        <div className="flex gap-3">
          <button className="button" onClick={updateAuthProfile}>
            更新认证模式
          </button>
          <button className="button" onClick={submitAuthInput}>
            提交认证输入
          </button>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="text-base font-medium">周期任务</h2>
        <select className="input" value={scheduleType} onChange={(event) => setScheduleType(event.target.value)}>
          <option value="hourly">每小时</option>
          <option value="every_6_hours">每 6 小时</option>
          <option value="daily">每天</option>
          <option value="weekly">每周</option>
          <option value="cron">自定义 Cron（v1 简化）</option>
        </select>
        <div className="flex gap-3">
          <button className="button" onClick={saveSchedule}>
            保存周期任务
          </button>
          <button className="button" onClick={toggleSchedulePaused}>
            {schedulePaused ? "恢复周期任务" : "暂停周期任务"}
          </button>
        </div>
      </div>

      {terminalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="h-[90vh] w-full max-w-6xl rounded-lg border border-line bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-medium">Connector 运行终端</h2>
              <button className="button-secondary" onClick={() => setTerminalOpen(false)}>
                关闭
              </button>
            </div>
            <p className="mb-2 text-xs text-muted">Job ID: {activeJobId || "-"}</p>
            <p className="mb-3 text-xs text-muted">状态: {activeJobStatus || "-"}</p>

            <div
              ref={terminalBodyRef}
              tabIndex={0}
              className="relative mb-3 h-[64vh] overflow-y-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100 outline-none"
              onClick={focusTerminalInput}
            >
              <textarea
                ref={terminalInputRef}
                value={terminalLine}
                onChange={(event) => setTerminalLine(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) {
                    return;
                  }
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
              {jobEvents.map((event, index) => (
                <p className="whitespace-pre-wrap font-mono" key={`${event.created_at}-${index}`}>
                  {formatEventLine(event)}
                </p>
              ))}
              <p className="font-mono text-emerald-300">$ {terminalLine}<span className="animate-pulse">_</span></p>
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
