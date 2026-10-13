# AVENTRA Security Baseline

## Non-negotiable rules

- Never commit `.env`, API keys, Telegram bot tokens, private keys, or user secrets.
- Treat secrets found in the legacy archive as compromised; revoke/rotate them before any reuse. Never copy secret values into documentation.
- Never request exchange API secrets in Telegram chat.
- Exchange API keys must have withdrawals disabled and the minimum required permissions.
- Use TLS for external communication.
- Authenticate signal producers with HMAC-SHA-256 or an equivalent standard mechanism; enforce timestamp windows and unique signal IDs to prevent replay.
- Apply server-side authorization to every user action and administrative endpoint.
- Rate-limit sensitive endpoints and Telegram commands.
- Redact tokens, API keys, secrets, authorization headers, and sensitive payloads from logs.
- Use idempotency keys for trade/order requests.
- Fail closed if risk checks, exchange state, or required market data are unavailable.
- Provide a global emergency disable switch and account/strategy-level disable switches.
- Record audit events for authentication, configuration changes, signal decisions, order transitions, and administrative actions.

## Live-trading gate

Live trading must remain disabled until secrets are managed securely, authorization and rate limits are tested, order states and partial fills pass failure simulations, restart/reconciliation tests pass, fee-aware reporting is validated, paper trading is reviewed, and an explicit release decision is recorded.

## Legacy archive warning

The legacy archive contains exposed credentials, weak reversible credential transformation, unsafe signal authentication, account-data exposure, and a test script that may attempt a real market order. Do not execute those files against a live account.
