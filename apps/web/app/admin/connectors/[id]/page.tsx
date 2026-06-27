"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type Version = {
  id: string;
  version: string;
  status: string;
};

export default function AdminConnectorDetailPage({ params }: { params: { id: string } }) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
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
    setVersions((json.versions ?? []).map((item: any) => ({ id: item.id, version: item.version, status: item.status })));
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

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Connector 详情</h1>
      <p className="text-sm text-muted">名称：{name || "-"}</p>
      <p className="text-sm text-muted">状态：{status || "-"}</p>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="space-y-3">
        {versions.map((version) => (
          <article className="card flex items-center justify-between" key={version.id}>
            <div>
              <p className="text-sm">版本：{version.version}</p>
              <p className="text-xs text-muted">状态：{version.status}</p>
            </div>
            <button className="button" onClick={() => approve(version.id)}>
              启用该版本
            </button>
          </article>
        ))}
      </div>

      <button className="button" onClick={disable}>
        禁用 Connector
      </button>
    </section>
  );
}
