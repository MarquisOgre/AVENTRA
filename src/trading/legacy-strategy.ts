import { z } from "zod";

const percent = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
const positiveDecimal = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/).refine((value) => /[1-9]/.test(value));

export const legacyStrategyConfigSchema = z.object({
  profitTargetPercent: percent.refine((value) => Number(value) > 0 && Number(value) <= 1000),
  stopLossEnabled: z.boolean(),
  stopLossPercent: percent.refine((value) => Number(value) > 0 && Number(value) < 100),
  maxRebuys: z.number().int().min(0).max(100),
  rebuyDropPercent: percent.refine((value) => Number(value) > 0 && Number(value) < 100),
  quoteAmountPerBuy: positiveDecimal,
  unfilledOrderTimeoutMinutes: z.number().int().min(1).max(1440),
  trailingStopEnabled: z.boolean(),
  trailingActivationPercent: percent.refine((value) => Number(value) >= 0 && Number(value) <= 1000),
  trailingDistancePercent: percent.refine((value) => Number(value) > 0 && Number(value) < 100),
}).strict();

export type LegacyStrategyConfig = z.infer<typeof legacyStrategyConfigSchema>;

export type RebuyDecision =
  | { shouldBuy: false; reason: "disabled" | "max_rebuys_reached" | "price_not_low_enough" | "insufficient_quote_balance" | "invalid_input" }
  | { shouldBuy: true; reason: "rebuy_threshold_reached"; quoteAmount: string };

export interface RebuyCheck {
  lastBuyPrice: string;
  currentPrice: string;
  completedRebuys: number;
  maxRebuys: number;
  dropPercent: string;
  quoteAmount: string;
  availableQuoteBalance: string;
}

/** Determines whether a DCA/re-buy should be proposed. It never places an order. */
export function evaluateRebuy(check: RebuyCheck): RebuyDecision {
  const values = [check.lastBuyPrice, check.currentPrice, check.dropPercent, check.quoteAmount, check.availableQuoteBalance];
  if (values.some((value) => !positiveDecimal.safeParse(value).success) ||
      !Number.isInteger(check.completedRebuys) || check.completedRebuys < 0 ||
      !Number.isInteger(check.maxRebuys) || check.maxRebuys < 0 ||
      !percent.safeParse(check.dropPercent).success || Number(check.dropPercent) <= 0 || Number(check.dropPercent) >= 100) {
    return { shouldBuy: false, reason: "invalid_input" };
  }
  if (check.completedRebuys >= check.maxRebuys) return { shouldBuy: false, reason: "max_rebuys_reached" };

  const scale = 1_000_000_000_000_000_000n;
  const lastPrice = scaled(check.lastBuyPrice);
  const currentPrice = scaled(check.currentPrice);
  const drop = scaled(check.dropPercent);
  const threshold = lastPrice - (lastPrice * drop) / (100n * scale);
  if (currentPrice > threshold) return { shouldBuy: false, reason: "price_not_low_enough" };
  if (scaled(check.availableQuoteBalance) < scaled(check.quoteAmount)) {
    return { shouldBuy: false, reason: "insufficient_quote_balance" };
  }
  return { shouldBuy: true, reason: "rebuy_threshold_reached", quoteAmount: check.quoteAmount };
}

export interface TrailingStopState {
  activated: boolean;
  highWatermark: string;
  stopPrice: string | null;
}

export interface TrailingStopUpdate {
  state: TrailingStopState;
  triggered: boolean;
  activatedNow: boolean;
  stopRaised: boolean;
}

function scaled(value: string): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000_000_000_000_000n + BigInt(fraction.padEnd(18, "0").slice(0, 18) || "0");
}

function decimal(value: bigint): string {
  const whole = value / 1_000_000_000_000_000_000n;
  const fraction = (value % 1_000_000_000_000_000_000n).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function compare(a: string, b: string): number {
  const left = scaled(a);
  const right = scaled(b);
  return left === right ? 0 : left > right ? 1 : -1;
}

/** Trailing logic for long spot positions: activate after a gain, then only ratchet upward. */
export function updateTrailingStop(
  state: TrailingStopState,
  entryPrice: string,
  currentPrice: string,
  activationPercent: string,
  distancePercent: string,
): TrailingStopUpdate {
  const valid = positiveDecimal.safeParse(entryPrice).success &&
    positiveDecimal.safeParse(currentPrice).success &&
    percent.safeParse(activationPercent).success &&
    positiveDecimal.safeParse(distancePercent).success;
  if (!valid || Number(activationPercent) > 1000 || Number(distancePercent) >= 100) {
    throw new Error("Invalid trailing-stop input.");
  }

  const entry = scaled(entryPrice);
  const price = scaled(currentPrice);
  const activation = scaled(activationPercent);
  const activationPrice = entry + (entry * activation) / (100n * 1_000_000_000_000_000_000n);
  const activatedNow = !state.activated && price >= activationPrice;
  const activated = state.activated || activatedNow;
  const highWatermark = compare(currentPrice, state.highWatermark) > 0 ? currentPrice : state.highWatermark;

  let stopPrice = state.stopPrice;
  if (activated) {
    const high = scaled(highWatermark);
    const distance = scaled(distancePercent);
    const candidate = decimal(high - (high * distance) / (100n * 1_000_000_000_000_000_000n));
    if (!stopPrice || compare(candidate, stopPrice) > 0) stopPrice = candidate;
  }

  return {
    state: { activated, highWatermark, stopPrice },
    triggered: Boolean(activated && stopPrice && compare(currentPrice, stopPrice) <= 0),
    activatedNow,
    stopRaised: Boolean(stopPrice && (!state.stopPrice || compare(stopPrice, state.stopPrice) > 0)),
  };
}
