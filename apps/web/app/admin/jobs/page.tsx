"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type Job = {
  id: string;
  status: string;
  source: { name: string };
  connector: { displayName: string; version: string };
  createdAt: string;
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
      <h1 className="text-2xl font-semibold">任务列表</h1>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      <div className="space-y-3">
        {jobs.map((job) => (
          <article className="card flex items-center justify-between" key={job.id}>
            <div>
              <h2 className="text-base font-medium">{job.source.name}</h2>
              <p className="text-xs text-muted">Connector：{job.connector.displayName} {job.connector.version}</p>
              <p className="text-xs text-muted">状态：{job.status}</p>
              <p className="text-xs text-muted">失败计数：{job.failedCount}</p>
              <p className="text-xs text-muted">创建时间：{job.createdAt}</p>
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
