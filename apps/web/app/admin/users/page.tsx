"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type UserItem = {
  id: string;
  email: string;
  emailVerified: boolean;
  status: string;
  audienceGroups: string[];
};

type AudienceGroup = {
  id: string;
  name: string;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [groups, setGroups] = useState<AudienceGroup[]>([]);
  const [selectedGroupByUser, setSelectedGroupByUser] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("加载中...");

  async function load() {
    const [usersRes, groupsRes] = await Promise.all([
      fetch(`${apiBase}/admin/users`, { credentials: "include" }),
      fetch(`${apiBase}/admin/audience-groups`, { credentials: "include" })
    ]);

    const usersJson = await usersRes.json();
    const groupsJson = await groupsRes.json();

    if (!usersRes.ok) {
      setMessage(usersJson.message ?? "加载用户失败");
      return;
    }
    if (!groupsRes.ok) {
      setMessage(groupsJson.message ?? "加载用户类别失败");
      return;
    }

    setUsers(usersJson.items ?? []);
    const loadedGroups = (groupsJson.items ?? []).map((item: any) => ({ id: item.id, name: item.name }));
    setGroups(loadedGroups);

    const defaults: Record<string, string> = {};
    for (const user of usersJson.items ?? []) {
      defaults[user.id] = loadedGroups[0]?.id ?? "";
    }
    setSelectedGroupByUser(defaults);
    setMessage("");
  }

  useEffect(() => {
    load();
  }, []);

  async function attachGroup(userId: string) {
    const groupId = selectedGroupByUser[userId];
    if (!groupId) {
      setMessage("请先选择一个用户类别");
      return;
    }

    const res = await fetch(`${apiBase}/admin/users/${userId}/audience-groups/${groupId}`, {
      method: "POST",
      credentials: "include"
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "添加失败");
      return;
    }

    setMessage("用户类别已更新");
    await load();
  }

  async function detachGroup(userId: string, groupId: string) {
    const res = await fetch(`${apiBase}/admin/users/${userId}/audience-groups/${groupId}`, {
      method: "DELETE",
      credentials: "include"
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "移除失败");
      return;
    }

    setMessage("用户已移出类别");
    await load();
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">用户管理</h1>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {groups.length === 0 ? <p className="text-sm text-muted">请先在“用户类别管理”创建类别。</p> : null}

      <div className="space-y-3">
        {users.map((user) => (
          <article className="card space-y-2" key={user.id}>
            <div>
              <h2 className="text-base font-medium">{user.email}</h2>
              <p className="text-xs text-muted">状态：{user.status} / 邮箱验证：{user.emailVerified ? "已验证" : "未验证"}</p>
              <p className="text-xs text-muted">当前类别：{user.audienceGroups.length ? user.audienceGroups.join("，") : "无"}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                className="input max-w-xs"
                value={selectedGroupByUser[user.id] ?? ""}
                onChange={(event) =>
                  setSelectedGroupByUser((prev) => ({
                    ...prev,
                    [user.id]: event.target.value
                  }))
                }
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <button className="button" onClick={() => attachGroup(user.id)}>
                加入类别
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {groups.map((group) => {
                const inGroup = user.audienceGroups.includes(group.name);
                if (!inGroup) {
                  return null;
                }
                return (
                  <button className="button-secondary" key={group.id} onClick={() => detachGroup(user.id, group.id)}>
                    移出 {group.name}
                  </button>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
