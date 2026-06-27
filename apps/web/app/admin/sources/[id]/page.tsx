"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function AdminSourceDetailPage({ params }: { params: { id: string } }) {
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(false);
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
          <button className="button" onClick={() => toggleEnabled(!enabled)}>
            {enabled ? "禁用 Source" : "启用 Source"}
          </button>
        </div>
      </div>
    </section>
  );
}
