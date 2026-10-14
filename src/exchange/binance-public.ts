import { z } from "zod";

const decimalString = z.string().regex(/^\d+(?:\.\d+)?$/);
const tickerPriceSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9]{3,20}$/),
  price: decimalString,
});

const symbolFilterSchema = z.object({
  filterType: z.string(),
}).passthrough();

const exchangeInfoSchema = z.object({
  symbols: z.array(z.object({
    symbol: z.string().regex(/^[A-Z0-9]{3,20}$/),
    status: z.string(),
    baseAsset: z.string(),
    quoteAsset: z.string(),
    isSpotTradingAllowed: z.boolean().optional(),
    filters: z.array(symbolFilterSchema),
  })),
});

export type MarketDataErrorCode =
  | "invalid_symbol"
  | "symbol_not_found"
  | "symbol_not_trading"
  | "rate_limited"
  | "upstream_error"
  | "invalid_response"
  | "timeout";

export class MarketDataError extends Error {
  constructor(public readonly code: MarketDataErrorCode) {
    super(code);
    this.name = "MarketDataError";
  }
}

export interface SpotPrice {
  symbol: string;
  price: string;
  source: "binance";
  observedAt: Date;
}

export interface SpotSymbolRules {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: "TRADING";
  tickSize: string;
  minPrice: string;
  maxPrice: string;
  stepSize: string;
  minQty: string;
  maxQty: string;
  minNotional: string | null;
  source: "binance";
  observedAt: Date;
}

export interface BinancePublicClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Public market-data only. This client never sends credentials or places orders. */
export class BinanceSpotPublicClient {
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: BinancePublicClientOptions = {}) {
    this.baseUrl = new URL(options.baseUrl ?? "https://api.binance.com");
    if (this.baseUrl.protocol !== "https:" &&
        !(this.baseUrl.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(this.baseUrl.hostname))) {
      throw new Error("Binance public API base URL must use HTTPS.");
    }

    this.timeoutMs = options.timeoutMs ?? 5_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 250 || this.timeoutMs > 30_000) {
      throw new Error("Market-data timeout must be between 250 and 30000 milliseconds.");
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async getJson(url: URL): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new MarketDataError("timeout");
      }
      throw new MarketDataError("upstream_error");
    }

    if (response.status === 418 || response.status === 429) {
      throw new MarketDataError("rate_limited");
    }
    if (!response.ok) {
      throw new MarketDataError("upstream_error");
    }

    try {
      return await response.json();
    } catch {
      throw new MarketDataError("invalid_response");
    }
  }

  async getSpotPrice(symbolInput: string): Promise<SpotPrice> {
    const symbol = symbolInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,20}$/.test(symbol)) {
      throw new MarketDataError("invalid_symbol");
    }

    const url = new URL("/api/v3/ticker/price", this.baseUrl);
    url.searchParams.set("symbol", symbol);
    const parsed = tickerPriceSchema.safeParse(await this.getJson(url));
    if (!parsed.success || parsed.data.symbol !== symbol || Number(parsed.data.price) <= 0) {
      throw new MarketDataError("invalid_response");
    }

    return { symbol, price: parsed.data.price, source: "binance", observedAt: new Date() };
  }

  async getSpotSymbolRules(symbolInput: string): Promise<SpotSymbolRules> {
    const symbol = symbolInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,20}$/.test(symbol)) {
      throw new MarketDataError("invalid_symbol");
    }

    const url = new URL("/api/v3/exchangeInfo", this.baseUrl);
    url.searchParams.set("symbol", symbol);
    const parsed = exchangeInfoSchema.safeParse(await this.getJson(url));
    if (!parsed.success) throw new MarketDataError("invalid_response");

    const info = parsed.data.symbols.find((item) => item.symbol === symbol);
    if (!info) throw new MarketDataError("symbol_not_found");
    if (info.status !== "TRADING" || info.isSpotTradingAllowed === false) {
      throw new MarketDataError("symbol_not_trading");
    }

    const priceFilter = info.filters.find((item) => item.filterType === "PRICE_FILTER");
    const lotFilter = info.filters.find((item) => item.filterType === "LOT_SIZE");
    const notionalFilter = info.filters.find((item) =>
      item.filterType === "NOTIONAL" || item.filterType === "MIN_NOTIONAL",
    );

    const filterDecimals = (filter: Record<string, unknown>, keys: string[]) => {
      const values = Object.fromEntries(keys.map((key) => [key, filter[key]]));
      return Object.values(values).every((value) => typeof value === "string" && decimalString.safeParse(value).success);
    };

    if (!priceFilter || !lotFilter ||
        !filterDecimals(priceFilter, ["tickSize", "minPrice", "maxPrice"]) ||
        !filterDecimals(lotFilter, ["stepSize", "minQty", "maxQty"])) {
      throw new MarketDataError("invalid_response");
    }

    let minNotional: string | null = null;
    if (notionalFilter) {
      const candidate = notionalFilter["minNotional"];
      if (typeof candidate === "string" && decimalString.safeParse(candidate).success) {
        minNotional = candidate;
      }
    }

    return {
      symbol,
      baseAsset: info.baseAsset,
      quoteAsset: info.quoteAsset,
      status: "TRADING",
      tickSize: priceFilter["tickSize"] as string,
      minPrice: priceFilter["minPrice"] as string,
      maxPrice: priceFilter["maxPrice"] as string,
      stepSize: lotFilter["stepSize"] as string,
      minQty: lotFilter["minQty"] as string,
      maxQty: lotFilter["maxQty"] as string,
      minNotional,
      source: "binance",
      observedAt: new Date(),
    };
  }
}
