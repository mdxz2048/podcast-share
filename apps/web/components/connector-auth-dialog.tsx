"use client";

import React, { useEffect, useState } from "react";

export type AuthJobEvent = {
  created_at: string;
  event_type: string;
  message: string | null;
  payload_json?: Record<string, unknown> | null;
};

export function currentQrChallenge(events: AuthJobEvent[], status: string) {
  if (["completed", "failed", "cancelled", "timeout"].includes(status)) return null;
  let challenge: { id: string; image: string; message: string; expiresAt?: string } | null = null;
  for (const event of events) {
    const payload = event.payload_json ?? {};
    const data = (payload.connectorEvent as Record<string, unknown> | undefined) ?? payload;
    if (["auth_challenge", "qr_image"].includes(event.event_type) &&
        typeof data.image_data_url === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(data.image_data_url)) {
      challenge = {
        id: typeof data.challenge_id === "string" ? data.challenge_id : event.created_at,
        image: data.image_data_url,
        message: event.message ?? "请扫码，并在手机上确认登录。",
        expiresAt: typeof data.expires_at === "string" ? data.expires_at : undefined
      };
    }
    if (event.event_type === "auth_result" && (!data.challenge_id || data.challenge_id === challenge?.id)) {
      challenge = null;
    }
  }
  return challenge;
}

export function ConnectorAuthDialog({ jobId, status, events }: { jobId: string; status: string; events: AuthJobEvent[] }) {
  const [dismissed, setDismissed] = useState("");
  const [now, setNow] = useState(Date.now());
  const challenge = currentQrChallenge(events, status);
  const expired = Boolean(challenge?.expiresAt && Date.parse(challenge.expiresAt) <= now);
  useEffect(() => setDismissed(""), [jobId]);
  useEffect(() => {
    setNow(Date.now());
    if (!challenge?.expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge?.expiresAt]);
  if (!challenge) return null;
  if (dismissed === challenge.id) {
    return <button className="button" onClick={() => setDismissed("")}>显示登录二维码</button>;
  }
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="qr-login-title" className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-xl">
        <h2 id="qr-login-title" className="text-lg font-semibold">扫码登录</h2>
        <p className="mt-2 text-sm text-muted">{challenge.message}</p>
        {expired ? <p className="my-6 text-amber-700">二维码已过期，请重新启动任务。</p> :
          <img alt="登录二维码" src={challenge.image} className="mx-auto my-4 max-h-[400px] max-w-full bg-white" />}
        <p className="text-sm text-muted">扫码后无需点击确认。登录成功后会自动继续下载。</p>
        <button className="button-secondary mt-4" onClick={() => setDismissed(challenge.id)}>暂时关闭</button>
      </div>
    </div>
  );
}
