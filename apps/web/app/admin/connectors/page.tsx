"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Connector = {
  id: string;
  name: string;
  displayName: string;
  status: string;
  latestVersion: string | null;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function AdminConnectorsPage() {
  const [items, setItems] = useState<Connector[]>([]);
  const [message, setMessage] = useState("加载中...");

  useEffect(() => {
    async function load() {
      const res = await fetch(`${apiBase}/admin/connectors`, { credentials: "include" });
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Connector 列表</h1>
        <Link className="button" href="/admin/connectors/upload">
          上传 ZIP
        </Link>
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      <div className="space-y-3">
        {items.map((item) => (
          <article className="card flex items-center justify-between" key={item.id}>
            <div>
              <h2 className="text-base font-medium">{item.displayName}</h2>
              <p className="text-xs text-muted">{item.name}</p>
              <p className="text-xs text-muted">状态：{item.status}</p>
              <p className="text-xs text-muted">最新版本：{item.latestVersion ?? "-"}</p>
            </div>
            <Link className="text-sm text-accent" href={`/admin/connectors/${item.id}`}>
              查看详情
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
