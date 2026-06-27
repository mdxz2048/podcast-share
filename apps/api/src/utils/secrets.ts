import crypto from "node:crypto";

const fallbackKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function getKeyBuffer() {
  const keyHex = process.env.SECRET_ENCRYPTION_KEY ?? fallbackKey;
  if (!/^[a-f0-9]{64}$/i.test(keyHex)) {
    throw new Error("invalid SECRET_ENCRYPTION_KEY format");
  }
  return Buffer.from(keyHex, "hex");
}

export function encryptSecret(plainText: string): string {
  const key = getKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(cipherPayload: string): string {
  const key = getKeyBuffer();
  const [version, ivHex, tagHex, encryptedHex] = cipherPayload.split(":");
  if (version !== "v1" || !ivHex || !tagHex || !encryptedHex) {
    throw new Error("invalid secret payload format");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const plain = Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]);
  return plain.toString("utf8");
}
