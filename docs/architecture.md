# AVENTRA Architecture (Initial Proposal)

## Architecture style

Begin with a **modular monolith** in TypeScript. This is simpler to operate than premature microservices while preserving clear module boundaries for later scaling.

## Initial stack

- Runtime: Node.js LTS + TypeScript
- Telegram interface: grammY
- HTTP/API layer: Fastify
- Input validation: Zod
- Logging: Pino, with secret redaction
- Database: PostgreSQL (ORM/migrations decision to be finalized in Phase 1)
- Tests: Vitest
- Background jobs: choose a queue when order monitoring and scheduled tasks are implemented

## Logical modules

1. `bot` — Telegram commands and callbacks; no direct order execution logic.
2. `users` — users, Telegram identity linking, roles, and account status.
3. `auth` — linking verification and authorization.
4. `signals` — authenticated signal intake, schema validation, freshness checks, and replay prevention.
5. `strategies` — strategy definitions and configuration.
6. `risk` — independent pre-trade checks and account/strategy limits.
7. `trading` — trade/order state machines, idempotency, and reconciliation.
8. `exchanges/binance` — provider-neutral exchange interface and Binance adapter.
9. `reporting` — fee-aware realized/unrealized P&L and exports.
10. `billing` — subscription plans and entitlements, after core safety controls.
11. `admin` — restricted operations and audit trails.

## Execution boundary

Telegram submits an authorized request. The backend validates user permissions and risk limits. Trading services act through an exchange adapter. Requests, responses, and state transitions are persisted and reconciled. No Telegram command may bypass the risk engine.

## Trading modes

- **Simulation:** deterministic local simulated orders; no exchange connection.
- **Paper:** market data may be real, but orders and fills are simulated.
- **Live:** unavailable until a separate release gate is approved and tested.

## State and recovery

Order states must distinguish at least `created`, `submitted`, `accepted`, `partially_filled`, `filled`, `cancel_pending`, `cancelled`, `rejected`, and `unknown`. Never infer a fill from order count or an HTTP success alone. On startup and after connection interruptions, reconcile persisted state with the exchange before allowing new actions.
