"use client";

import Link from "next/link";
import { useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export default function AdminConnectorUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploaded, setUploaded] = useState<null | {
    connectorId: string;
    connectorName: string;
    versionId: string;
    version: string;
  }>(null);

  async function submit() {
    if (!file) {
      setMessage("请先选择 ZIP 文件");
      return;
    }

    const form = new FormData();
    form.append("file", file);

    setLoading(true);
    const res = await fetch(`${apiBase}/admin/connectors/upload`, {
      method: "POST",
      credentials: "include",
      body: form
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMessage(json.message ?? "上传失败");
      setUploaded(null);
      return;
    }

    setMessage(`上传成功：${json.connector.displayName} ${json.version.version}`);
    setUploaded({
      connectorId: json.connector.id,
      connectorName: json.connector.displayName,
      versionId: json.version.id,
      version: json.version.version
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">上传 Connector ZIP</h1>
        <Link className="button-secondary" href="/admin/connectors/packaging-guide">
          查看打包模板
        </Link>
      </div>
      <div className="card space-y-3">
        <input
          className="input"
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <button className="button" disabled={loading} onClick={submit}>
          {loading ? "上传中..." : "开始上传"}
        </button>
        {message ? <p className="text-sm text-muted">{message}</p> : null}
        {uploaded ? (
          <div className="space-y-2 rounded-lg border border-line bg-surface p-3 text-sm">
            <p className="font-medium text-ink">下一步建议（按顺序）：</p>
            <p className="text-muted">1) 去 Connector 列表确认并启用：{uploaded.connectorName}</p>
            <p className="text-muted">2) 去 Source 管理创建 Source（可直接粘贴下面的版本 ID）</p>
            <p className="text-muted">3) 进入 Source 详情页点“立即运行”验证</p>
            <p className="break-all text-xs text-muted">Connector Version ID: {uploaded.versionId}</p>
            <div className="flex flex-wrap gap-2">
              <Link className="button-secondary" href="/admin/connectors">
                去 Connector 列表
              </Link>
              <Link className="button-secondary" href="/admin/sources">
                去 Source 管理
              </Link>
              <Link className="button-secondary" href={`/admin/connectors/${uploaded.connectorId}`}>
                查看 Connector 详情
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
