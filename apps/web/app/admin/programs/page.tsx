"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type Program = {
  id: string;
  title: string;
  publishStatus: string;
  visibilityMode: string;
  episodeCount: number;
  mediaCount: number;
  updatedAt: string;
};

export default function AdminProgramsPage() {
  const [items, setItems] = useState<Program[]>([]);
  const [message, setMessage] = useState("加载中...");

  useEffect(() => {
    async function load() {
      const res = await fetch(`${apiBase}/admin/programs`, { credentials: "include" });
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
      <h1 className="text-2xl font-semibold">节目管理</h1>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="space-y-3">
        {items.map((item) => (
          <article className="card flex items-center justify-between" key={item.id}>
            <div>
              <h2 className="text-base font-medium">{item.title}</h2>
              <p className="text-xs text-muted">发布状态：{item.publishStatus}</p>
              <p className="text-xs text-muted">可见范围：{item.visibilityMode}</p>
              <p className="text-xs text-muted">单集数：{item.episodeCount} / 音频数：{item.mediaCount}</p>
              <p className="text-xs text-muted">更新时间：{item.updatedAt}</p>
            </div>
            <Link className="text-sm text-accent" href={`/admin/programs/${item.id}`}>
              配置可见性
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
