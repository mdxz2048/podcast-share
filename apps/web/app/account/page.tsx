"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type AccountOverview = {
  rss: { total: number; active: number; revoked: number };
  library: { programs: number; episodes: number };
  feeds: Array<{
    id: string;
    name: string;
    status: string;
    programCount: number;
    requestCount: number;
    subscriberEstimate: number;
    lastAccessedAt: string | null;
    updatedAt: string;
  }>;
};

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <article className="card space-y-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted">{hint}</p>
    </article>
  );
}

export default function AccountPage() {
  const [data, setData] = useState<AccountOverview | null>(null);
  const [message, setMessage] = useState("加载中...");

  useEffect(() => {
    async function load() {
      const res = await fetch(`${apiBase}/me/overview`, { credentials: "include" });
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
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">账户概览</h1>
        <p className="mt-1 text-sm text-muted">查看当前账户的 RSS 链接、可访问节目和订阅访问情况。</p>
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {data ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <StatCard label="RSS 链接" value={data.rss.total} hint={`active ${data.rss.active} / 已失效 ${data.rss.revoked}`} />
            <StatCard label="可访问节目" value={data.library.programs} hint="当前账号有权限访问的节目" />
            <StatCard label="可访问单集" value={data.library.episodes} hint="可被 RSS 输出的已发布单集" />
            <StatCard
              label="估算订阅端"
              value={data.feeds.reduce((sum, feed) => sum + feed.subscriberEstimate, 0)}
              hint="按 IP + User-Agent 近似统计"
            />
          </div>

          <section className="card space-y-3">
            <h2 className="text-base font-medium">RSS 使用情况</h2>
            <div className="space-y-2">
              {data.feeds.map((feed) => (
                <article className="rounded border border-line p-3" key={feed.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{feed.name}</p>
                      <p className="mt-1 text-xs text-muted">状态：{feed.status} / 节目：{feed.programCount}</p>
                    </div>
                    <p className="text-xs text-muted">最近访问：{feed.lastAccessedAt ?? "-"}</p>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                    <div className="rounded bg-slate-50 p-3">
                      <p className="font-medium">{feed.requestCount}</p>
                      <p className="text-xs text-muted">请求次数</p>
                    </div>
                    <div className="rounded bg-slate-50 p-3">
                      <p className="font-medium">{feed.subscriberEstimate}</p>
                      <p className="text-xs text-muted">估算订阅端</p>
                    </div>
                  </div>
                </article>
              ))}
              {data.feeds.length === 0 ? <p className="text-sm text-muted">还没有 RSS 链接。</p> : null}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
