"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type Source = {
  id: string;
  name: string;
  enabled: boolean;
  authStatus: string;
  connector: {
    displayName: string;
    version: string;
    versionId: string;
  };
};

type ConnectorOption = {
  id: string;
  displayName: string;
  status: string;
  latestVersion: string | null;
  latestVersionId: string | null;
};

export default function AdminSourcesPage() {
  const [items, setItems] = useState<Source[]>([]);
  const [connectors, setConnectors] = useState<ConnectorOption[]>([]);
  const [name, setName] = useState("默认 Source");
  const [connectorVersionId, setConnectorVersionId] = useState("");
  const [message, setMessage] = useState("加载中...");

  async function load() {
    const res = await fetch(`${apiBase}/admin/sources`, { credentials: "include" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "加载失败");
      return;
    }
    setItems(json.items ?? []);
    setMessage("");
  }

  async function loadConnectors() {
    const res = await fetch(`${apiBase}/admin/connectors`, { credentials: "include" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "Connector 列表加载失败");
      return;
    }

    const options = (json.items ?? []).filter(
      (item: ConnectorOption) => item.latestVersionId && item.status === "enabled"
    );
    setConnectors(options);
    if (!connectorVersionId && options.length > 0) {
      setConnectorVersionId(options[0].latestVersionId as string);
    }
  }

  useEffect(() => {
    void Promise.all([load(), loadConnectors()]);
  }, []);

  async function toggleEnabled(sourceId: string, nextEnabled: boolean) {
    const endpoint = nextEnabled ? "enable" : "disable";
    const res = await fetch(`${apiBase}/admin/sources/${sourceId}/${endpoint}`, {
      method: "POST",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "操作成功" : "操作失败"));
    await load();
  }

  async function deleteSource(sourceId: string, sourceName: string) {
    if (!confirm(`确认删除 Source「${sourceName}」吗？`)) {
      return;
    }

    const res = await fetch(`${apiBase}/admin/sources/${sourceId}`, {
      method: "DELETE",
      credentials: "include"
    });
    const json = await res.json();
    setMessage(json.message ?? (res.ok ? "Source 已删除" : "删除失败"));
    await load();
  }

  async function createSource() {
    if (!connectorVersionId) {
      setMessage("请先选择一个可用 Connector");
      return;
    }

    const res = await fetch(`${apiBase}/admin/sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        connectorVersionId,
        name,
        inputConfig: {},
        secretConfig: {},
        runPolicy: "manual_only"
      })
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "创建失败");
      return;
    }
    setMessage("Source 创建成功");
    await load();
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Source 列表</h1>
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="card space-y-3">
        <h2 className="text-base font-medium">创建 Source</h2>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Source 名称" />
        <select
          className="input"
          value={connectorVersionId}
          onChange={(event) => setConnectorVersionId(event.target.value)}
        >
          <option value="">请选择 Connector</option>
          {connectors.map((item) => (
            <option key={item.id} value={item.latestVersionId ?? ""}>
              {item.displayName}（{item.latestVersion ?? "-"}）
            </option>
          ))}
        </select>
        <p className="break-all text-xs text-muted">
          已选 Connector Version ID：{connectorVersionId || "-"}
        </p>
        <button className="button" onClick={createSource}>
          创建
        </button>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <article className="card flex items-center justify-between" key={item.id}>
            <div>
              <h2 className="text-base font-medium">{item.name}</h2>
              <p className="text-xs text-muted">Connector：{item.connector.displayName}</p>
              <p className="text-xs text-muted">版本：{item.connector.version}</p>
              <p className="text-xs text-muted">认证状态：{item.authStatus}</p>
              <p className="text-xs text-muted">启用状态：{item.enabled ? "已启用" : "未启用"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="button-secondary" onClick={() => toggleEnabled(item.id, !item.enabled)}>
                {item.enabled ? "停用" : "启用"}
              </button>
              <button className="button-secondary" onClick={() => deleteSource(item.id, item.name)}>
                删除
              </button>
              <Link className="text-sm text-accent" href={`/admin/sources/${item.id}`}>
                配置
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
