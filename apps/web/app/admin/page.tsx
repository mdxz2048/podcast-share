"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type Dashboard = {
  connectors: { total: number; enabled: number; in_use: number };
  sources: { total: number; enabled: number; running: number };
  content: { programs: number; episodes: number; media: number; media_bytes: string | number };
  jobs7d: { completed: number; failed: number; running: number };
  rss: { total: number; active: number; revoked: number };
  recentJobs: Array<{
    id: string;
    status: string;
    triggerType: string;
    discoveredPrograms: number;
    discoveredEpisodes: number;
    importedMedia: number;
    failedCount: number;
    createdAt: string;
    source: { id: string; name: string };
    connector: { displayName: string };
  }>;
};

function formatBytes(value: string | number) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <article className="card space-y-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted">{hint}</p>
    </article>
  );
}

export default function AdminHomePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState("加载中...");

  useEffect(() => {
    async function load() {
      const res = await fetch(`${apiBase}/admin/dashboard`, { credentials: "include" });
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
        <h1 className="text-2xl font-semibold">后台首页</h1>
        <p className="mt-2 text-sm text-muted">网站运行概览，聚合 Connector、Source、内容导入和 RSS 使用情况。</p>
      </div>

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {data ? (
        <>
          <div className="grid gap-3 md:grid-cols-5">
            <StatCard label="Connector" value={data.connectors.total} hint={`启用 ${data.connectors.enabled} / 在用 ${data.connectors.in_use}`} />
            <StatCard label="Source" value={data.sources.total} hint={`启用 ${data.sources.enabled} / 运行中 ${data.sources.running}`} />
            <StatCard label="节目内容" value={data.content.programs} hint={`单集 ${data.content.episodes} / 音频 ${data.content.media}`} />
            <StatCard label="媒体容量" value={formatBytes(data.content.media_bytes)} hint="已就绪音频文件总大小" />
            <StatCard label="RSS" value={data.rss.active} hint={`总数 ${data.rss.total} / 已失效 ${data.rss.revoked}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
            <section className="card space-y-3">
              <h2 className="text-base font-medium">近 7 天任务</h2>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded border border-line p-3">
                  <p className="text-xl font-semibold">{data.jobs7d.completed}</p>
                  <p className="text-xs text-muted">成功</p>
                </div>
                <div className="rounded border border-line p-3">
                  <p className="text-xl font-semibold">{data.jobs7d.running}</p>
                  <p className="text-xs text-muted">运行中</p>
                </div>
                <div className="rounded border border-line p-3">
                  <p className="text-xl font-semibold">{data.jobs7d.failed}</p>
                  <p className="text-xs text-muted">失败</p>
                </div>
              </div>
            </section>

            <section className="card space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-medium">最近运行记录</h2>
                <Link className="text-sm text-accent" href="/admin/jobs">
                  查看全部
                </Link>
              </div>
              <div className="space-y-2">
                {data.recentJobs.map((job) => (
                  <Link className="block rounded border border-line p-3 text-sm hover:border-accent" href={`/admin/jobs/${job.id}`} key={job.id}>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium">{job.source.name}</span>
                      <span className="text-xs text-muted">{job.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {job.connector.displayName} / 节目 {job.discoveredPrograms} / 单集 {job.discoveredEpisodes} / 音频 {job.importedMedia}
                    </p>
                  </Link>
                ))}
                {data.recentJobs.length === 0 ? <p className="text-sm text-muted">暂无运行记录</p> : null}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}
