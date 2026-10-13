import Fastify, { type FastifyInstance } from "fastify";

export interface AppOptions {
  appName: string;
  tradingMode: "simulation" | "paper" | "live";
}

export function buildApp(options: AppOptions): FastifyInstance {
  // Application logging is handled by the shared Pino logger in the entry point.
  // Fastify's internal logger is disabled to keep logger types decoupled.
  const app = Fastify({ logger: false });

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
