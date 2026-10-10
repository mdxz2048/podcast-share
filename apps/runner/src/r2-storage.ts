import { createHash, createHmac } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { request } from "node:https";
import { z } from "zod";

const configSchema = z.object({ endpoint: z.string().url(), bucket: z.string().min(1),
  accessKeyId: z.string().min(1), secretAccessKey: z.string().min(1) });
export type R2Config = z.infer<typeof configSchema>;
export function loadR2Config(): R2Config | null {
  const path = process.env.R2_CONFIG_PATH;
  if (!path) return null;
  const config = configSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  if (new URL(config.endpoint).protocol !== "https:") throw new Error("R2 requires HTTPS");
  return config;
}
export function signedHeaders(config: R2Config, method: string, path: string, hash: string,
  extra: Record<string, string> = {}, now = new Date()) {
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = stamp.slice(0, 8);
  const headers: Record<string, string> = { host: new URL(config.endpoint).host,
    "x-amz-date": stamp, "x-amz-content-sha256": hash, ...extra };
  const keys = Object.keys(headers).sort();
  const names = keys.join(";");
  const canonical = `${method}\n${path}\n\n${keys.map(k => `${k}:${headers[k]}\n`).join("")}\n${names}\n${hash}`;
  const scope = `${date}/auto/s3/aws4_request`;
  const mac = (key: string | Buffer, value: string) => createHmac("sha256", key).update(value).digest();
  const key = mac(mac(mac(mac(`AWS4${config.secretAccessKey}`, date), "auto"), "s3"), "aws4_request");
  const signature = createHmac("sha256", key).update(`AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${createHash("sha256").update(canonical).digest("hex")}`).digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${names}, Signature=${signature}`;
  return headers;
}
async function operation(config: R2Config, method: "PUT" | "HEAD", key: string, hash: string, file?: string, size?: number) {
  const path = `/${encodeURIComponent(config.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const extra: Record<string, string> = method === "PUT" ? { "content-type": "audio/mpeg", "content-length": String(size), "x-amz-meta-sha256": hash } : {};
  return new Promise<{ status: number; length: number; checksum?: string }>((resolve, reject) => {
    const req = request(new URL(path, config.endpoint), { method, headers: signedHeaders(config, method, path, hash, extra) }, res => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode ?? 0, length: Number(res.headers["content-length"]), checksum: res.headers["x-amz-meta-sha256"] as string | undefined }));
      res.on("error", reject);
    });
    req.setTimeout(120_000, () => req.destroy(new Error("R2 request timed out")));
    req.on("error", reject);
    if (file) {
      const stream = createReadStream(file);
      stream.on("error", error => req.destroy(error));
      req.on("close", () => stream.destroy());
      stream.pipe(req);
    } else req.end();
  });
}
export async function uploadAudio(config: R2Config, file: string, namespace: string) {
  const size = (await stat(file)).size;
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  const checksum = digest.digest("hex");
  const identity = createHash("sha256").update(namespace).digest("hex");
  const key = `audio/${identity}/${checksum}.mp3`;
  const empty = createHash("sha256").update("").digest("hex");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let head = await operation(config, "HEAD", key, empty);
      if (head.status === 404) {
        const put = await operation(config, "PUT", key, checksum, file, size);
        if (put.status !== 200) throw new Error(`R2 upload HTTP ${put.status}`);
        head = await operation(config, "HEAD", key, empty);
      }
      if (head.status !== 200 || head.length !== size || head.checksum !== checksum) throw new Error(`R2 verification failed (HTTP ${head.status})`);
      return { key, checksum, size, bucket: config.bucket };
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw new Error("R2 upload failed");
}
