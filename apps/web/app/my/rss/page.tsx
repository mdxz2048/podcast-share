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
  const [rotateTarget, setRotateTarget] = useState<Feed | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Feed | null>(null);
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
    void load();
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

  async function rotateFeed() {
    if (!rotateTarget) return;
    const res = await fetch(`${apiBase}/me/rss-feeds/${rotateTarget.id}/rotate`, {
      method: "POST",
      credentials: "include"
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "更新失败");
      return;
    }
    setMessage(`新链接已生成：${json.rssUrl}`);
    setRotateTarget(null);
    await load();
  }

  async function deleteFeed() {
    if (!deleteTarget) return;
    const res = await fetch(`${apiBase}/me/rss-feeds/${deleteTarget.id}`, {
      method: "DELETE",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "RSS 已删除" : "删除失败"));
    if (res.ok) {
      setDeleteTarget(null);
      await load();
    }
  }

  function toggleProgram(programId: string) {
    setSelectedProgramIds((prev) => (prev.includes(programId) ? prev.filter((id) => id !== programId) : [...prev, programId]));
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">我的 RSS</h1>
        <p className="mt-1 text-sm text-muted">创建自己的订阅链接，选择节目后复制到播客客户端。</p>
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <section className="rounded-lg border border-line bg-white p-4">
          <h2 className="text-base font-medium">创建新 RSS</h2>
          <p className="mt-1 text-xs text-muted">名称会显示在你的 RSS 列表里，方便区分不同订阅。</p>
          <div className="mt-3 space-y-3">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="RSS 名称" />
            <div className="max-h-80 space-y-2 overflow-auto rounded border border-line p-3">
              {programs.map((program) => (
                <label className="flex items-center gap-2 text-sm" key={program.id}>
                  <input type="checkbox" checked={selectedProgramIds.includes(program.id)} onChange={() => toggleProgram(program.id)} />
                  {program.title}
                </label>
              ))}
              {programs.length === 0 ? <p className="text-sm text-muted">当前没有可选节目。</p> : null}
            </div>
            <button className="button w-full" onClick={createFeed} disabled={selectedProgramIds.length === 0}>
              创建 RSS
            </button>
          </div>
        </section>

        <section className="space-y-3">
          {feeds.map((feed) => (
            <article key={feed.id} className="rounded-lg border border-line bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-medium">{feed.name}</h3>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${feed.status === "active" ? "bg-emerald-500" : "bg-slate-300"}`} />
                      {feed.status}
                    </span>
                    <span>节目 {feed.programCount}</span>
                    <span>访问 {feed.requestCount}</span>
                    <span>估算订阅端 {feed.subscriberEstimate}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="button-secondary" onClick={() => copyUrl(feed)}>
                    复制链接
                  </button>
                  <button className="button-secondary" onClick={() => setRotateTarget(feed)}>
                    更新链接
                  </button>
                  <button className="button-secondary" onClick={() => setDeleteTarget(feed)}>
                    删除
                  </button>
                </div>
              </div>
              <div className="mt-4 rounded border border-line bg-slate-50 p-3">
                <p className="text-xs text-muted">当前订阅链接</p>
                <p className="mt-1 break-all font-mono text-xs">{feed.rssUrl ?? "旧链接无法反推，请点击“更新链接”生成新链接。"}</p>
              </div>
              <p className="mt-3 text-xs text-muted">
                创建时间：{feed.createdAt} / 最近访问：{feed.lastAccessedAt ?? "-"} / 最近更新链接：{feed.rotatedAt ?? "-"}
              </p>
            </article>
          ))}
          {feeds.length === 0 ? <p className="rounded-lg border border-dashed border-line p-6 text-sm text-muted">还没有 RSS 链接。</p> : null}
        </section>
      </div>

      {rotateTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-lg border border-line bg-white p-5 shadow-xl">
            <h2 className="text-base font-medium">更新 RSS 链接</h2>
            <p className="mt-2 text-sm text-muted">确认更新「{rotateTarget.name}」的 RSS 链接吗？旧链接会立即失效。</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="button-secondary" onClick={() => setRotateTarget(null)}>
                取消
              </button>
              <button className="button" onClick={rotateFeed}>
                确认更新
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-lg border border-line bg-white p-5 shadow-xl">
            <h2 className="text-base font-medium">删除 RSS</h2>
            <p className="mt-2 text-sm text-muted">确认删除 RSS「{deleteTarget.name}」吗？删除后该链接不可访问。</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="button-secondary" onClick={() => setDeleteTarget(null)}>
                取消
              </button>
              <button className="button" onClick={deleteFeed}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
