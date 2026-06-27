"use client";

import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type VisibilityMode = "closed" | "all_registered_users" | "audience_groups" | "specific_users";

type ProgramDetail = {
  id: string;
  title: string;
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

function toIdsText(items: Array<{ id: string }>): string {
  return items.map((item) => item.id).join("\n");
}

function parseIdsText(value: string): string[] {
  return Array.from(new Set(value.split(/[\n,\s]+/).map((item) => item.trim()).filter(Boolean)));
}

export default function AdminProgramDetailPage({ params }: { params: { id: string } }) {
  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [mode, setMode] = useState<VisibilityMode>("closed");
  const [audienceGroupIdsText, setAudienceGroupIdsText] = useState("");
  const [userIdsText, setUserIdsText] = useState("");
  const [groups, setGroups] = useState<AudienceGroup[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
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
    setProgram(programJson as ProgramDetail);
    setMode(visibility.visibilityMode);
    setAudienceGroupIdsText(toIdsText(visibility.audienceGroups));
    setUserIdsText(toIdsText(visibility.users));

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
      payload.audienceGroupIds = parseIdsText(audienceGroupIdsText);
    }
    if (mode === "specific_users") {
      payload.userIds = parseIdsText(userIdsText);
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
        <label className="text-sm">可见范围</label>
        <select className="input" value={mode} onChange={(event) => setMode(event.target.value as VisibilityMode)}>
          <option value="closed">closed</option>
          <option value="all_registered_users">all_registered_users</option>
          <option value="audience_groups">audience_groups</option>
          <option value="specific_users">specific_users</option>
        </select>

        {mode === "audience_groups" ? (
          <>
            <p className="text-xs text-muted">每行一个 audience_group_id</p>
            <textarea className="input min-h-28" value={audienceGroupIdsText} onChange={(event) => setAudienceGroupIdsText(event.target.value)} />
            <p className="text-xs text-muted">可选用户类别：</p>
            <div className="space-y-1">
              {groups.map((group) => (
                <p className="text-xs text-muted" key={group.id}>
                  {group.name}: {group.id}
                </p>
              ))}
            </div>
          </>
        ) : null}

        {mode === "specific_users" ? (
          <>
            <p className="text-xs text-muted">每行一个 user_id</p>
            <textarea className="input min-h-28" value={userIdsText} onChange={(event) => setUserIdsText(event.target.value)} />
            <p className="text-xs text-muted">可选用户：</p>
            <div className="space-y-1">
              {users.slice(0, 50).map((user) => (
                <p className="text-xs text-muted" key={user.id}>
                  {user.email}: {user.id}
                </p>
              ))}
            </div>
          </>
        ) : null}

        <button className="button" onClick={submitVisibility}>
          保存
        </button>
      </div>
    </section>
  );
}
