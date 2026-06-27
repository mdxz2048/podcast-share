import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/utils/secrets.js";

describe("secret encryption", () => {
  it("encrypts and decrypts secret payload", () => {
    const value = "telegram-session-abc";
    const encrypted = encryptSecret(value);
    expect(encrypted.startsWith("v1:")).toBe(true);
    const plain = decryptSecret(encrypted);
    expect(plain).toBe(value);
  });

  it("fails on invalid payload format", () => {
    expect(() => decryptSecret("broken")).toThrow(/invalid secret payload/i);
  });
});
