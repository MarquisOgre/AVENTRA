import { Bot } from "grammy";
import type { Pool } from "pg";
import { consumeTelegramLinkChallenge } from "../users/telegram-linking.js";
import type { Logger } from "pino";
import type { TradingMode } from "../core/trading-mode.js";
import { buildHelpMessage, buildStatusMessage } from "./messages.js";

export interface CreateBotOptions {
  token: string;
  logger: Logger;
  tradingMode: TradingMode;
  databasePool?: Pool;
}

/** Creates the initial read-only Telegram interface. It has no trading commands. */
export function createTelegramBot(options: CreateBotOptions): Bot {
  const bot = new Bot(options.token);

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Welcome to AVENTRA. The platform is under development. Use /help to see available commands.",
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(buildHelpMessage());
  });

  bot.command("status", async (ctx) => {
    await ctx.reply(buildStatusMessage(options.tradingMode));
  });

  bot.catch((error) => {
    // Do not log the full Telegram error or update payload; they may contain sensitive data.
    options.logger.error(
      {
        updateId: error.ctx.update.update_id,
        errorName: error.error instanceof Error ? error.error.name : "UnknownError",
      },
      "Telegram update handling failed",
    );
  });

  return bot;
}
