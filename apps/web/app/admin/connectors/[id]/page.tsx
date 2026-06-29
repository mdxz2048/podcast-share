"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type Version = {
  id: string;
  version: string;
  status: string;
  sourceCount: number;
  inUse: boolean;
  sourceRefs: SourceRef[];
};

type SourceRef = {
  id: string;
  name: string;
  enabled: boolean;
  lastJobStatus: string | null;
  lastSuccessSyncAt: string | null;
};

export default function AdminConnectorDetailPage({ params }: { params: { id: string } }) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [sourceCount, setSourceCount] = useState(0);
  const [inUse, setInUse] = useState(false);
  const [sourceRefs, setSourceRefs] = useState<SourceRef[]>([]);
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
    setSourceRefs(json.sourceRefs ?? []);
    setVersions((json.versions ?? []).map((item: any) => ({
      id: item.id,
      version: item.version,
      status: item.status,
      sourceCount: item.sourceCount ?? 0,
      inUse: Boolean(item.inUse),
      sourceRefs: item.sourceRefs ?? []
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
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Connector 详情</h1>
        <p className="mt-1 text-sm text-muted">名称：{name || "-"} / 状态：{status || "-"}</p>
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">引用情况</h2>
          <span className="text-sm text-muted">{inUse ? `在用（${sourceCount} 个 Source）` : "未使用"}</span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {sourceRefs.map((source) => (
            <a className="rounded border border-line p-3 text-sm hover:border-accent" href={`/admin/sources/${source.id}`} key={source.id}>
              <p className="font-medium">{source.name}</p>
              <p className="mt-1 text-xs text-muted">
                {source.enabled ? "启用" : "停用"} / 最近任务：{source.lastJobStatus ?? "-"} / 最近成功：{source.lastSuccessSyncAt ?? "-"}
              </p>
            </a>
          ))}
          {sourceRefs.length === 0 ? <p className="text-sm text-muted">暂无 Source 使用这个 Connector。</p> : null}
        </div>
      </section>

      <div className="space-y-3">
        {versions.map((version) => (
          <article className="card grid gap-3 md:grid-cols-[1fr_auto]" key={version.id}>
            <div>
              <p className="text-sm">版本：{version.version}</p>
              <p className="text-xs text-muted">状态：{version.status}</p>
              <p className="text-xs text-muted">使用状态：{version.inUse ? `在用（${version.sourceCount} 个 Source）` : "未使用"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {version.sourceRefs.map((source) => (
                  <a className="rounded border border-line px-2 py-1 text-xs hover:text-accent" href={`/admin/sources/${source.id}`} key={source.id}>
                    {source.name}
                  </a>
                ))}
              </div>
            </div>
            <button
              className="button disabled:cursor-not-allowed disabled:opacity-50"
              disabled={status === "enabled" && version.status === "enabled"}
              onClick={() => approve(version.id)}
              title={status === "enabled" && version.status === "enabled" ? "该版本已启用" : "启用该版本"}
            >
              启用该版本
            </button>
          </article>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          className="button disabled:cursor-not-allowed disabled:opacity-50"
          disabled={inUse || status !== "enabled"}
          onClick={disable}
          title={inUse ? "仍有 Source 使用，不能停用" : status !== "enabled" ? "Connector 未启用" : "禁用 Connector"}
        >
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
