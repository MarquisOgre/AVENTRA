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

  it("rejects insecure remote base URLs", () => {
    expect(() => new BinanceSpotPublicClient({ baseUrl: "http://example.com" })).toThrow("HTTPS");
  });
});
