import "dotenv/config";
import pino from "pino";
import { buildApp } from "./app.js";
import { appConfig } from "./config.js";

const logger = pino({
  level: appConfig.logLevel,
  redact: {
    paths: ["*.token", "*.apiKey", "*.apiSecret", "*.authorization", "req.headers.authorization"],
    censor: "[REDACTED]",
  },
});

const app = buildApp({
  logger,
  appName: appConfig.appName,
  tradingMode: appConfig.tradingMode,
});

async function main(): Promise<void> {
  await app.listen({ host: appConfig.host, port: appConfig.port });
  logger.info({ app: appConfig.appName, mode: appConfig.tradingMode }, "AVENTRA API started");
  logger.warn("Trading execution is not implemented; this service cannot place exchange orders.");
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "AVENTRA failed to start");
  process.exitCode = 1;
});
