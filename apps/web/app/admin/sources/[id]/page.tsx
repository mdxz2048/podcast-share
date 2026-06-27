"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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

  async function runNow() {
    const res = await fetch(`${apiBase}/admin/sources/${params.id}/run`, {
      method: "POST",
      credentials: "include"
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "运行失败");
      return;
    }
    setMessage(`任务已执行，状态：${json.status}，Job ID: ${json.jobId}`);
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
          <button className="button" onClick={() => toggleEnabled(!enabled)}>
            {enabled ? "禁用 Source" : "启用 Source"}
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
    </section>
  );
}
