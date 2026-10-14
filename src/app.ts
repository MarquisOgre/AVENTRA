import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import type { Pool } from "pg";
import { getAccountForSession, loginAccount, registerAccount, revokeSession } from "./auth/service.js";
import { validatePassword } from "./auth/password.js";
import { issueTelegramLinkChallenge } from "./users/telegram-linking.js";
import { setAccountStatusByAdmin } from "./users/admin-actions.js";
import { randomUUID } from "node:crypto";
import { BinanceSpotPublicClient, MarketDataError } from "./exchange/binance-public.js";
import { createSimulatedTrade, listSimulatedTrades, SimulationRiskLimitError } from "./trading/repository.js";
import { openSimulatedTrade } from "./trading/simulation-engine.js";
import { compareDecimalStrings, isDecimalString, isMultipleOfStep, multiplyDecimalStrings } from "./trading/decimal.js";

export interface AppOptions {
  appName: string;
  tradingMode: "simulation" | "paper" | "live";
  databasePool?: Pool;
  marketDataClient?: Pick<BinanceSpotPublicClient, "getSpotPrice"> & Partial<Pick<BinanceSpotPublicClient, "getSpotSymbolRules">>;
  maxSimulationNotional?: string;
  maxSimulationExposure?: string;
  maxOpenSimulatedTradesPerUser?: number;
  maxMarketDataAgeMs?: number;
}

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(1).max(80),
});

const simulationTradeSchema = z.object({
  symbol: z.string().trim().min(3).max(20).regex(/^[A-Za-z0-9]+$/),
  quantity: z.string().regex(/^(?:0|[1-9]\\d*)(?:\\.\\d{1,18})?$/),
  stopLossPrice: z.string().regex(/^(?:0|[1-9]\\d*)(?:\\.\\d{1,18})?$/).optional(),
  takeProfitPrice: z.string().regex(/^(?:0|[1-9]\\d*)(?:\\.\\d{1,18})?$/).optional(),
  trailingStopPercent: z.string().regex(/^(?:0|[1-9]\\d*)(?:\\.\\d{1,5})?$/).optional(),
}).strict();

const simulationStatusSchema = z.enum(["open", "closed"]);
const adminStatusSchema = z.object({ status: z.enum(["active", "suspended"]) });
const userIdSchema = z.string().uuid();

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{40,60})$/.exec(header);
  return match?.[1] ?? null;
}

function databaseUnavailable(reply: { code: (status: number) => { send: (body: unknown) => unknown } }): unknown {
  return reply.code(503).send({ error: "service_unavailable" });
}

export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  const marketDataClient = options.marketDataClient ?? new BinanceSpotPublicClient();
  void app.register(rateLimit, { global: false });

  app.get("/health", async () => ({
    status: "ok",
    app: options.appName,
    tradingMode: options.tradingMode,
    liveTradingImplemented: false,
  }));

  app.get("/market-data/symbol-rules", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const query = z.object({ symbol: z.string().min(3).max(20) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_symbol" });

    if (!marketDataClient.getSpotSymbolRules) return reply.code(503).send({ error: "market_data_unavailable" });

    try {
      const rules = await marketDataClient.getSpotSymbolRules(query.data.symbol);
      return reply.code(200).send(rules);
    } catch (error) {
      if (error instanceof MarketDataError && error.code === "invalid_symbol") {
        return reply.code(400).send({ error: "invalid_symbol" });
      }
      if (error instanceof MarketDataError && error.code === "symbol_not_found") {
        return reply.code(404).send({ error: "symbol_not_found" });
      }
      if (error instanceof MarketDataError && error.code === "symbol_not_trading") {
        return reply.code(409).send({ error: "symbol_not_trading" });
      }
      if (error instanceof MarketDataError && error.code === "rate_limited") {
        return reply.code(429).send({ error: "market_data_rate_limited" });
      }
      if (error instanceof MarketDataError && error.code === "timeout") {
        return reply.code(504).send({ error: "market_data_timeout" });
      }
      request.log.error({ errorCode: error instanceof MarketDataError ? error.code : "unknown" }, "Symbol-rules request failed");
      return reply.code(503).send({ error: "market_data_unavailable" });
    }
  });

  app.get("/market-data/spot-price", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const query = z.object({ symbol: z.string().min(3).max(20) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_symbol" });

    try {
      const price = await marketDataClient.getSpotPrice(query.data.symbol);
      return reply.code(200).send(price);
    } catch (error) {
      if (error instanceof MarketDataError && error.code === "invalid_symbol") {
        return reply.code(400).send({ error: "invalid_symbol" });
      }
      if (error instanceof MarketDataError && error.code === "rate_limited") {
        return reply.code(429).send({ error: "market_data_rate_limited" });
      }
      if (error instanceof MarketDataError && error.code === "timeout") {
        return reply.code(504).send({ error: "market_data_timeout" });
      }
      request.log.error({ errorCode: error instanceof MarketDataError ? error.code : "unknown" }, "Market-data request failed");
      return reply.code(503).send({ error: "market_data_unavailable" });
    }
  });


  app.get("/simulation/trades", async (request, reply) => {
    if (!options.databasePool) return databaseUnavailable(reply);
    if (options.tradingMode === "live") return reply.code(409).send({ error: "live_trading_unavailable" });
    const token = bearerToken(request.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const query = z.object({ status: simulationStatusSchema.optional() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_query" });
    try {
      const account = await getAccountForSession(options.databasePool, token);
      if (!account) return reply.code(401).send({ error: "unauthorized" });
      if (account.status !== "active") return reply.code(403).send({ error: "account_not_active" });
      const trades = await listSimulatedTrades(options.databasePool, account.id, query.data.status ?? null);
      return reply.code(200).send({ trades });
    } catch (error) {
      request.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Simulation trade listing failed");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  app.post("/simulation/trades", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    if (!options.databasePool) return databaseUnavailable(reply);
    if (options.tradingMode === "live") return reply.code(409).send({ error: "live_trading_unavailable" });
    if (!marketDataClient.getSpotSymbolRules) return reply.code(503).send({ error: "market_data_unavailable" });
    const token = bearerToken(request.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const parsed = simulationTradeSchema.safeParse(request.body);
    if (!parsed.success || !isDecimalString(parsed.data?.quantity ?? "") || compareDecimalStrings(parsed.data?.quantity ?? "0", "0") <= 0) {
      return reply.code(400).send({ error: "invalid_simulation_trade" });
    }

    try {
      const account = await getAccountForSession(options.databasePool, token);
      if (!account) return reply.code(401).send({ error: "unauthorized" });
      if (account.status !== "active") return reply.code(403).send({ error: "account_not_active" });

      const symbol = parsed.data.symbol.toUpperCase();
      const [price, rules] = await Promise.all([
        marketDataClient.getSpotPrice(symbol),
        marketDataClient.getSpotSymbolRules(symbol),
      ]);
      const now = Date.now();
      const maxQuoteAgeMs = options.maxMarketDataAgeMs ?? 15_000;
      const priceAge = now - price.observedAt.getTime();
      const rulesAge = now - rules.observedAt.getTime();
      if (price.symbol !== symbol || rules.symbol !== symbol || priceAge < 0 || priceAge > maxQuoteAgeMs || rulesAge < 0 || rulesAge > 60_000) {
        return reply.code(503).send({ error: "market_data_stale" });
      }

      const quantity = parsed.data.quantity;
      if (compareDecimalStrings(quantity, rules.minQty) < 0 ||
          compareDecimalStrings(quantity, rules.maxQty) > 0 ||
          !isMultipleOfStep(quantity, rules.stepSize)) {
        return reply.code(400).send({ error: "quantity_outside_exchange_rules" });
      }

      for (const requestedPrice of [parsed.data.stopLossPrice, parsed.data.takeProfitPrice]) {
        if (requestedPrice !== undefined &&
            (compareDecimalStrings(requestedPrice, rules.minPrice) < 0 ||
             compareDecimalStrings(requestedPrice, rules.maxPrice) > 0 ||
             !isMultipleOfStep(requestedPrice, rules.tickSize))) {
          return reply.code(400).send({ error: "price_outside_exchange_rules" });
        }
      }

      if (!isDecimalString(price.price)) return reply.code(503).send({ error: "market_data_invalid" });
      const notional = multiplyDecimalStrings(price.price, quantity);
      if (rules.minNotional && compareDecimalStrings(notional, rules.minNotional) < 0) {
        return reply.code(400).send({ error: "below_minimum_notional" });
      }
      const maxNotional = options.maxSimulationNotional ?? "1000";
      if (compareDecimalStrings(notional, maxNotional) > 0) {
        return reply.code(400).send({ error: "simulation_order_limit_exceeded" });
      }

      const trade = openSimulatedTrade({
        id: randomUUID(),
        userId: account.id,
        symbol,
        quantity,
        entryPrice: price.price,
        stopLossPrice: parsed.data.stopLossPrice ?? null,
        takeProfitPrice: parsed.data.takeProfitPrice ?? null,
        trailingStopPercent: parsed.data.trailingStopPercent ?? null,
        openedAt: price.observedAt,
      });
      const saved = await createSimulatedTrade(options.databasePool, trade, {
        maxOpenTrades: options.maxOpenSimulatedTradesPerUser ?? 10,
        maxExposure: options.maxSimulationExposure ?? "5000",
      });
      return reply.code(201).send({ trade: saved, mode: options.tradingMode, liveOrdersPlaced: false });
    } catch (error) {
      if (error instanceof SimulationRiskLimitError) {
        if (error.code === "max_open_trades") return reply.code(409).send({ error: "maximum_open_simulated_trades_reached" });
        return reply.code(409).send({ error: "simulation_exposure_limit_exceeded" });
      }
      if (error instanceof MarketDataError) {
        if (error.code === "invalid_symbol") return reply.code(400).send({ error: "invalid_symbol" });
        if (error.code === "symbol_not_found") return reply.code(404).send({ error: "symbol_not_found" });
        if (error.code === "symbol_not_trading") return reply.code(409).send({ error: "symbol_not_trading" });
        if (error.code === "rate_limited") return reply.code(429).send({ error: "market_data_rate_limited" });
        if (error.code === "timeout") return reply.code(504).send({ error: "market_data_timeout" });
      }
      if (error instanceof Error && error.name === "TradeValidationError") {
        return reply.code(400).send({ error: "invalid_simulation_trade" });
      }
      request.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Simulation trade creation failed");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  app.get("/ready", async (_request, reply) => {
    if (!options.databasePool) {
      return reply.code(503).send({ status: "not_ready", reason: "database_not_configured" });
    }
    try {
      await options.databasePool.query("SELECT 1");
      return reply.code(200).send({ status: "ready", database: "ok" });
    } catch {
      return reply.code(503).send({ status: "not_ready", reason: "database_unavailable" });
    }
  });

  app.post("/auth/register", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    if (!options.databasePool) return databaseUnavailable(reply);
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success || !validatePassword(parsed.data?.password ?? "")) {
      return reply.code(400).send({ error: "invalid_registration_input", message: "Provide a valid email, display name, and a 12–128 character password." });
    }
    try {
      const account = await registerAccount(options.databasePool, parsed.data);
      return reply.code(201).send({ account });
    } catch (error) {
      if (error instanceof Error && error.message === "Unable to create account with these details.") {
        return reply.code(409).send({ error: "account_not_created", message: "Unable to create account with these details." });
      }
      if (error instanceof Error && error.message.startsWith("Invalid email")) {
        return reply.code(400).send({ error: "invalid_registration_input" });
      }
      request.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Account registration failed");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  app.post("/auth/login", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    if (!options.databasePool) return databaseUnavailable(reply);
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_login_input" });
    }
    try {
      const session = await loginAccount(options.databasePool, parsed.data);
      if (!session) return reply.code(401).send({ error: "invalid_credentials" });
      return reply.code(200).send(session);
    } catch (error) {
      request.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Account login failed");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  app.get("/auth/me", async (request, reply) => {
    if (!options.databasePool) return databaseUnavailable(reply);
    const token = bearerToken(request.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    try {
      const account = await getAccountForSession(options.databasePool, token);
      if (!account) return reply.code(401).send({ error: "unauthorized" });
      return reply.code(200).send({ account });
    } catch (error) {
      request.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Session lookup failed");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    if (!options.databasePool) return databaseUnavailable(reply);
    const token = bearerToken(request.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    try {
      await revokeSession(options.databasePool, token);
      return reply.code(200).send({ status: "logged_out" });
    } catch (error) {
      request.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Session revocation failed");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  app.post("/auth/telegram-link-code", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    if (!options.databasePool) return databaseUnavailable(reply);
    const token = bearerToken(request.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    try {
      const account = await getAccountForSession(options.databasePool, token);
      if (!account) return reply.code(401).send({ error: "unauthorized" });
      if (account.status !== "active") return reply.code(403).send({ error: "account_not_active" });
      const challenge = await issueTelegramLinkChallenge(options.databasePool, account.id);
      return reply.code(201).send(challenge);
    } catch (error) {
      request.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Telegram link code issuance failed");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  app.patch("/admin/users/:userId/status", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    if (!options.databasePool) return databaseUnavailable(reply);
    const token = bearerToken(request.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });

    const params = z.object({ userId: userIdSchema }).safeParse(request.params);
    const body = adminStatusSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "invalid_admin_action" });
    }

    try {
      const actor = await getAccountForSession(options.databasePool, token);
      if (!actor) return reply.code(401).send({ error: "unauthorized" });
      if (actor.status !== "active" || actor.role !== "admin") {
        return reply.code(403).send({ error: "forbidden" });
      }

      const result = await setAccountStatusByAdmin(options.databasePool, {
        actorUserId: actor.id,
        targetUserId: params.data.userId,
        status: body.data.status,
      });
      if (result.status === "forbidden") return reply.code(403).send({ error: "forbidden" });
      if (result.status === "not_found") return reply.code(404).send({ error: "user_not_found" });
      if (result.status === "invalid") return reply.code(400).send({ error: "invalid_admin_action" });
      if (result.status === "last_admin") return reply.code(409).send({ error: "cannot_suspend_last_admin" });
      return reply.code(200).send({ status: "updated" });
    } catch (error) {
      request.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Admin account status change failed");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  return app;
}
