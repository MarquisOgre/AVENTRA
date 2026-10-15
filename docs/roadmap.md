# AVENTRA Roadmap

## Phase 1 — Foundation and legacy audit
- [x] Establish TypeScript application, HTTP API, and CI workflow.
- [x] Document architecture and security baseline.
- [x] Define data model and keep trading in simulation.
- [x] Audit legacy archive behavior and document parity/safety mapping in `docs/legacy-feature-map.md`.

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
- [x] Audit the supplied `oldApproach.rar` source as a behavior reference; map legacy commands and safety corrections.
- [x] Add deterministic long-only simulation trade lifecycle with stop-loss, profit-target and trailing-stop exits.
- [x] Port configurable profit target, stop-loss, re-buy threshold/budget/maximum and trailing activation/distance rules as pure simulation logic.
- [x] Add PostgreSQL tables for simulated positions and append-only trade events.
- [x] Add transactional PostgreSQL repository for simulation positions and append-only events, with owner-scoped queries and row-locked price evaluation.
- [x] Require idempotency keys for simulation trade creation and reject key reuse with different request parameters.
- [ ] Add authenticated signal provenance, expiry and replay prevention.
- [ ] Implement signal validation, authenticated provenance, expiry and replay prevention.
- [ ] Implement simulated fills, partial-fill ledger and order/trade reconciliation.
- [x] Add authenticated simulation trade create/list API with server-observed quotes, exchange filter validation, stale-data checks and per-user exposure limits.
- [x] Add `/trades` Telegram command for linked, active users to view their own open simulation positions.
- [x] Add a non-overlapping simulation monitor that reuses one Binance public quote per symbol and persists stop/target/trailing-stop updates; worker is disabled outside simulation mode.
- [ ] Add Telegram per-user/per-chat rate limits and authenticated simulation trade-creation workflow.

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
