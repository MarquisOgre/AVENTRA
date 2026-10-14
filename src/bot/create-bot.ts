import { Bot } from "grammy";
import type { Pool } from "pg";
import { consumeTelegramLinkChallenge } from "../users/telegram-linking.js";
import type { Logger } from "pino";
import type { TradingMode } from "../core/trading-mode.js";
import { buildHelpMessage, buildStatusMessage } from "./messages.js";
import { listSimulatedTrades } from "../trading/repository.js";

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

  bot.command("trades", async (ctx) => {
    if (!options.databasePool || !ctx.from) {
      await ctx.reply("Trade history is temporarily unavailable.");
      return;
    }
    try {
      const linked = await options.databasePool.query<{ user_id: string; status: string }>(
        `SELECT u.id AS user_id, u.status
         FROM telegram_identities ti
         JOIN app_users u ON u.id = ti.user_id
         WHERE ti.telegram_user_id = $1`,
        [String(ctx.from.id)],
      );
      const account = linked.rows[0];
      if (!account) {
        await ctx.reply("Link your Telegram identity to an AVENTRA account first using /link <one-time-code>.");
        return;
      }
      if (account.status !== "active") {
        await ctx.reply("Your AVENTRA account is not active. Contact an administrator.");
        return;
      }
      const trades = await listSimulatedTrades(options.databasePool, account.user_id, "open");
      if (trades.length === 0) {
        await ctx.reply("You have no open simulation trades.");
        return;
      }
      const lines = trades.slice(0, 10).map((trade) =>
        `• ${trade.symbol} | Qty ${trade.quantity} | Entry ${trade.entryPrice}` +
        (trade.stopLossPrice ? ` | SL ${trade.stopLossPrice}` : "") +
        (trade.takeProfitPrice ? ` | TP ${trade.takeProfitPrice}` : "") +
        (trade.trailingStopPrice ? ` | Trail ${trade.trailingStopPrice}` : ""),
      );
      await ctx.reply(["Your open simulation trades (not live orders):", "", ...lines].join("\n"));
    } catch (error) {
      options.logger.error({
        errorName: error instanceof Error ? error.name : "UnknownError",
      }, "Telegram trade history lookup failed");
      await ctx.reply("Trade history could not be loaded right now.");
    }
  });

  bot.command("link", async (ctx) => {
    const code = String(ctx.match ?? "").trim();
    if (!options.databasePool) {
      await ctx.reply("Account linking is temporarily unavailable.");
      return;
    }
    if (!code || !ctx.from) {
      await ctx.reply("Usage: /link <one-time-code>. Generate the code from your authenticated AVENTRA account.");
      return;
    }
    try {
      const result = await consumeTelegramLinkChallenge(options.databasePool, {
        code,
        telegramUserId: String(ctx.from.id),
        username: ctx.from.username ?? null,
      });
      if (result.status === "linked") {
        await ctx.reply("Telegram identity linked. Your account status is unchanged.");
      } else if (result.status === "expired") {
        await ctx.reply("This linking code expired. Generate a new one.");
      } else if (result.status === "already_linked") {
        await ctx.reply("This Telegram identity or account is already linked elsewhere.");
      } else {
        await ctx.reply("This linking code is invalid or has already been used.");
      }
    } catch {
      await ctx.reply("Account linking failed temporarily. Please try again later.");
    }
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
