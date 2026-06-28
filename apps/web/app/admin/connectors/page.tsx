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
  latestVersionStatus?: string | null;
  sourceCount: number;
  inUse: boolean;
  sourceRefs: Array<{
    id: string;
    name: string;
    enabled: boolean;
    lastJobStatus: string | null;
    lastSuccessSyncAt: string | null;
  }>;
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
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Connector 管理</h1>
          <p className="mt-1 text-sm text-muted">上传、启用和治理 Connector。被 Source 使用中的 Connector 不能停用或删除。</p>
        </div>
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
          <article className="card grid gap-4 lg:grid-cols-[1.2fr_1fr_auto]" key={item.id}>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-medium">{item.displayName}</h2>
                <span className="rounded border border-line px-2 py-0.5 text-xs text-muted">{item.status}</span>
              </div>
              <p className="text-xs text-muted">{item.name}</p>
              <p className="break-all text-xs text-muted">Connector ID：{item.id}</p>
              <p className="text-xs text-muted">
                最新版本：{item.latestVersion ?? "-"} / 版本状态：{item.latestVersionStatus ?? "-"}
              </p>
            </div>

            <div className="rounded border border-line p-3">
              <p className="text-sm font-medium">{item.inUse ? `在用：${item.sourceCount} 个 Source` : "未被 Source 使用"}</p>
              <div className="mt-2 space-y-2">
                {item.sourceRefs.slice(0, 3).map((source) => (
                  <Link className="block rounded bg-slate-50 p-2 text-xs hover:text-accent" href={`/admin/sources/${source.id}`} key={source.id}>
                    <span className="font-medium">{source.name}</span>
                    <span className="ml-2 text-muted">{source.enabled ? "启用" : "停用"}</span>
                    <span className="ml-2 text-muted">最近任务：{source.lastJobStatus ?? "-"}</span>
                  </Link>
                ))}
                {item.sourceRefs.length > 3 ? <p className="text-xs text-muted">还有 {item.sourceRefs.length - 3} 个 Source</p> : null}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button className="button-secondary" onClick={() => enableConnector(item.id)}>
                启用
              </button>
              <button
                className="button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                disabled={item.inUse}
                onClick={() => disableConnector(item.id)}
                title={item.inUse ? "仍有 Source 使用，不能停用" : "停用 Connector"}
              >
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
