"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

function VerifyEmailContent() {
  const search = useSearchParams();
  const [message, setMessage] = useState("");
  const token = search.get("token") ?? "";

  async function verify() {
    const res = await fetch(`${apiBase}/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });
    const json = await res.json();
    setMessage(json.message ?? "请求失败");
  }

  return (
    <div className="card mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">邮箱验证</h1>
      <p className="text-sm text-muted">点击按钮完成邮箱验证。</p>
      <button className="button" onClick={verify}>
        立即验证
      </button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="card mx-auto max-w-xl">加载中...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
