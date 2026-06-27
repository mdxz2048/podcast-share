"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type Source = {
  id: string;
  name: string;
  enabled: boolean;
  authStatus: string;
  connector: {
    displayName: string;
    version: string;
    versionId: string;
  };
};

export default function AdminSourcesPage() {
  const [items, setItems] = useState<Source[]>([]);
  const [name, setName] = useState("默认 Source");
  const [connectorVersionId, setConnectorVersionId] = useState("");
  const [message, setMessage] = useState("加载中...");

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

  useEffect(() => {
    load();
  }, []);

  async function createSource() {
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
      <h1 className="text-2xl font-semibold">Source 列表</h1>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="card space-y-3">
        <h2 className="text-base font-medium">创建 Source</h2>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Source 名称" />
        <input
          className="input"
          value={connectorVersionId}
          onChange={(event) => setConnectorVersionId(event.target.value)}
          placeholder="Connector Version ID"
        />
        <button className="button" onClick={createSource}>
          创建
        </button>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <article className="card flex items-center justify-between" key={item.id}>
            <div>
              <h2 className="text-base font-medium">{item.name}</h2>
              <p className="text-xs text-muted">Connector：{item.connector.displayName}</p>
              <p className="text-xs text-muted">版本：{item.connector.version}</p>
              <p className="text-xs text-muted">认证状态：{item.authStatus}</p>
              <p className="text-xs text-muted">启用状态：{item.enabled ? "已启用" : "未启用"}</p>
            </div>
            <Link className="text-sm text-accent" href={`/admin/sources/${item.id}`}>
              配置
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
