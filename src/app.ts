import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";

export interface AppOptions {
  appName: string;
  tradingMode: "simulation" | "paper" | "live";
  databasePool?: Pool;
}

export function buildApp(options: AppOptions): FastifyInstance {
  // Application logging is handled by the shared Pino logger in the entry point.
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({
    status: "ok",
    app: options.appName,
    tradingMode: options.tradingMode,
    liveTradingImplemented: false,
  }));

  app.get("/ready", async (_request, reply) => {
    if (!options.databasePool) {
      return reply.code(503).send({
        status: "not_ready",
        reason: "database_not_configured",
      });
    }

    try {
      await options.databasePool.query("SELECT 1");
      return reply.code(200).send({ status: "ready", database: "ok" });
    } catch {
      return reply.code(503).send({
        status: "not_ready",
        reason: "database_unavailable",
      });
    }
  });

  return app;
}
