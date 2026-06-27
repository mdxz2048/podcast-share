"use client";

import { useEffect, useState } from "react";

type Episode = {
  id: string;
  title: string;
  description: string | null;
  publishedAt: string;
  durationSeconds: number | null;
  mediaStatus: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function ProgramDetailPage({ params }: { params: { id: string } }) {
  const [title, setTitle] = useState("节目详情");
  const [description, setDescription] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [message, setMessage] = useState("加载中...");

  useEffect(() => {
    async function load() {
      const [programRes, episodeRes] = await Promise.all([
        fetch(`${apiBase}/programs/${params.id}`, { credentials: "include" }),
        fetch(`${apiBase}/programs/${params.id}/episodes`, { credentials: "include" })
      ]);

      const programJson = await programRes.json();
      const episodeJson = await episodeRes.json();
      if (!programRes.ok || !episodeRes.ok) {
        setMessage(programJson.message ?? episodeJson.message ?? "加载失败");
        return;
      }

      setTitle(programJson.title);
      setDescription(programJson.description ?? null);
      setEpisodes(episodeJson.items ?? []);
      setMessage("");
    }
    load();
  }, [params.id]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-muted">{description ?? "暂无简介"}</p>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      <div className="space-y-3">
        {episodes.map((episode) => (
          <article key={episode.id} className="card">
            <h2 className="text-base font-medium">{episode.title}</h2>
            <p className="mt-1 text-sm text-muted">{episode.description ?? "暂无简介"}</p>
            <p className="mt-2 text-xs text-muted">发布时间：{episode.publishedAt}</p>
            <p className="text-xs text-muted">时长：{episode.durationSeconds ?? 0} 秒</p>
            <p className="text-xs text-muted">媒体状态：{episode.mediaStatus}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
