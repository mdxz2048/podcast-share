"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type VisibilityMode = "closed" | "all_registered_users" | "audience_groups" | "specific_users";

type ProgramDetail = {
  id: string;
  title: string;
  cover_image_url?: string | null;
  publish_status: string;
  visibility_mode: VisibilityMode;
};

type VisibilityDetail = {
  visibilityMode: VisibilityMode;
  audienceGroups: Array<{ id: string; name: string }>;
  users: Array<{ id: string; email: string }>;
};

type AudienceGroup = { id: string; name: string };
type UserItem = { id: string; email: string };

function toIds(items: Array<{ id: string }>): string[] {
  return items.map((item) => item.id);
}

function toggleId(items: string[], id: string): string[] {
  return items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
}

export default function AdminProgramDetailPage({ params }: { params: { id: string } }) {
  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [mode, setMode] = useState<VisibilityMode>("closed");
  const [selectedAudienceGroupIds, setSelectedAudienceGroupIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<AudienceGroup[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [message, setMessage] = useState("加载中...");

  async function load() {
    const [programRes, visibilityRes, groupsRes, usersRes] = await Promise.all([
      fetch(`${apiBase}/admin/programs/${params.id}`, { credentials: "include" }),
      fetch(`${apiBase}/admin/programs/${params.id}/visibility`, { credentials: "include" }),
      fetch(`${apiBase}/admin/audience-groups`, { credentials: "include" }),
      fetch(`${apiBase}/admin/users`, { credentials: "include" })
    ]);

    const programJson = await programRes.json();
    const visibilityJson = await visibilityRes.json();
    const groupsJson = await groupsRes.json();
    const usersJson = await usersRes.json();

    if (!programRes.ok) {
      setMessage(programJson.message ?? "加载节目失败");
      return;
    }
    if (!visibilityRes.ok) {
      setMessage(visibilityJson.message ?? "加载可见性失败");
      return;
    }
    if (!groupsRes.ok) {
      setMessage(groupsJson.message ?? "加载用户类别失败");
      return;
    }
    if (!usersRes.ok) {
      setMessage(usersJson.message ?? "加载用户失败");
      return;
    }

    const visibility = visibilityJson as VisibilityDetail;
    const nextProgram = programJson as ProgramDetail;
    setProgram(nextProgram);
    setMode(visibility.visibilityMode);
    setSelectedAudienceGroupIds(toIds(visibility.audienceGroups));
    setSelectedUserIds(toIds(visibility.users));
    setCoverImageUrl(nextProgram.cover_image_url ?? "");

    setGroups((groupsJson.items ?? []).map((item: any) => ({ id: item.id, name: item.name })));
    setUsers((usersJson.items ?? []).map((item: any) => ({ id: item.id, email: item.email })));
    setMessage("");
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function submitVisibility() {
    const payload: {
      visibilityMode: VisibilityMode;
      audienceGroupIds?: string[];
      userIds?: string[];
    } = {
      visibilityMode: mode
    };

    if (mode === "audience_groups") {
      payload.audienceGroupIds = selectedAudienceGroupIds;
    }
    if (mode === "specific_users") {
      payload.userIds = selectedUserIds;
    }

    const res = await fetch(`${apiBase}/admin/programs/${params.id}/visibility`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "保存失败");
      return;
    }

    setMessage("可见范围已更新");
    await load();
  }

  async function submitProgramMeta() {
    const value = coverImageUrl.trim();
    const payload = {
      coverImageUrl: value.length > 0 ? value : null
    };

    const res = await fetch(`${apiBase}/admin/programs/${params.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "保存节目封面失败");
      return;
    }

    setMessage("节目封面已更新");
    await load();
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">节目可见性配置</h1>
      {program ? (
        <div className="card space-y-1">
          <p className="text-base font-medium">{program.title}</p>
          <p className="text-xs text-muted">发布状态：{program.publish_status}</p>
          <p className="text-xs text-muted">当前模式：{program.visibility_mode}</p>
        </div>
      ) : null}

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="card space-y-3">
        <label className="text-sm">节目封面 URL</label>
        <input
          className="input"
          onChange={(event) => setCoverImageUrl(event.target.value)}
          placeholder="https://example.com/podcast-cover.jpg"
          value={coverImageUrl}
        />
        <p className="text-xs text-muted">用于 RSS 中的节目封面显示。留空可清除。</p>
        <button className="button" onClick={submitProgramMeta}>
          保存封面
        </button>
      </div>

      <div className="card space-y-3">
        <label className="text-sm">可见范围</label>
        <select className="input" value={mode} onChange={(event) => setMode(event.target.value as VisibilityMode)}>
          <option value="closed">不开放</option>
          <option value="all_registered_users">所有注册用户</option>
          <option value="audience_groups">指定用户类别</option>
          <option value="specific_users">指定用户</option>
        </select>

        {mode === "audience_groups" ? (
          <div className="space-y-2">
            <p className="text-xs text-muted">可多选用户类别</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {groups.map((group) => (
                <label className="flex items-center gap-2 rounded border border-line px-3 py-2 text-sm" key={group.id}>
                  <input
                    checked={selectedAudienceGroupIds.includes(group.id)}
                    onChange={() => setSelectedAudienceGroupIds((current) => toggleId(current, group.id))}
                    type="checkbox"
                  />
                  <span>{group.name}</span>
                </label>
              ))}
            </div>
            {groups.length === 0 ? <p className="text-xs text-muted">暂无用户类别</p> : null}
          </div>
        ) : null}

        {mode === "specific_users" ? (
          <div className="space-y-2">
            <p className="text-xs text-muted">可多选用户</p>
            <div className="grid max-h-80 gap-2 overflow-auto sm:grid-cols-2">
              {users.map((user) => (
                <label className="flex items-center gap-2 rounded border border-line px-3 py-2 text-sm" key={user.id}>
                  <input
                    checked={selectedUserIds.includes(user.id)}
                    onChange={() => setSelectedUserIds((current) => toggleId(current, user.id))}
                    type="checkbox"
                  />
                  <span className="min-w-0 truncate">{user.email}</span>
                </label>
              ))}
            </div>
            {users.length === 0 ? <p className="text-xs text-muted">暂无用户</p> : null}
          </div>
        ) : null}

        <button className="button" onClick={submitVisibility}>
          保存
        </button>
      </div>
    </section>
  );
}
