import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function makeApp() {
  const app = buildApp({
    logger: pino({ level: "silent" }),
    appName: "AVENTRA",
    tradingMode: "simulation",
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

  it("exposes a readiness endpoint", async () => {
    const response = await makeApp().inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });
  });
});
