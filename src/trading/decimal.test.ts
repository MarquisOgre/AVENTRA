import { describe, expect, it } from "vitest";
import { addDecimalStrings, compareDecimalStrings, isMultipleOfStep, multiplyDecimalStrings, normalizeDecimalString } from "./decimal.js";

describe("fixed-point decimal helpers", () => {
  it("compares values without floating-point conversion", () => {
    expect(compareDecimalStrings("0.000000000000000011", "0.000000000000000010")).toBe(1);
    expect(compareDecimalStrings("1.2000", "1.2")).toBe(0);
  });

  it("validates exchange quantity steps", () => {
    expect(isMultipleOfStep("0.0015", "0.0005")).toBe(true);
    expect(isMultipleOfStep("0.0016", "0.0005")).toBe(false);
    expect(isMultipleOfStep("1", "0")).toBe(false);
  });

  it("normalizes database numeric strings for clean API output", () => {
    expect(normalizeDecimalString("100.000000000000000000")).toBe("100");
    expect(normalizeDecimalString("0.000000010000000000")).toBe("0.00000001");
  });

  it("multiplies and adds decimal strings at fixed precision", () => {
    expect(multiplyDecimalStrings("0.1", "0.2")).toBe("0.02");
    expect(addDecimalStrings("1.25", "0.75")).toBe("2");
  });
});
