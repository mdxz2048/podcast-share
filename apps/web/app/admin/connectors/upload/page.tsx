"use client";

import { useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function AdminConnectorUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

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
      return;
    }

    setMessage(`上传成功：${json.connector.displayName} ${json.version.version}`);
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">上传 Connector ZIP</h1>
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
      </div>
    </section>
  );
}
