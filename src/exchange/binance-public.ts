import { z } from "zod";

const tickerPriceSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9]{3,20}$/),
  price: z.string().regex(/^\d+(?:\.\d+)?$/),
});

export type MarketDataErrorCode =
  | "invalid_symbol"
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
  price: number;
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

  async getSpotPrice(symbolInput: string): Promise<SpotPrice> {
    const symbol = symbolInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,20}$/.test(symbol)) {
      throw new MarketDataError("invalid_symbol");
    }

    const url = new URL("/api/v3/ticker/price", this.baseUrl);
    url.searchParams.set("symbol", symbol);

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

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MarketDataError("invalid_response");
    }

    const parsed = tickerPriceSchema.safeParse(payload);
    if (!parsed.success || parsed.data.symbol !== symbol) {
      throw new MarketDataError("invalid_response");
    }

    const price = Number(parsed.data.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new MarketDataError("invalid_response");
    }

    return { symbol, price, source: "binance", observedAt: new Date() };
  }
}
