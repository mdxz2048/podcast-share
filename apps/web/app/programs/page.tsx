"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Program = {
  id: string;
  title: string;
  description: string | null;
  episodeCount: number;
  latestEpisodePublishedAt: string | null;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function ProgramsPage() {
  const [items, setItems] = useState<Program[]>([]);
  const [message, setMessage] = useState("加载中...");

  useEffect(() => {
    async function load() {
      const res = await fetch(`${apiBase}/programs`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.message ?? "加载失败");
        return;
      }
      setItems(json.items ?? []);
      setMessage("");
    }
    load();
  }, []);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">节目目录</h1>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="card">
            <h2 className="text-lg font-medium">{item.title}</h2>
            <p className="mt-2 text-sm text-muted">{item.description ?? "暂无简介"}</p>
            <p className="mt-3 text-xs text-muted">单集数：{item.episodeCount}</p>
            <p className="text-xs text-muted">最近发布时间：{item.latestEpisodePublishedAt ?? "暂无"}</p>
            <Link className="mt-4 inline-block text-sm text-accent" href={`/programs/${item.id}`}>
              查看详情
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
