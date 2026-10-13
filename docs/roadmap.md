# AVENTRA Roadmap

## Phase 1 — Foundation and legacy audit
- Inventory legacy modules and dependencies.
- Document security and trading defects.
- Confirm architecture and initial stack.
- Establish type-check/test workflow.
- Define data model and execution state machine.
- Keep all trading in simulation.

## Phase 2 — Telegram bot and users
- Bot initialization and command routing.
- User registration and Telegram identity linking.
- Authorization, account status, and admin roles.
- Safe error messages and rate limits.

## Phase 3 — Binance integration
- Public market data.
- Exchange metadata and filters.
- Balance and order adapter contracts.
- Mock exchange tests before authenticated connectivity.

## Phase 4 — Trading engine
- Signal validation and replay prevention.
- Order/trade state machine.
- Partial fills and duplicate-request prevention.
- Durable persistence and reconciliation.

## Phase 5 — Risk management
- Per-order sizing limits.
- Account/strategy exposure limits.
- Maximum concurrent trades.
- Stop-loss and profit-target behavior.
- Emergency disablement.

## Phase 6 — Strategy automation
- Strategy configuration and lifecycle.
- Trailing stops.
- Recurring purchases with strict exposure caps.

## Phase 7 — Analytics and commercial features
- Fee-aware reports.
- Notifications and administration.
- Subscription plans, entitlements, and billing.

## Phase 8 — Production readiness
- Security and failure-mode review.
- Paper-trading period.
- Monitoring, backup, and recovery exercises.
- Explicit live-trading release gate.
