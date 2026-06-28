"use client";

import { useEffect, useState } from "react";

type Feed = {
  id: string;
  name: string;
  status: string;
  rssUrl: string | null;
  programCount: number;
  requestCount: number;
  subscriberEstimate: number;
  lastAccessedAt: string | null;
  createdAt: string;
  rotatedAt: string | null;
};

type Program = {
  id: string;
  title: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

function displayProgramTitle(title: string) {
  return title.replace(/\s*真实导入\s*/g, "").trim() || title;
}

export default function MyRssPage() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
  const [name, setName] = useState("通勤 RSS");
  const [message, setMessage] = useState("加载中...");

  async function load() {
    const [feedRes, programRes] = await Promise.all([
      fetch(`${apiBase}/me/rss-feeds`, { credentials: "include" }),
      fetch(`${apiBase}/programs`, { credentials: "include" })
    ]);

    const feedJson = await feedRes.json();
    const programJson = await programRes.json();
    if (!feedRes.ok || !programRes.ok) {
      setMessage(feedJson.message ?? programJson.message ?? "加载失败");
      return;
    }

    setFeeds(feedJson.items ?? []);
    setPrograms((programJson.items ?? []).map((item: any) => ({ id: item.id, title: displayProgramTitle(item.title) })));
    setMessage("");
  }

  useEffect(() => {
    load();
  }, []);

  async function createFeed() {
    const res = await fetch(`${apiBase}/me/rss-feeds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, programIds: selectedProgramIds })
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "创建失败");
      return;
    }

    setMessage(`创建成功：${json.rssUrl}`);
    await load();
  }

  async function copyUrl(feed: Feed) {
    if (!feed.rssUrl) {
      setMessage("这个 RSS 是旧数据，更新链接后才能复制当前订阅链接。");
      return;
    }
    await navigator.clipboard.writeText(feed.rssUrl);
    setMessage(`已复制：${feed.name}`);
  }

  async function rotateFeed(feed: Feed) {
    if (!confirm(`确认更新「${feed.name}」的 RSS 链接吗？旧链接会立即失效。`)) {
      return;
    }
    const res = await fetch(`${apiBase}/me/rss-feeds/${feed.id}/rotate`, {
      method: "POST",
      credentials: "include"
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "更新失败");
      return;
    }
    setMessage(`新链接已生成：${json.rssUrl}`);
    await load();
  }

  async function deleteFeed(feed: Feed) {
    if (!confirm(`确认删除 RSS「${feed.name}」吗？删除后该链接不可访问。`)) {
      return;
    }
    const res = await fetch(`${apiBase}/me/rss-feeds/${feed.id}`, {
      method: "DELETE",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "RSS 已删除" : "删除失败"));
    await load();
  }

  function toggleProgram(programId: string) {
    setSelectedProgramIds((prev) => (prev.includes(programId) ? prev.filter((id) => id !== programId) : [...prev, programId]));
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">我的 RSS</h1>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="card space-y-3">
        <h2 className="text-base font-medium">创建新 RSS</h2>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="RSS 名称" />
        <div className="space-y-2">
          {programs.map((program) => (
            <label className="flex items-center gap-2 text-sm" key={program.id}>
              <input type="checkbox" checked={selectedProgramIds.includes(program.id)} onChange={() => toggleProgram(program.id)} />
              {program.title}
            </label>
          ))}
        </div>
        <button className="button" onClick={createFeed} disabled={selectedProgramIds.length === 0}>
          创建 RSS
        </button>
      </div>

      <div className="space-y-3">
        {feeds.map((feed) => (
          <article key={feed.id} className="card space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
              <h3 className="text-base font-medium">{feed.name}</h3>
                <p className="mt-1 text-xs text-muted">
                  状态：{feed.status} / 节目 {feed.programCount} / 访问 {feed.requestCount} / 估算订阅端 {feed.subscriberEstimate}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="button-secondary" onClick={() => copyUrl(feed)}>
                  复制链接
                </button>
                <button className="button-secondary" onClick={() => rotateFeed(feed)}>
                  更新 RSS 链接
                </button>
                <button className="button-secondary" onClick={() => deleteFeed(feed)}>
                  删除
                </button>
              </div>
            </div>
            <div className="rounded border border-line bg-slate-50 p-3">
              <p className="text-xs text-muted">当前订阅链接</p>
              <p className="mt-1 break-all font-mono text-xs">{feed.rssUrl ?? "旧链接无法反推，请点击“更新 RSS 链接”生成新链接。"}</p>
            </div>
            <p className="text-xs text-muted">
              创建时间：{feed.createdAt} / 最近访问：{feed.lastAccessedAt ?? "-"} / 最近更新链接：{feed.rotatedAt ?? "-"}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
