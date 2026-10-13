import { describe, expect, it } from "vitest";
import { canAdminister, canUseTradingFeatures, createUserSchema } from "./user.js";

describe("user domain", () => {
  it("trims display names and defaults new accounts to pending users", () => {
    expect(createUserSchema.parse({ displayName: "  Alex  " })).toMatchObject({
      displayName: "Alex",
      role: "user",
      status: "pending",
    });
  });

  it("rejects empty and oversized display names", () => {
    expect(createUserSchema.safeParse({ displayName: " " }).success).toBe(false);
    expect(createUserSchema.safeParse({ displayName: "x".repeat(81) }).success).toBe(false);
  });

  it("does not authorize pending or suspended accounts", () => {
    expect(canUseTradingFeatures({ role: "user", status: "pending" })).toBe(false);
    expect(canUseTradingFeatures({ role: "user", status: "suspended" })).toBe(false);
    expect(canUseTradingFeatures({ role: "user", status: "active" })).toBe(true);
  });

  it("requires an active admin for administration", () => {
    expect(canAdminister({ role: "admin", status: "pending" })).toBe(false);
    expect(canAdminister({ role: "user", status: "active" })).toBe(false);
    expect(canAdminister({ role: "admin", status: "active" })).toBe(true);
  });
});
