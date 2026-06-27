"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Feed = {
  id: string;
  name: string;
  status: string;
};

type Program = {
  id: string;
  title: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

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
    setPrograms((programJson.items ?? []).map((item: any) => ({ id: item.id, title: item.title })));
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

    setMessage(`创建成功，请立即保存链接：${json.rssUrl}`);
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

      <div className="space-y-2">
        {feeds.map((feed) => (
          <article key={feed.id} className="card flex items-center justify-between">
            <div>
              <h3 className="text-base font-medium">{feed.name}</h3>
              <p className="text-xs text-muted">状态：{feed.status}</p>
            </div>
            <Link href={`/my/rss/${feed.id}`} className="text-sm text-accent">
              编辑
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
