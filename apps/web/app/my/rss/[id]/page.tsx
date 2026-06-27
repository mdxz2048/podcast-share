"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export default function RssEditPage({ params }: { params: { id: string } }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("加载中...");

  async function load() {
    const res = await fetch(`${apiBase}/me/rss-feeds/${params.id}`, { credentials: "include" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "加载失败");
      return;
    }

    setName(json.name);
    setMessage("");
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function renameFeed() {
    const res = await fetch(`${apiBase}/me/rss-feeds/${params.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name })
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "名称已更新" : "更新失败"));
  }

  async function rotateToken() {
    const res = await fetch(`${apiBase}/me/rss-feeds/${params.id}/rotate`, {
      method: "POST",
      credentials: "include"
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "轮换失败");
      return;
    }
    setMessage(`Token 已轮换，请立即保存新链接：${json.rssUrl}`);
  }

  async function deleteFeed() {
    const res = await fetch(`${apiBase}/me/rss-feeds/${params.id}`, {
      method: "DELETE",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "已删除" : "删除失败"));
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">RSS 编辑</h1>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="card space-y-3">
        <label className="text-sm">RSS 名称</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-3">
          <button className="button" onClick={renameFeed}>
            保存名称
          </button>
          <button className="button" onClick={rotateToken}>
            轮换 Token
          </button>
          <button className="button" onClick={deleteFeed}>
            删除 RSS
          </button>
        </div>
      </div>
    </section>
  );
}
