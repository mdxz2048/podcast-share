import { describe, expect, it } from "vitest";
import { createOpaqueToken, hashOpaqueToken, hashPassword, verifyPassword } from "../src/utils/security.js";

describe("security utils", () => {
  it("hashes and verifies password", async () => {
    const hash = await hashPassword("Test123456");
    expect(await verifyPassword("Test123456", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("creates opaque token and deterministic hash", () => {
    const token = createOpaqueToken();
    expect(token.length).toBe(64);
    const hashA = hashOpaqueToken(token);
    const hashB = hashOpaqueToken(token);
    expect(hashA).toBe(hashB);
  });
});
