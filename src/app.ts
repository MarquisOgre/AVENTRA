import Fastify, { type FastifyInstance } from "fastify";
import type { Logger } from "pino";

export interface AppOptions {
  logger: Logger;
  appName: string;
  tradingMode: "simulation" | "paper" | "live";
}

export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ loggerInstance: options.logger });

  app.get("/health", async () => ({
    status: "ok",
    app: options.appName,
    tradingMode: options.tradingMode,
    liveTradingImplemented: false,
  }));

  app.get("/ready", async (_request, reply) => {
    return reply.code(200).send({ status: "ready" });
  });

  return app;
}
