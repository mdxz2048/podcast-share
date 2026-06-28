"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type AdminRssOverview = {
  stats: { total: number; active: number; revoked: number; requests_7d: number };
  items: Array<{
    id: string;
    name: string;
    status: string;
    ownerEmail: string;
    programCount: number;
    requestCount: number;
    subscriberEstimate: number;
    lastAccessedAt: string | null;
    updatedAt: string;
  }>;
};

export default function AdminRssPage() {
  const [data, setData] = useState<AdminRssOverview | null>(null);
  const [message, setMessage] = useState("加载中...");

  useEffect(() => {
    async function load() {
      const res = await fetch(`${apiBase}/admin/rss/overview`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.message ?? "加载失败");
        return;
      }
      setData(json);
      setMessage("");
    }
    load();
  }, []);

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">RSS 管理</h1>
        <p className="mt-1 text-sm text-muted">全站 RSS 链接状态和访问情况，订阅端数量按 IP + User-Agent 近似统计。</p>
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {data ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <article className="card">
              <p className="text-xs text-muted">RSS 总数</p>
              <p className="mt-2 text-2xl font-semibold">{data.stats.total}</p>
            </article>
            <article className="card">
              <p className="text-xs text-muted">Active</p>
              <p className="mt-2 text-2xl font-semibold">{data.stats.active}</p>
            </article>
            <article className="card">
              <p className="text-xs text-muted">已失效</p>
              <p className="mt-2 text-2xl font-semibold">{data.stats.revoked}</p>
            </article>
            <article className="card">
              <p className="text-xs text-muted">7 天请求</p>
              <p className="mt-2 text-2xl font-semibold">{data.stats.requests_7d}</p>
            </article>
          </div>

          <div className="space-y-3">
            {data.items.map((feed) => (
              <article className="card grid gap-3 md:grid-cols-[1fr_auto]" key={feed.id}>
                <div>
                  <h2 className="text-base font-medium">{feed.name}</h2>
                  <p className="mt-1 text-xs text-muted">用户：{feed.ownerEmail}</p>
                  <p className="text-xs text-muted">状态：{feed.status} / 节目：{feed.programCount} / 最近访问：{feed.lastAccessedAt ?? "-"}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded border border-line p-3 text-center">
                    <p className="font-semibold">{feed.requestCount}</p>
                    <p className="text-xs text-muted">请求</p>
                  </div>
                  <div className="rounded border border-line p-3 text-center">
                    <p className="font-semibold">{feed.subscriberEstimate}</p>
                    <p className="text-xs text-muted">估算订阅端</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
