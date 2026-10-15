import "dotenv/config";
import pino from "pino";
import { buildApp } from "./app.js";
import { createTelegramBot } from "./bot/create-bot.js";
import { appConfig } from "./config.js";
import { createDatabasePool } from "./db/pool.js";
import { BinanceSpotPublicClient } from "./exchange/binance-public.js";
import { startSimulationMonitor } from "./trading/monitor.js";

const logger = pino({
  level: appConfig.logLevel,
  redact: {
    paths: ["*.token", "*.apiKey", "*.apiSecret", "*.authorization", "req.headers.authorization"],
    censor: "[REDACTED]",
  },
});

const databasePool = appConfig.databaseUrl
  ? createDatabasePool({ connectionString: appConfig.databaseUrl })
  : undefined;

databasePool?.on("error", (error: unknown) => {
  logger.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Unexpected PostgreSQL pool error");
});

const app = buildApp({
  appName: appConfig.appName,
  tradingMode: appConfig.tradingMode,
  ...(databasePool ? { databasePool } : {}),
});

const bot = appConfig.telegramBotToken
  ? createTelegramBot({
      token: appConfig.telegramBotToken,
      logger,
      tradingMode: appConfig.tradingMode,
      ...(databasePool ? { databasePool } : {}),
    })
  : undefined;

const stopSimulationMonitor = databasePool && appConfig.tradingMode === "simulation"
  ? startSimulationMonitor({ pool: databasePool, marketDataClient: new BinanceSpotPublicClient(), logger, intervalMs: 10_000 })
  : undefined;

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down AVENTRA");
  bot?.stop();
  stopSimulationMonitor?.();
  await app.close();
  await databasePool?.end();
}

async function main(): Promise<void> {
  await app.listen({ host: appConfig.host, port: appConfig.port });
  logger.info({ app: appConfig.appName, mode: appConfig.tradingMode }, "AVENTRA API started");
  logger.warn("Trading execution is not implemented; this service cannot place exchange orders.");
  if (!databasePool) logger.warn("DATABASE_URL is empty; database-backed account linking is unavailable.");

  if (bot) {
    void bot.start({
      onStart: (botInfo) => logger.info({ username: botInfo.username }, "AVENTRA Telegram bot started"),
    }).catch((error: unknown) => {
      logger.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Telegram bot failed to start");
    });
  } else {
    logger.info("TELEGRAM_BOT_TOKEN is empty; starting API without Telegram polling");
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((error: unknown) => {
  logger.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "AVENTRA failed to start");
  process.exitCode = 1;
});
