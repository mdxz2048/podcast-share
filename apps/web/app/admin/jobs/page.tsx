"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type Job = {
  id: string;
  status: string;
  triggerType: string;
  source: { id: string; name: string };
  connector: { displayName: string; version: string };
  discoveredPrograms: number;
  discoveredEpisodes: number;
  importedMedia: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  failedCount: number;
};

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [message, setMessage] = useState("加载中...");

  useEffect(() => {
    async function load() {
      const res = await fetch(`${apiBase}/admin/jobs`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.message ?? "加载失败");
        return;
      }
      setJobs(json.items ?? []);
      setMessage("");
    }
    load();
  }, []);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">运行记录</h1>
      <div className="card space-y-1 text-sm text-muted">
        <p>Job 是 Source 的一次运行记录：手动运行、周期运行、或认证后继续执行，都会产生一条 Job。</p>
        <p>Source 保存配置；Job 保存这一次运行的状态、日志、输入输出摘要和导入结果。</p>
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      <div className="space-y-3">
        {jobs.map((job) => (
          <article className="card flex items-center justify-between" key={job.id}>
            <div>
              <h2 className="text-base font-medium">{job.source.name}</h2>
              <p className="break-all text-xs text-muted">Job ID：{job.id}</p>
              <p className="text-xs text-muted">Connector：{job.connector.displayName} {job.connector.version}</p>
              <p className="text-xs text-muted">触发方式：{job.triggerType}</p>
              <p className="text-xs text-muted">状态：{job.status}</p>
              <p className="text-xs text-muted">
                导入结果：节目 {job.discoveredPrograms} / 单集 {job.discoveredEpisodes} / 音频 {job.importedMedia} / 失败 {job.failedCount}
              </p>
              <p className="text-xs text-muted">开始：{job.startedAt ?? job.createdAt}</p>
              <p className="text-xs text-muted">结束：{job.endedAt ?? "-"}</p>
            </div>
            <Link className="text-sm text-accent" href={`/admin/jobs/${job.id}`}>
              查看详情
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
