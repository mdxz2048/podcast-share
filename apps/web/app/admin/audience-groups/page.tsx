"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type AudienceGroup = {
  id: string;
  name: string;
  memberCount: number;
  updatedAt: string;
};

export default function AdminAudienceGroupsPage() {
  const [items, setItems] = useState<AudienceGroup[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("加载中...");

  async function load() {
    const res = await fetch(`${apiBase}/admin/audience-groups`, { credentials: "include" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "加载失败");
      return;
    }
    setItems(json.items ?? []);
    setMessage("");
  }

  useEffect(() => {
    load();
  }, []);

  async function createGroup() {
    if (!name.trim()) {
      setMessage("请输入用户类别名称");
      return;
    }

    const res = await fetch(`${apiBase}/admin/audience-groups`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: name.trim() })
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "创建失败");
      return;
    }

    setName("");
    setMessage("用户类别已创建");
    await load();
  }

  async function deleteGroup(groupId: string) {
    const res = await fetch(`${apiBase}/admin/audience-groups/${groupId}`, {
      method: "DELETE",
      credentials: "include"
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "删除失败");
      return;
    }

    setMessage("用户类别已删除");
    await load();
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">用户类别管理</h1>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="card space-y-3">
        <h2 className="text-base font-medium">新建用户类别</h2>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：付费用户" />
        <button className="button" onClick={createGroup}>
          创建
        </button>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <article className="card flex items-center justify-between" key={item.id}>
            <div>
              <h2 className="text-base font-medium">{item.name}</h2>
              <p className="text-xs text-muted">成员数：{item.memberCount}</p>
              <p className="text-xs text-muted">更新时间：{item.updatedAt}</p>
            </div>
            <button className="button-secondary" onClick={() => deleteGroup(item.id)}>
              删除
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
