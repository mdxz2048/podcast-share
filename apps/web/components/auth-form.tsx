"use client";

import { useState } from "react";

type Props = {
  endpoint: string;
  title: string;
  successMessage: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function AuthForm({ endpoint, title, successMessage }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const res = await fetch(`${apiBase}${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password })
    });

    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? "请求失败");
      setLoading(false);
      return;
    }

    setMessage(successMessage);
    setLoading(false);
  }

  return (
    <div className="card mx-auto max-w-md">
      <h1 className="mb-4 text-xl font-semibold">{title}</h1>
      <form className="space-y-3" onSubmit={onSubmit}>
        <input className="input" type="email" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          className="input"
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="button w-full" disabled={loading} type="submit">
          {loading ? "提交中..." : title}
        </button>
      </form>
      {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
    </div>
  );
}
