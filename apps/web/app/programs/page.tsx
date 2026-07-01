"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Program = {
  id: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  episodeCount: number;
  latestEpisodePublishedAt: string | null;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

function displayProgramTitle(title: string) {
  return title.replace(/\s*真实导入\s*/g, "").trim() || title;
}

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
    void load();
  }, []);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">节目目录</h1>
          <p className="mt-1 text-sm text-muted">浏览当前账号可访问的节目，选择节目后可加入自己的 RSS。</p>
        </div>
        <Link className="button-secondary" href="/my/rss">
          管理我的 RSS
        </Link>
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => (
          <article key={item.id} className="overflow-hidden rounded-lg border border-line bg-white">
            <div className="aspect-square bg-slate-100">
              {item.coverImageUrl ? (
                <img alt={displayProgramTitle(item.title)} className="h-full w-full object-cover" src={item.coverImageUrl} />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-slate-950 text-5xl font-semibold text-white">
                  {displayProgramTitle(item.title).slice(0, 1)}
                </div>
              )}
            </div>
            <div className="space-y-3 p-3">
              <div>
                <h2 className="line-clamp-2 text-base font-medium">{displayProgramTitle(item.title)}</h2>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{item.description ?? "暂无简介"}</p>
              </div>
              <p className="text-xs text-muted">{item.episodeCount} 个可听单集</p>
              <Link className="button inline-block w-full text-center" href={`/programs/${item.id}`}>
                查看节目
              </Link>
            </div>
          </article>
        ))}
        {items.length === 0 ? <p className="rounded-lg border border-dashed border-line p-6 text-sm text-muted">当前账号还没有可访问节目。</p> : null}
      </div>
    </section>
  );
}
