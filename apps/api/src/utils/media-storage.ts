import { env } from "../config.js";

export function r2PublicUrl(key: string): string {
  if (!env.R2_PUBLIC_BASE_URL) throw new Error("R2_PUBLIC_BASE_URL is not configured");
  if (!/^audio\/[a-f0-9]{64}\/[a-f0-9]{64}\.mp3$/.test(key)) throw new Error("Invalid R2 media key");
  return `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
}
