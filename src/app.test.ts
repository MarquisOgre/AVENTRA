import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { buildApp } from "./app.js";

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function makeApp(databasePool?: Pool) {
  const app = buildApp({
    appName: "AVENTRA",
    tradingMode: "simulation",
    ...(databasePool ? { databasePool } : {}),
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

  it("rejects invalid registration input before touching persistence", async () => {
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
