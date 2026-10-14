# AVENTRA Roadmap

## Phase 1 — Foundation and legacy audit
- [x] Establish TypeScript application, HTTP API, and CI workflow.
- [x] Document architecture and security baseline.
- [x] Define data model and keep trading in simulation.
- [ ] Complete the legacy archive audit before reusing any code.

## Phase 2 — Telegram bot and users
- [x] Bot initialization and safe command routing.
- [x] User registration, password hashing, and session authentication.
- [x] Telegram identity linking with one-time hashed challenges.
- [x] Authorization, account status, and administrator roles.
- [x] Initial administrator bootstrap and audited account activation/suspension.
- [x] Rate limits on authentication and administrator status endpoints.
- [x] PostgreSQL migrations and integration tests in CI.
- [ ] Add Telegram per-user/per-chat rate limits.
- [ ] Review production session delivery, shared rate limiting, account recovery, and email verification.

## Phase 3 — Binance public market data
- [x] Add a validated public spot-price client with timeout and throttling handling.
- [x] Expose `GET /market-data/spot-price?symbol=BTCUSDT` with safe errors and per-process rate limiting.
- [x] Add exchange metadata and spot symbol filters (price tick, quantity step, bounds, and minimum notional where provided).
- [ ] Add freshness checks, caching, and service-level health metrics.
- [x] Add deterministic contract-style tests for symbol filters and market-data failure handling.
- [ ] Keep all exchange access public and unauthenticated until adapter contracts are reviewed.

## Phase 4 — Trading engine
- [ ] Signal validation and replay prevention.
- [ ] Order/trade state machine.
- [ ] Partial fills and duplicate-request prevention.
- [ ] Durable persistence and reconciliation.

## Phase 5 — Risk management
- [ ] Per-order sizing limits.
- [ ] Account/strategy exposure limits.
- [ ] Maximum concurrent trades.
- [ ] Stop-loss and profit-target behavior.
- [ ] Emergency disablement.

## Phase 6 — Strategy automation
- [ ] Strategy configuration and lifecycle.
- [ ] Trailing stops.
- [ ] Recurring purchases with strict exposure caps.

## Phase 7 — Analytics and commercial features
- [ ] Fee-aware reports.
- [ ] Notifications and administration.
- [ ] Subscription plans, entitlements, and billing.

## Phase 8 — Production readiness
- [ ] Security and failure-mode review.
- [ ] Sustained paper-trading period.
- [ ] Monitoring, backup, and recovery exercises.
- [ ] Explicit live-trading release gate.

**Live order execution remains disabled until the security, state-management, risk, recovery, and paper-trading gates pass.**
