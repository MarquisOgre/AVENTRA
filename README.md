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

## Current implementation status

- Fastify API and Telegram bot foundation are implemented.
- PostgreSQL migrations and connection pooling are implemented.
- Account registration, scrypt password hashing, bearer sessions, logout, and authenticated Telegram linking-code issuance are implemented.
- Admin-only account activation/suspension and one-time operator bootstrap are implemented, with protection against suspending the last active administrator.
- CI includes dependency auditing, type-checking, production build, database migrations, and PostgreSQL-backed authentication/linking integration tests.
- Binance public spot-price retrieval is implemented through a validated client and a rate-limited API endpoint. Exchange metadata, caching, trading simulation, and order execution are not implemented yet.
- Live trading remains disabled.

See `docs/operator-runbook.md` for local setup and initial administrator provisioning. Never run migrations or bootstrap commands against production without a reviewed deployment procedure.

## Project documents

- `docs/architecture.md`
- `docs/security-baseline.md`
- `docs/roadmap.md`
- `docs/phase-1-acceptance.md`
- `docs/phase-2-users.md`
- `docs/operator-runbook.md`
