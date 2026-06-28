"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type Version = {
  id: string;
  version: string;
  status: string;
  sourceCount: number;
  inUse: boolean;
};

export default function AdminConnectorDetailPage({ params }: { params: { id: string } }) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [sourceCount, setSourceCount] = useState(0);
  const [inUse, setInUse] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [message, setMessage] = useState("加载中...");

  async function load() {
    const res = await fetch(`${apiBase}/admin/connectors/${params.id}`, { credentials: "include" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "加载失败");
      return;
    }
    setName(json.displayName);
    setStatus(json.status);
    setSourceCount(json.sourceCount ?? 0);
    setInUse(Boolean(json.inUse));
    setVersions((json.versions ?? []).map((item: any) => ({
      id: item.id,
      version: item.version,
      status: item.status,
      sourceCount: item.sourceCount ?? 0,
      inUse: Boolean(item.inUse)
    })));
    setMessage("");
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function approve(versionId?: string) {
    const res = await fetch(`${apiBase}/admin/connectors/${params.id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(versionId ? { connectorVersionId: versionId } : {})
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "已启用" : "操作失败"));
    await load();
  }

  async function disable() {
    const res = await fetch(`${apiBase}/admin/connectors/${params.id}/disable`, {
      method: "POST",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "已禁用" : "操作失败"));
    await load();
  }

  async function removeConnector() {
    if (!confirm(`确认删除 Connector「${name || params.id}」吗？只有未被 Source 使用的 Connector 可以删除。`)) {
      return;
    }

    const res = await fetch(`${apiBase}/admin/connectors/${params.id}`, {
      method: "DELETE",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "已删除" : "操作失败"));
    if (res.ok) {
      window.location.href = "/admin/connectors";
    }
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Connector 详情</h1>
      <p className="text-sm text-muted">名称：{name || "-"}</p>
      <p className="text-sm text-muted">状态：{status || "-"}</p>
      <p className="text-sm text-muted">使用状态：{inUse ? `在用（${sourceCount} 个 Source）` : "未使用"}</p>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="space-y-3">
        {versions.map((version) => (
          <article className="card flex items-center justify-between" key={version.id}>
            <div>
              <p className="text-sm">版本：{version.version}</p>
              <p className="text-xs text-muted">状态：{version.status}</p>
              <p className="text-xs text-muted">使用状态：{version.inUse ? `在用（${version.sourceCount} 个 Source）` : "未使用"}</p>
            </div>
            <button className="button" onClick={() => approve(version.id)}>
              启用该版本
            </button>
          </article>
        ))}
      </div>

      <div className="flex gap-3">
        <button className="button" onClick={disable}>
          禁用 Connector
        </button>
        <button
          className="button-secondary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={inUse}
          onClick={removeConnector}
          title={inUse ? "仍有 Source 使用，不能删除" : "删除 Connector"}
        >
          删除 Connector
        </button>
      </div>
    </section>
  );
}
