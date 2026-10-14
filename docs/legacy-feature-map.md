# Legacy behavior map

This document records the intended behavior found during the review of the supplied `oldApproach.rar` archive. AVENTRA reimplements these workflows in its current TypeScript/PostgreSQL architecture rather than copying the old runtime wholesale.

## Feature parity targets

| Legacy behavior | AVENTRA implementation plan | Safety / correctness requirement |
| --- | --- | --- |
| Telegram onboarding and menus | Existing grammY bot, account registration and one-time Telegram linking | Never request exchange secrets in Telegram; only linked accounts can access their own data |
| Binance spot market data | Public price and symbol-rule adapters already implemented | HTTPS, validated payloads, timeouts, rate limits and quote freshness |
| Buy/sell signal workflows | Versioned signal validation and idempotent simulation orders | Authenticated signal source, expiry, replay prevention and duplicate-request protection |
| Buy orders and position tracking | Deterministic spot simulation engine, then durable order/position repository | Long-only spot semantics initially; explicit order/position state transitions |
| Profit targets and stop-loss | Exit rules evaluated against fresh quotes | Stop/target trigger precedence must be deterministic and tested |
| Trailing stops | High-water mark and derived trailing threshold | Never loosen a long position's trailing stop when price falls |
| Recurring purchases | Scheduled purchase intents | Per-user budget, frequency, exposure and emergency-stop limits |
| Partial fills | Fill ledger and remaining-quantity accounting | Quantity filled must never exceed requested quantity; exact decimal accounting |
| Reports and performance | Fee-aware realized/unrealized P&L and trade history | Derive metrics from persisted fills; don't rely on undefined or stale fields |
| Memberships / paid access | Entitlements and subscription/billing module after core trading is stable | Server-enforced entitlements; no client-side-only access decisions |
| Multilingual Telegram messages | Message catalog and locale selection | Safe fallback locale and parameter escaping |

## Legacy code that must not be carried forward unchanged

- Exposed exchange and Telegram credentials: rotate any real credentials that were ever present in the archive; never commit them.
- Reversible credential encoding: use authenticated encryption for exchange credentials at rest, with keys held outside the database, when credential storage is implemented.
- Custom signal hashes without a trusted signature/expiry/replay model: replace with authenticated signal validation and durable idempotency.
- Unauthenticated account-data endpoints: require authenticated ownership checks.
- Market-order test scripts that can sell assets: do not import or run them.
- Partial-fill ratio and precision/accounting defects: use exact decimal handling, exchange filters and an append-only fill ledger.
- Incomplete cancellation/stop-loss handling: model every order and position transition explicitly and reconcile uncertain outcomes.
- Fragile JSON-file persistence: use PostgreSQL transactions, constraints and migrations.
- Undefined trade metrics: calculate reports from persisted, fee-aware fills and snapshots.

## Delivery order

1. Preserve the existing foundation and public market-data adapter.
2. Build and test a deterministic simulation engine with no exchange credentials and no order-submission path.
3. Persist signals, orders, fills, positions, risk limits and idempotency keys in PostgreSQL.
4. Add Telegram commands that operate only on the authenticated linked account and simulation/paper mode.
5. Add recurring purchases, trailing stops, reports, memberships and localization.
6. Complete sustained paper trading, failure/recovery tests and explicit risk gates before any separate live-execution design.

The legacy archive is a behavior reference, not proof of a complete runnable application. No secret, live-order test script, or unsafe persistence/authentication mechanism should be copied.
