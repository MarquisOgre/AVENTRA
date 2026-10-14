const SCALE_DIGITS = 18;
const SCALE = 10n ** BigInt(SCALE_DIGITS);
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;

export function isDecimalString(value: string): boolean {
  return DECIMAL.test(value);
}

export function toScaledDecimal(value: string): bigint {
  if (!isDecimalString(value)) throw new Error("Invalid decimal value.");
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(SCALE_DIGITS, "0"));
}

export function fromScaledDecimal(value: bigint): string {
  const whole = value / SCALE;
  const fraction = (value % SCALE).toString().padStart(SCALE_DIGITS, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function compareDecimalStrings(left: string, right: string): number {
  const a = toScaledDecimal(left);
  const b = toScaledDecimal(right);
  return a === b ? 0 : a > b ? 1 : -1;
}

export function isMultipleOfStep(value: string, step: string): boolean {
  const increment = toScaledDecimal(step);
  if (increment <= 0n) return false;
  return toScaledDecimal(value) % increment === 0n;
}

export function multiplyDecimalStrings(left: string, right: string): string {
  return fromScaledDecimal((toScaledDecimal(left) * toScaledDecimal(right)) / SCALE);
}

export function addDecimalStrings(left: string, right: string): string {
  return fromScaledDecimal(toScaledDecimal(left) + toScaledDecimal(right));
}
