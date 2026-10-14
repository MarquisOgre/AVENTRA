import { z } from "zod";

const decimal = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
const positiveDecimal = decimal.refine((value) => /[1-9]/.test(value), "must be greater than zero");

export type ExitReason = "stop_loss" | "take_profit" | "trailing_stop";

export interface SimulatedTrade {
  id: string;
  userId: string;
  symbol: string;
  side: "long";
  quantity: string;
  entryPrice: string;
  stopLossPrice: string | null;
  takeProfitPrice: string | null;
  trailingStopPercent: string | null;
  highWatermark: string;
  trailingStopPrice: string | null;
  status: "open" | "closed";
  exitPrice: string | null;
  exitReason: ExitReason | null;
  openedAt: string;
  closedAt: string | null;
}

export interface OpenTradeInput {
  id: string;
  userId: string;
  symbol: string;
  quantity: string;
  entryPrice: string;
  stopLossPrice?: string | null;
  takeProfitPrice?: string | null;
  trailingStopPercent?: string | null;
  openedAt?: Date;
}

export type TradeValidationCode =
  | "invalid_id"
  | "invalid_user"
  | "invalid_symbol"
  | "invalid_quantity"
  | "invalid_entry_price"
  | "invalid_stop_loss"
  | "invalid_take_profit"
  | "invalid_trailing_stop";

export class TradeValidationError extends Error {
  constructor(public readonly code: TradeValidationCode) {
    super(code);
    this.name = "TradeValidationError";
  }
}

function compareDecimal(left: string, right: string): number {
  const normalize = (value: string) => {
    const [whole = "0", fraction = ""] = value.split(".");
    const trimmedWhole = whole.replace(/^0+(?=\d)/, "");
    const trimmedFraction = fraction.replace(/0+$/, "");
    return { whole: trimmedWhole, fraction: trimmedFraction };
  };
  const a = normalize(left);
  const b = normalize(right);
  if (a.whole.length !== b.whole.length) return a.whole.length > b.whole.length ? 1 : -1;
  if (a.whole !== b.whole) return a.whole > b.whole ? 1 : -1;
  const width = Math.max(a.fraction.length, b.fraction.length);
  const af = a.fraction.padEnd(width, "0");
  const bf = b.fraction.padEnd(width, "0");
  return af === bf ? 0 : af > bf ? 1 : -1;
}

function decimalToScaled(value: string, scaleDigits = 12): bigint {
  const [whole, fraction = ""] = value.split(".");
  const scaledFraction = fraction.padEnd(scaleDigits, "0").slice(0, scaleDigits);
  return BigInt(whole) * 10n ** BigInt(scaleDigits) + BigInt(scaledFraction ?? "0");
}

function scaledToDecimal(value: bigint, scaleDigits = 12): string {
  const base = 10n ** BigInt(scaleDigits);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(scaleDigits, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function deriveTrailingStop(highWatermark: string, percent: string): string {
  const scale = 10n ** 12n;
  const high = decimalToScaled(highWatermark);
  const pct = decimalToScaled(percent);
  // Percent is expressed as a percentage (e.g. "2.5" means 2.5%).
  const offset = (high * pct) / (100n * scale);
  return scaledToDecimal(high - offset);
}

function validatePrice(value: string | null | undefined, code: TradeValidationCode): string | null {
  if (value == null) return null;
  const parsed = positiveDecimal.safeParse(value);
  if (!parsed.success) throw new TradeValidationError(code);
  return parsed.data;
}

/** Opens a long-only simulated spot position. It never submits an exchange order. */
export function openSimulatedTrade(input: OpenTradeInput): SimulatedTrade {
  if (!z.string().uuid().safeParse(input.id).success) throw new TradeValidationError("invalid_id");
  if (!z.string().uuid().safeParse(input.userId).success) throw new TradeValidationError("invalid_user");
  const symbol = input.symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(symbol)) throw new TradeValidationError("invalid_symbol");
  const quantity = validatePrice(input.quantity, "invalid_quantity");
  const entryPrice = validatePrice(input.entryPrice, "invalid_entry_price");
  const stopLossPrice = validatePrice(input.stopLossPrice, "invalid_stop_loss");
  const takeProfitPrice = validatePrice(input.takeProfitPrice, "invalid_take_profit");
  const trailingStopPercent = validatePrice(input.trailingStopPercent, "invalid_trailing_stop");

  if (stopLossPrice && compareDecimal(stopLossPrice, entryPrice!) >= 0) {
    throw new TradeValidationError("invalid_stop_loss");
  }
  if (takeProfitPrice && compareDecimal(takeProfitPrice, entryPrice!) <= 0) {
    throw new TradeValidationError("invalid_take_profit");
  }
  if (trailingStopPercent && (compareDecimal(trailingStopPercent, "0") <= 0 || compareDecimal(trailingStopPercent, "100") >= 0)) {
    throw new TradeValidationError("invalid_trailing_stop");
  }

  return {
    id: input.id,
    userId: input.userId,
    symbol,
    side: "long",
    quantity: quantity!,
    entryPrice: entryPrice!,
    stopLossPrice,
    takeProfitPrice,
    trailingStopPercent,
    highWatermark: entryPrice!,
    trailingStopPrice: trailingStopPercent ? deriveTrailingStop(entryPrice!, trailingStopPercent) : null,
    status: "open",
    exitPrice: null,
    exitReason: null,
    openedAt: (input.openedAt ?? new Date()).toISOString(),
    closedAt: null,
  };
}

export type TradePriceEvaluation =
  | { status: "open"; trade: SimulatedTrade; changed: boolean }
  | { status: "closed"; trade: SimulatedTrade; reason: ExitReason };

export function evaluateSimulatedTradeAtPrice(
  trade: SimulatedTrade,
  priceInput: string,
  observedAt = new Date(),
): TradePriceEvaluation {
  const price = validatePrice(priceInput, "invalid_entry_price");
  if (trade.status === "closed") return { status: "closed", trade, reason: trade.exitReason! };

  const newHigh = compareDecimal(price!, trade.highWatermark) > 0 ? price! : trade.highWatermark;
  const trailingStopPrice = trade.trailingStopPercent
    ? deriveTrailingStop(newHigh, trade.trailingStopPercent)
    : null;
  const updated: SimulatedTrade = {
    ...trade,
    highWatermark: newHigh,
    trailingStopPrice: trailingStopPrice && (!trade.trailingStopPrice || compareDecimal(trailingStopPrice, trade.trailingStopPrice) > 0)
      ? trailingStopPrice
      : trade.trailingStopPrice,
  };

  // Deterministic precedence: hard stop-loss, then trailing stop, then profit target.
  let reason: ExitReason | null = null;
  if (updated.stopLossPrice && compareDecimal(price!, updated.stopLossPrice) <= 0) reason = "stop_loss";
  else if (updated.trailingStopPrice && compareDecimal(price!, updated.trailingStopPrice) <= 0) reason = "trailing_stop";
  else if (updated.takeProfitPrice && compareDecimal(price!, updated.takeProfitPrice) >= 0) reason = "take_profit";

  if (reason) {
    return {
      status: "closed",
      reason,
      trade: { ...updated, status: "closed", exitPrice: price!, exitReason: reason, closedAt: observedAt.toISOString() },
    };
  }
  const changed = updated.highWatermark !== trade.highWatermark || updated.trailingStopPrice !== trade.trailingStopPrice;
  return { status: "open", trade: updated, changed };
}
