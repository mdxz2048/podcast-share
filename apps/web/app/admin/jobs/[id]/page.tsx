"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type JobEvent = {
  event_type: string;
  level: string | null;
  message: string | null;
  created_at: string;
};

export default function AdminJobDetailPage({ params }: { params: { id: string } }) {
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState("");
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [inputText, setInputText] = useState('{"otp":""}');
  const [message, setMessage] = useState("加载中...");

  async function load() {
    const res = await fetch(`${apiBase}/admin/jobs/${params.id}`, { credentials: "include" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "加载失败");
      return;
    }

    setStatus(json.status ?? "");
    setSummary(`programs=${json.discoveredPrograms}, episodes=${json.discoveredEpisodes}, media=${json.importedMedia}, failed=${json.failedCount}`);
    setEvents(json.events ?? []);
    setMessage("");
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function cancelJob() {
    const res = await fetch(`${apiBase}/admin/jobs/${params.id}/cancel`, {
      method: "POST",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "已取消" : "取消失败"));
    await load();
  }

  async function submitInput() {
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(inputText);
    } catch {
      setMessage("输入 JSON 格式错误");
      return;
    }

    const res = await fetch(`${apiBase}/admin/jobs/${params.id}/submit-input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ input })
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "输入已提交" : "提交失败"));
    await load();
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">任务详情</h1>
      <p className="text-sm text-muted">状态：{status || "-"}</p>
      <p className="text-sm text-muted">摘要：{summary || "-"}</p>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <button className="button" onClick={cancelJob}>
        取消任务
      </button>

      <div className="card space-y-3">
        <h2 className="text-base font-medium">提交等待输入</h2>
        <textarea className="input min-h-24" value={inputText} onChange={(event) => setInputText(event.target.value)} />
        <button className="button" onClick={submitInput}>
          提交并恢复
        </button>
      </div>

      <div className="space-y-2">
        {events.map((event, index) => (
          <article className="card" key={`${event.created_at}-${index}`}>
            <p className="text-xs text-muted">{event.created_at}</p>
            <p className="text-sm">[{event.event_type}] {event.message ?? ""}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
