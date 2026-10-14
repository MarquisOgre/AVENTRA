import { describe, expect, it, vi } from "vitest";
import { BinanceSpotPublicClient, MarketDataError } from "./binance-public.js";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Binance public spot client", () => {
  it("fetches and validates a public spot price without credentials", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ symbol: "BTCUSDT", price: "65000.25" }));
    const client = new BinanceSpotPublicClient({ fetchImpl });
    const result = await client.getSpotPrice(" btcusdt ");

    expect(result).toMatchObject({
      symbol: "BTCUSDT",
      price: "65000.25",
      source: "binance",
    });
    expect(result.observedAt).toBeInstanceOf(Date);
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v3/ticker/price");
    expect(url.searchParams.get("symbol")).toBe("BTCUSDT");
    expect(init.headers).toEqual({ accept: "application/json" });
    expect(init.headers).not.toHaveProperty("X-MBX-APIKEY");
  });

  it("rejects malformed symbols before making a request", async () => {
    const fetchImpl = vi.fn();
    const client = new BinanceSpotPublicClient({ fetchImpl });
    await expect(client.getSpotPrice("BTC/USDT")).rejects.toMatchObject({ code: "invalid_symbol" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("handles exchange throttling without leaking response details", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: "private upstream detail" }, 429));
    const client = new BinanceSpotPublicClient({ fetchImpl });
    await expect(client.getSpotPrice("BTCUSDT")).rejects.toBeInstanceOf(MarketDataError);
    await expect(client.getSpotPrice("BTCUSDT")).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("rejects invalid prices and mismatched symbols", async () => {
    const badPrice = new BinanceSpotPublicClient({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ symbol: "BTCUSDT", price: "NaN" })),
    });
    await expect(badPrice.getSpotPrice("BTCUSDT")).rejects.toMatchObject({ code: "invalid_response" });

    const mismatched = new BinanceSpotPublicClient({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ symbol: "ETHUSDT", price: "1" })),
    });
    await expect(mismatched.getSpotPrice("BTCUSDT")).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("retrieves validated spot trading filters without converting decimals to floating point", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      symbols: [{
        symbol: "BTCUSDT",
        status: "TRADING",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        isSpotTradingAllowed: true,
        filters: [
          { filterType: "PRICE_FILTER", minPrice: "0.01000000", maxPrice: "1000000.00000000", tickSize: "0.01000000" },
          { filterType: "LOT_SIZE", minQty: "0.00001000", maxQty: "9000.00000000", stepSize: "0.00001000" },
          { filterType: "MIN_NOTIONAL", minNotional: "5.00000000", applyToMarket: true, avgPriceMins: 5 },
        ],
      }],
    }));
    const client = new BinanceSpotPublicClient({ fetchImpl });
    await expect(client.getSpotSymbolRules("btcusdt")).resolves.toMatchObject({
      symbol: "BTCUSDT",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      status: "TRADING",
      tickSize: "0.01000000",
      stepSize: "0.00001000",
      minQty: "0.00001000",
      minNotional: "5.00000000",
    });
    const [url] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v3/exchangeInfo");
    expect(url.searchParams.get("symbol")).toBe("BTCUSDT");
  });

  it("rejects symbols that are not trading", async () => {
    const client = new BinanceSpotPublicClient({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({
        symbols: [{
          symbol: "BTCUSDT",
          status: "BREAK",
          baseAsset: "BTC",
          quoteAsset: "USDT",
          filters: [
            { filterType: "PRICE_FILTER", minPrice: "0.01", maxPrice: "1000000", tickSize: "0.01" },
            { filterType: "LOT_SIZE", minQty: "0.00001", maxQty: "9000", stepSize: "0.00001" },
          ],
        }],
      })),
    });
    await expect(client.getSpotSymbolRules("BTCUSDT")).rejects.toMatchObject({ code: "symbol_not_trading" });
  });

  it("rejects insecure remote base URLs", () => {
    expect(() => new BinanceSpotPublicClient({ baseUrl: "http://example.com" })).toThrow("HTTPS");
  });
});
