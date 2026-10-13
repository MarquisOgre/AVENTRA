import { describe, expect, it } from "vitest";
import { buildHelpMessage, buildStatusMessage } from "./messages.js";

describe("Telegram informational messages", () => {
  it("warns users not to send exchange secrets in chat", () => {
    expect(buildHelpMessage()).toContain("Never send exchange API keys or secrets in Telegram chat.");
  });

  it("does not imply live trading or exchange connectivity is active", () => {
    const status = buildStatusMessage("simulation");
    expect(status).toContain("Live trading: disabled");
    expect(status).toContain("Exchange connection: not configured");
    expect(status).toContain("Order execution: not implemented");
  });
});
