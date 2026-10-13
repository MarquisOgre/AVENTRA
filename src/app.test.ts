import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { buildApp } from "./app.js";
import type { BinanceSpotPublicClient } from "./exchange/binance-public.js";

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function makeApp(databasePool?: Pool, marketDataClient?: Pick<BinanceSpotPublicClient, "getSpotPrice">) {
  const app = buildApp({
    appName: "AVENTRA",
    tradingMode: "simulation",
    ...(databasePool ? { databasePool } : {}),
    ...(marketDataClient ? { marketDataClient } : {}),
  });
  apps.push(app);
  return app;
}

describe("AVENTRA API foundation", () => {
  it("reports health without claiming trading is implemented", async () => {
    const response = await makeApp().inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      app: "AVENTRA",
      tradingMode: "simulation",
      liveTradingImplemented: false,
    });
  });

  it("serves validated public spot-price data", async () => {
    const observedAt = new Date("2026-10-13T00:00:00.000Z");
    const getSpotPrice = vi.fn().mockResolvedValue({
      symbol: "BTCUSDT",
      price: "65000",
      source: "binance",
      observedAt,
    });
    const response = await makeApp(undefined, { getSpotPrice }).inject({
      method: "GET",
      url: "/market-data/spot-price?symbol=btcusdt",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      symbol: "BTCUSDT",
      price: 65000,
      source: "binance",
      observedAt: observedAt.toISOString(),
    });
    expect(getSpotPrice).toHaveBeenCalledWith("btcusdt");
  });

  it("maps upstream market-data failures to a safe service response", async () => {
    const getSpotPrice = vi.fn().mockRejectedValue(new Error("private upstream details"));
    const response = await makeApp(undefined, { getSpotPrice }).inject({
      method: "GET",
      url: "/market-data/spot-price?symbol=BTCUSDT",
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "market_data_unavailable" });
    expect(response.body).not.toContain("private upstream details");
  });

  it("fails closed for registration when the database is not configured", async () => {
    const response = await makeApp().inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "not-an-email", password: "short", displayName: "" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "service_unavailable" });
  });

  it("requires a bearer session before issuing Telegram link codes", async () => {
    const response = await makeApp().inject({
      method: "POST",
      url: "/auth/telegram-link-code",
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "service_unavailable" });
  });

  it("rejects admin status changes without a bearer session", async () => {
    const query = vi.fn();
    const pool = { query } as unknown as Pool;
    const response = await makeApp(pool).inject({
      method: "PATCH",
      url: "/admin/users/00000000-0000-4000-8000-000000000001/status",
      payload: { status: "active" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(query).not.toHaveBeenCalled();
  });

  it("forbids a regular active user from using admin status changes", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        id: "actor-id",
        email: "user@example.test",
        display_name: "Regular User",
        status: "active",
        role: "user",
      }],
    });
    const connect = vi.fn();
    const pool = { query, connect } as unknown as Pool;
    const response = await makeApp(pool).inject({
      method: "PATCH",
      url: "/admin/users/00000000-0000-4000-8000-000000000001/status",
      headers: { authorization: `Bearer ${"A".repeat(43)}` },
      payload: { status: "active" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "forbidden" });
    expect(query).toHaveBeenCalledOnce();
    expect(connect).not.toHaveBeenCalled();
  });

  it("reports not-ready when no database is configured", async () => {
    const response = await makeApp().inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: "not_ready",
      reason: "database_not_configured",
    });
  });

  it("reports ready only after a database query succeeds", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const pool = { query } as unknown as Pool;
    const response = await makeApp(pool).inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready", database: "ok" });
    expect(query).toHaveBeenCalledWith("SELECT 1");
  });

  it("reports not-ready when the database query fails", async () => {
    const query = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const pool = { query } as unknown as Pool;
    const response = await makeApp(pool).inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: "not_ready",
      reason: "database_unavailable",
    });
  });
});
