"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type Program = {
  id: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  publishStatus: string;
  visibilityMode: string;
  episodeCount: number;
  mediaCount: number;
  updatedAt: string;
};

function displayProgramTitle(title: string) {
  return title.replace(/\s*真实导入\s*/g, "").trim() || title;
}

function statusLabel(status: string) {
  if (status === "published") return "已发布";
  if (status === "draft") return "草稿";
  if (status === "archived") return "已归档";
  return status || "-";
}

function visibilityLabel(mode: string) {
  if (mode === "public") return "所有用户";
  if (mode === "groups") return "指定类别";
  if (mode === "private") return "不可见";
  return mode || "-";
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleString() : "-";
}

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
    void load();
  }, []);

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">节目管理</h1>
        <p className="mt-1 text-sm text-muted">像管理货架一样管理节目封面、可见范围和导入结果。</p>
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => (
          <article className="overflow-hidden rounded-lg border border-line bg-white" key={item.id}>
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
                <div className="mb-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded border border-line px-2 py-1">{statusLabel(item.publishStatus)}</span>
                  <span className="rounded border border-line px-2 py-1">{visibilityLabel(item.visibilityMode)}</span>
                </div>
                <h2 className="line-clamp-2 text-base font-medium">{displayProgramTitle(item.title)}</h2>
                <p className="mt-2 line-clamp-2 text-sm text-muted">{item.description ?? "暂无简介"}</p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded border border-line p-2">
                  <p className="font-semibold">{item.episodeCount}</p>
                  <p className="text-xs text-muted">单集</p>
                </div>
                <div className="rounded border border-line p-2">
                  <p className="font-semibold">{item.mediaCount}</p>
                  <p className="text-xs text-muted">音频</p>
                </div>
                <div className="rounded border border-line p-2">
                  <p className="font-semibold">{item.visibilityMode === "groups" ? "多选" : "默认"}</p>
                  <p className="text-xs text-muted">开放</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted">更新：{formatDate(item.updatedAt)}</p>
                <Link className="button-secondary px-3 py-1.5" href={`/admin/programs/${item.id}`}>
                  配置
                </Link>
              </div>
            </div>
          </article>
        ))}
        {items.length === 0 ? <p className="rounded-lg border border-dashed border-line p-6 text-sm text-muted">暂无节目。Source 跑出节目后会出现在这里。</p> : null}
      </div>
    </section>
  );
}
