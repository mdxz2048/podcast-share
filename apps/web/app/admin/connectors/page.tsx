"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Connector = {
  id: string;
  name: string;
  displayName: string;
  status: string;
  latestVersionId?: string | null;
  latestVersion: string | null;
  sourceCount: number;
  inUse: boolean;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export default function AdminConnectorsPage() {
  const [items, setItems] = useState<Connector[]>([]);
  const [message, setMessage] = useState("加载中...");

  async function load() {
    const res = await fetch(`${apiBase}/admin/connectors`, { credentials: "include" });
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

  async function enableConnector(connectorId: string) {
    const res = await fetch(`${apiBase}/admin/connectors/${connectorId}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({})
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "Connector 已启用" : "操作失败"));
    await load();
  }

  async function disableConnector(connectorId: string) {
    const res = await fetch(`${apiBase}/admin/connectors/${connectorId}/disable`, {
      method: "POST",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "Connector 已禁用" : "操作失败"));
    await load();
  }

  async function deleteConnector(connectorId: string, displayName: string) {
    if (!confirm(`确认删除 Connector「${displayName}」吗？只有未被 Source 使用的 Connector 可以删除。`)) {
      return;
    }

    const res = await fetch(`${apiBase}/admin/connectors/${connectorId}`, {
      method: "DELETE",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "Connector 已删除" : "删除失败"));
    await load();
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Connector 列表</h1>
        <div className="flex gap-2">
          <Link className="button-secondary" href="/admin/connectors/packaging-guide">
            打包要求模板
          </Link>
          <Link className="button" href="/admin/connectors/upload">
            上传 ZIP
          </Link>
        </div>
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      <div className="space-y-3">
        {items.map((item) => (
          <article className="card flex items-center justify-between" key={item.id}>
            <div>
              <h2 className="text-base font-medium">{item.displayName}</h2>
              <p className="text-xs text-muted">{item.name}</p>
              <p className="break-all text-xs text-muted">Connector ID：{item.id}</p>
              <p className="text-xs text-muted">状态：{item.status}</p>
              <p className="text-xs text-muted">使用状态：{item.inUse ? `在用（${item.sourceCount} 个 Source）` : "未使用"}</p>
              <p className="text-xs text-muted">最新版本：{item.latestVersion ?? "-"}</p>
              <p className="break-all text-xs text-muted">最新版本 ID：{item.latestVersionId ?? "-"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="button-secondary" onClick={() => enableConnector(item.id)}>
                启用
              </button>
              <button className="button-secondary" onClick={() => disableConnector(item.id)}>
                停用
              </button>
              <button
                className="button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                disabled={item.inUse}
                onClick={() => deleteConnector(item.id, item.displayName)}
                title={item.inUse ? "仍有 Source 使用，不能删除" : "删除 Connector"}
              >
                删除
              </button>
              <Link className="text-sm text-accent" href={`/admin/connectors/${item.id}`}>
                查看详情
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
