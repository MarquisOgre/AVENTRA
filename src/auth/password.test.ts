import { describe, expect, it } from "vitest";
import { hashPassword, validatePassword, verifyPassword } from "./password.js";

describe("password security", () => {
  it("enforces a sensible password length range", () => {
    expect(validatePassword("short")).toBe(false);
    expect(validatePassword("a".repeat(12))).toBe(true);
    expect(validatePassword("a".repeat(129))).toBe(false);
  });

  it("hashes passwords and verifies only the matching password", async () => {
    const encoded = await hashPassword("correct horse battery staple");
    expect(encoded).not.toContain("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", encoded)).resolves.toBe(true);
    await expect(verifyPassword("incorrect password", encoded)).resolves.toBe(false);
    await expect(verifyPassword("anything", "invalid-hash")).resolves.toBe(false);
  });

  it("rejects passwords that are too short", async () => {
    await expect(hashPassword("short")).rejects.toThrow("12 and 128 characters");
  });
});
