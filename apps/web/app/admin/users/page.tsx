"use client";

import { useEffect, useMemo, useState } from "react";

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
  memberCount: number;
  updatedAt: string;
};

function statusLabel(status: string) {
  if (status === "active") return "正常";
  if (status === "disabled") return "停用";
  if (status === "pending") return "待验证";
  return status || "-";
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleString() : "-";
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [groups, setGroups] = useState<AudienceGroup[]>([]);
  const [selectedGroupByUser, setSelectedGroupByUser] = useState<Record<string, string>>({});
  const [groupName, setGroupName] = useState("");
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<AudienceGroup | null>(null);
  const [message, setMessage] = useState("加载中...");

  const stats = useMemo(
    () => ({
      users: users.length,
      verified: users.filter((user) => user.emailVerified).length,
      groups: groups.length,
      memberships: users.reduce((sum, user) => sum + user.audienceGroups.length, 0)
    }),
    [users, groups]
  );

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
    const loadedGroups = (groupsJson.items ?? []).map((item: any) => ({
      id: item.id,
      name: item.name,
      memberCount: item.memberCount ?? 0,
      updatedAt: item.updatedAt ?? ""
    }));
    setGroups(loadedGroups);

    const defaults: Record<string, string> = {};
    for (const user of usersJson.items ?? []) {
      defaults[user.id] = selectedGroupByUser[user.id] || loadedGroups[0]?.id || "";
    }
    setSelectedGroupByUser(defaults);
    setMessage("");
  }

  useEffect(() => {
    void load();
  }, []);

  async function createGroup() {
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      setMessage("请输入用户类别名称");
      return;
    }

    const res = await fetch(`${apiBase}/admin/audience-groups`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: trimmedName })
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "创建失败");
      return;
    }

    setGroupName("");
    setMessage("用户类别已创建");
    await load();
  }

  async function deleteGroup() {
    if (!deleteGroupTarget) return;
    const res = await fetch(`${apiBase}/admin/audience-groups/${deleteGroupTarget.id}`, {
      method: "DELETE",
      credentials: "include"
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "删除失败");
      return;
    }

    setDeleteGroupTarget(null);
    setMessage("用户类别已删除");
    await load();
  }

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
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">用户管理</h1>
        <p className="mt-1 text-sm text-muted">集中管理用户、用户类别和节目开放对象。</p>
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="text-xs text-muted">用户数</p>
          <p className="mt-2 text-2xl font-semibold">{stats.users}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="text-xs text-muted">已验证邮箱</p>
          <p className="mt-2 text-2xl font-semibold">{stats.verified}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="text-xs text-muted">用户类别</p>
          <p className="mt-2 text-2xl font-semibold">{stats.groups}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="text-xs text-muted">类别绑定</p>
          <p className="mt-2 text-2xl font-semibold">{stats.memberships}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">用户</h2>
            <span className="text-xs text-muted">{users.length} 个账号</span>
          </div>

          {users.map((user) => (
            <article className="card space-y-4" key={user.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-medium">{user.email}</h3>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${user.status === "active" ? "bg-emerald-500" : "bg-slate-300"}`} />
                      {statusLabel(user.status)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${user.emailVerified ? "bg-sky-500" : "bg-amber-500"}`} />
                      {user.emailVerified ? "邮箱已验证" : "邮箱未验证"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {user.audienceGroups.length ? (
                    user.audienceGroups.map((groupName) => (
                      <span className="rounded border border-line px-2 py-1 text-xs" key={groupName}>
                        {groupName}
                      </span>
                    ))
                  ) : (
                    <span className="rounded border border-line px-2 py-1 text-xs text-muted">暂无类别</span>
                  )}
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                <select
                  className="input"
                  value={selectedGroupByUser[user.id] ?? ""}
                  onChange={(event) =>
                    setSelectedGroupByUser((prev) => ({
                      ...prev,
                      [user.id]: event.target.value
                    }))
                  }
                >
                  {groups.length === 0 ? <option value="">暂无用户类别</option> : null}
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                <button className="button disabled:cursor-not-allowed disabled:opacity-50" disabled={groups.length === 0} onClick={() => attachGroup(user.id)}>
                  加入类别
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {groups.map((group) => {
                  const inGroup = user.audienceGroups.includes(group.name);
                  if (!inGroup) return null;
                  return (
                    <button className="button-secondary px-3 py-1.5 text-xs" key={group.id} onClick={() => detachGroup(user.id, group.id)}>
                      移出 {group.name}
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
          {users.length === 0 ? <p className="rounded-lg border border-dashed border-line p-6 text-sm text-muted">暂无用户。</p> : null}
        </section>

        <aside className="space-y-3">
          <section className="rounded-lg border border-line bg-white p-4">
            <h2 className="text-base font-medium">用户类别</h2>
            <p className="mt-1 text-xs text-muted">节目可按这些类别开放给不同用户。</p>
            <div className="mt-3 space-y-2">
              <input className="input" onChange={(event) => setGroupName(event.target.value)} placeholder="例如：付费用户" value={groupName} />
              <button className="button w-full" onClick={createGroup}>
                创建类别
              </button>
            </div>
          </section>

          <section className="space-y-2">
            {groups.map((group) => (
              <article className="rounded-lg border border-line bg-white p-4" key={group.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">{group.name}</h3>
                    <p className="mt-1 text-xs text-muted">成员：{group.memberCount}</p>
                    <p className="text-xs text-muted">更新：{formatDate(group.updatedAt)}</p>
                  </div>
                  <button className="button-secondary px-3 py-1.5 text-xs" onClick={() => setDeleteGroupTarget(group)}>
                    删除
                  </button>
                </div>
              </article>
            ))}
            {groups.length === 0 ? <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">还没有用户类别。</p> : null}
          </section>
        </aside>
      </div>

      {deleteGroupTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-lg border border-line bg-white p-5 shadow-xl">
            <h2 className="text-base font-medium">确认删除用户类别</h2>
            <p className="mt-2 text-sm text-muted">
              将删除「{deleteGroupTarget.name}」。用户会失去这个类别，按类别开放的节目也会受影响。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="button-secondary" onClick={() => setDeleteGroupTarget(null)}>
                取消
              </button>
              <button className="button" onClick={deleteGroup}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
