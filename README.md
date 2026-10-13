# AVENTRA

**Intelligent Trading. Automated Execution. Controlled Risk.**

AVENTRA is an independent, commercial, multi-user Telegram cryptocurrency trading platform. The initial exchange scope is Binance Spot. It is a separate project and must not share source code, credentials, databases, or deployment configuration with Alphentra or AVENTRO.

## Development principles

- Treat `oldApproach.rar` as a legacy reference only; do not copy its unsafe implementation wholesale.
- Start with simulated trading. Paper trading comes next. Live execution remains disabled until explicit readiness gates are met.
- Never ask users to send exchange API secrets through Telegram.
- Never enable withdrawals on exchange API keys.
- Every trade must have explicit order states, idempotency protection, audit events, and reconciliation.
- Fail closed when authentication, market data, exchange state, or risk checks are unavailable.
- Do not promise profits.

## Local location

`D:\\Git Projects\\AVENTRA`

## Proposed stack

- Node.js LTS + TypeScript
- grammY for Telegram
- Fastify for HTTP/API services
- Zod for input validation
- Pino for structured logging with secret redaction
- PostgreSQL for persistent state
- Vitest for automated tests

The exact database migration/ORM and background job approach will be confirmed during Phase 1.

## Project status

This repository is being initialized. No real trading functionality is implemented yet. Trading must begin in simulation; live order submission remains out of scope until security, trading-state, recovery, and paper-trading gates are passed.

## Phase 1 documents

- `docs/architecture.md`
- `docs/security-baseline.md`
- `docs/roadmap.md`
- `docs/phase-1-acceptance.md`
