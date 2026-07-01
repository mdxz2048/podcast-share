"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SourceRef = {
  id: string;
  name: string;
  enabled: boolean;
  lastJobStatus: string | null;
  lastSuccessSyncAt: string | null;
};

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
  sourceRefs: SourceRef[];
};

type Version = {
  id: string;
  version: string;
  status: string;
  sourceCount: number;
  inUse: boolean;
  sourceRefs: SourceRef[];
};

type ConnectorDetail = Connector & {
  versions: Version[];
};

type UploadedConnector = {
  connectorId: string;
  connectorName: string;
  versionId: string;
  version: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

function statusLabel(status: string) {
  if (status === "enabled") return "已启用";
  if (status === "disabled") return "已停用";
  if (status === "uploaded") return "待启用";
  if (status === "deprecated") return "已废弃";
  return status || "-";
}

function formatShortTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function connectorDots(item: Connector) {
  return [
    {
      label: statusLabel(item.status),
      className: item.status === "enabled" ? "bg-emerald-500" : "bg-slate-300"
    },
    {
      label: item.inUse ? `在用：${item.sourceCount} 个 Source` : "未被 Source 使用",
      className: item.inUse ? "bg-amber-500" : "bg-sky-500"
    },
    {
      label: `版本：${statusLabel(item.latestVersionStatus ?? "")}`,
      className: item.latestVersionStatus === "enabled" ? "bg-violet-500" : "bg-slate-300"
    }
  ];
}

function sourceDots(source: SourceRef) {
  return [
    {
      label: source.enabled ? "启用" : "停用",
      className: source.enabled ? "bg-emerald-500" : "bg-slate-300"
    },
    {
      label: source.lastJobStatus ? `最近任务：${source.lastJobStatus}` : "暂无任务",
      className: source.lastJobStatus === "running" ? "bg-amber-500" : "bg-sky-500"
    }
  ];
}

export default function AdminConnectorsPage() {
  const [items, setItems] = useState<Connector[]>([]);
  const [message, setMessage] = useState("加载中...");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<UploadedConnector | null>(null);
  const [detailConnector, setDetailConnector] = useState<ConnectorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Connector | null>(null);

  const totals = useMemo(
    () => ({
      enabled: items.filter((item) => item.status === "enabled").length,
      inUse: items.filter((item) => item.inUse).length,
      sources: items.reduce((sum, item) => sum + item.sourceCount, 0)
    }),
    [items]
  );

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
    void load();
  }, []);

  async function enableConnector(connectorId: string, versionId?: string) {
    const res = await fetch(`${apiBase}/admin/connectors/${connectorId}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(versionId ? { connectorVersionId: versionId } : {})
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "Connector 已启用" : "操作失败"));
    await load();
    if (detailConnector?.id === connectorId) {
      await openConnectorDetail(connectorId);
    }
  }

  async function disableConnector(connectorId: string) {
    const res = await fetch(`${apiBase}/admin/connectors/${connectorId}/disable`, {
      method: "POST",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "Connector 已停用" : "操作失败"));
    await load();
    if (detailConnector?.id === connectorId) {
      await openConnectorDetail(connectorId);
    }
  }

  async function deleteConnector() {
    if (!deleteTarget) return;
    const res = await fetch(`${apiBase}/admin/connectors/${deleteTarget.id}`, {
      method: "DELETE",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "Connector 已删除" : "删除失败"));
    if (res.ok) {
      if (detailConnector?.id === deleteTarget.id) {
        setDetailConnector(null);
      }
      setDeleteTarget(null);
      await load();
    }
  }

  async function uploadConnector() {
    if (!uploadFile) {
      setMessage("请先选择 ZIP 文件");
      return;
    }

    const form = new FormData();
    form.append("file", uploadFile);

    setUploading(true);
    const res = await fetch(`${apiBase}/admin/connectors/upload`, {
      method: "POST",
      credentials: "include",
      body: form
    });
    const json = await res.json();
    setUploading(false);

    if (!res.ok) {
      setMessage(json.message ?? "上传失败");
      setUploaded(null);
      return;
    }

    const nextUploaded = {
      connectorId: json.connector.id,
      connectorName: json.connector.displayName,
      versionId: json.version.id,
      version: json.version.version
    };
    setUploaded(nextUploaded);
    setMessage(`上传成功：${nextUploaded.connectorName} ${nextUploaded.version}`);
    await load();
  }

  async function openConnectorDetail(connectorId: string) {
    setDetailLoading(true);
    const res = await fetch(`${apiBase}/admin/connectors/${connectorId}`, { credentials: "include" });
    const json = await res.json();
    setDetailLoading(false);
    if (!res.ok) {
      setMessage(json.message ?? "加载详情失败");
      return;
    }
    setDetailConnector({
      id: json.id ?? connectorId,
      name: json.name ?? "",
      displayName: json.displayName ?? "",
      status: json.status ?? "",
      latestVersion: json.latestVersion ?? null,
      latestVersionStatus: json.latestVersionStatus ?? null,
      latestVersionId: json.latestVersionId ?? null,
      sourceCount: json.sourceCount ?? 0,
      inUse: Boolean(json.inUse),
      sourceRefs: json.sourceRefs ?? [],
      versions: (json.versions ?? []).map((item: any) => ({
        id: item.id,
        version: item.version,
        status: item.status,
        sourceCount: item.sourceCount ?? 0,
        inUse: Boolean(item.inUse),
        sourceRefs: item.sourceRefs ?? []
      }))
    });
  }

  function closeUploadModal() {
    setUploadOpen(false);
    setUploadFile(null);
    setUploaded(null);
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Connector 管理</h1>
          <p className="mt-1 text-sm text-muted">管理 Connector 的上传、启停和 Source 引用。被 Source 使用中的 Connector 不能停用或删除。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="button-secondary" href="/admin/connectors/packaging-guide">
            打包要求模板
          </Link>
          <button className="button" onClick={() => setUploadOpen(true)}>
            上传 ZIP
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="text-xs text-muted">已启用 Connector</p>
          <p className="mt-2 text-2xl font-semibold">{totals.enabled}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="text-xs text-muted">正在被 Source 使用</p>
          <p className="mt-2 text-2xl font-semibold">{totals.inUse}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="text-xs text-muted">Source 引用总数</p>
          <p className="mt-2 text-2xl font-semibold">{totals.sources}</p>
        </div>
      </div>

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="space-y-3">
        {items.map((item) => (
          <article className="card space-y-4" key={item.id}>
            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_auto]">
              <div className="space-y-3">
                <div>
                  <h2 className="text-base font-medium">{item.displayName}</h2>
                  <p className="mt-1 text-xs text-muted">{item.name}</p>
                  <p className="mt-1 break-all text-xs text-muted">Connector ID：{item.id}</p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                  {connectorDots(item).map((dot) => (
                    <span className="inline-flex items-center gap-1.5" key={dot.label}>
                      <span className={`h-2 w-2 rounded-full ${dot.className}`} />
                      {dot.label}
                    </span>
                  ))}
                </div>
                <div className="grid max-w-xl grid-cols-2 gap-2 text-sm">
                  <div className="rounded border border-line p-3">
                    <p className="text-lg font-semibold">{item.latestVersion ?? "-"}</p>
                    <p className="text-xs text-muted">最新版本</p>
                  </div>
                  <div className="rounded border border-line p-3">
                    <p className="text-lg font-semibold">{item.sourceCount}</p>
                    <p className="text-xs text-muted">Source 引用</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-line p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium">Source 使用情况</h3>
                  <span className="text-xs text-muted">{item.inUse ? "使用中" : "空闲"}</span>
                </div>
                <div className="max-h-44 space-y-2 overflow-auto">
                  {item.sourceRefs.slice(0, 6).map((source) => (
                    <Link className="block rounded border border-line px-3 py-2 text-xs hover:border-accent" href={`/admin/sources/${source.id}`} key={source.id}>
                      <p className="font-medium">{source.name}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        {sourceDots(source).map((dot) => (
                          <span className="inline-flex items-center gap-1.5 text-muted" key={dot.label}>
                            <span className={`h-2 w-2 rounded-full ${dot.className}`} />
                            {dot.label}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 text-muted">最近成功：{formatShortTime(source.lastSuccessSyncAt)}</p>
                    </Link>
                  ))}
                  {item.sourceRefs.length > 6 ? <p className="text-xs text-muted">还有 {item.sourceRefs.length - 6} 个 Source，可在详情里查看。</p> : null}
                  {item.sourceRefs.length === 0 ? <p className="text-sm text-muted">暂无 Source 使用这个 Connector。</p> : null}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  className="button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={item.status === "enabled" && item.latestVersionStatus === "enabled"}
                  onClick={() => enableConnector(item.id)}
                  title={item.status === "enabled" && item.latestVersionStatus === "enabled" ? "Connector 已启用" : "启用 Connector"}
                >
                  启用
                </button>
                <button
                  className="button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={item.inUse || item.status !== "enabled"}
                  onClick={() => disableConnector(item.id)}
                  title={item.inUse ? "仍有 Source 使用，不能停用" : item.status !== "enabled" ? "Connector 未启用" : "停用 Connector"}
                >
                  停用
                </button>
                <button
                  className="button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={item.inUse}
                  onClick={() => setDeleteTarget(item)}
                  title={item.inUse ? "仍有 Source 使用，不能删除" : "删除 Connector"}
                >
                  删除
                </button>
                <button className="text-left text-sm text-accent" onClick={() => openConnectorDetail(item.id)}>
                  查看详情
                </button>
              </div>
            </div>
          </article>
        ))}
        {items.length === 0 ? <p className="rounded-lg border border-dashed border-line p-6 text-sm text-muted">暂无 Connector，请先上传 ZIP。</p> : null}
      </div>

      {uploadOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-xl rounded-lg border border-line bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-medium">上传 Connector ZIP</h2>
                <p className="mt-1 text-xs text-muted">上传后会生成新版本，确认无误后再启用给 Source 使用。</p>
              </div>
              <button className="button-secondary" onClick={closeUploadModal}>
                关闭
              </button>
            </div>
            <div className="space-y-3">
              <input
                accept=".zip,application/zip"
                className="input"
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                type="file"
              />
              <button className="button disabled:cursor-not-allowed disabled:opacity-50" disabled={uploading} onClick={uploadConnector}>
                {uploading ? "上传中..." : "开始上传"}
              </button>
              {uploaded ? (
                <div className="rounded-lg border border-line bg-slate-50 p-3 text-sm">
                  <p className="font-medium">上传成功：{uploaded.connectorName} {uploaded.version}</p>
                  <p className="mt-1 break-all text-xs text-muted">Connector Version ID：{uploaded.versionId}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="button-secondary" onClick={() => enableConnector(uploaded.connectorId, uploaded.versionId)}>
                      启用该版本
                    </button>
                    <button className="button-secondary" onClick={() => openConnectorDetail(uploaded.connectorId)}>
                      查看详情
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {detailConnector || detailLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="max-h-[88vh] w-full max-w-5xl overflow-auto rounded-lg border border-line bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-medium">Connector 详情</h2>
                <p className="mt-1 text-xs text-muted">{detailConnector ? `${detailConnector.displayName} / ${statusLabel(detailConnector.status)}` : "加载中..."}</p>
              </div>
              <button className="button-secondary" onClick={() => setDetailConnector(null)}>
                关闭
              </button>
            </div>

            {detailLoading ? <p className="text-sm text-muted">正在加载详情...</p> : null}
            {detailConnector ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-line p-3">
                    <p className="text-xs text-muted">当前状态</p>
                    <p className="mt-1 text-lg font-semibold">{statusLabel(detailConnector.status)}</p>
                  </div>
                  <div className="rounded-lg border border-line p-3">
                    <p className="text-xs text-muted">Source 引用</p>
                    <p className="mt-1 text-lg font-semibold">{detailConnector.sourceCount}</p>
                  </div>
                  <div className="rounded-lg border border-line p-3">
                    <p className="text-xs text-muted">版本数量</p>
                    <p className="mt-1 text-lg font-semibold">{detailConnector.versions.length}</p>
                  </div>
                </div>

                <section className="rounded-lg border border-line p-3">
                  <h3 className="text-sm font-medium">谁在使用</h3>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {detailConnector.sourceRefs.map((source) => (
                      <Link className="rounded border border-line p-3 text-sm hover:border-accent" href={`/admin/sources/${source.id}`} key={source.id}>
                        <p className="font-medium">{source.name}</p>
                        <p className="mt-1 text-xs text-muted">
                          {source.enabled ? "已启用" : "已停用"} / 最近任务：{source.lastJobStatus ?? "-"} / 最近成功：{formatShortTime(source.lastSuccessSyncAt)}
                        </p>
                      </Link>
                    ))}
                    {detailConnector.sourceRefs.length === 0 ? <p className="text-sm text-muted">暂无 Source 使用这个 Connector。</p> : null}
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-medium">版本</h3>
                  {detailConnector.versions.map((version) => (
                    <article className="rounded-lg border border-line p-3" key={version.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{version.version}</p>
                          <p className="mt-1 text-xs text-muted">
                            状态：{statusLabel(version.status)} / 引用：{version.sourceCount} / {version.inUse ? "使用中" : "未使用"}
                          </p>
                        </div>
                        <button
                          className="button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={detailConnector.status === "enabled" && version.status === "enabled"}
                          onClick={() => enableConnector(detailConnector.id, version.id)}
                        >
                          启用该版本
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-lg border border-line bg-white p-5 shadow-xl">
            <h2 className="text-base font-medium">确认删除 Connector</h2>
            <p className="mt-2 text-sm text-muted">
              将删除「{deleteTarget.displayName}」。只有没有任何 Source 引用时才能删除。
            </p>
            <div className="mt-4 rounded border border-line bg-slate-50 p-3 text-xs text-muted">
              <p>状态：{statusLabel(deleteTarget.status)}</p>
              <p>Source 引用：{deleteTarget.sourceCount}</p>
              <p>最新版本：{deleteTarget.latestVersion ?? "-"}</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="button-secondary" onClick={() => setDeleteTarget(null)}>
                取消
              </button>
              <button className="button" onClick={deleteConnector}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
