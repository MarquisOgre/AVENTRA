# Phase 2 — Users and Telegram Identity

## Implemented foundation
- Read-only Telegram commands: `/start`, `/help`, and `/status`, plus the one-time `/link` command.
- Zod-validated user input with explicit role and account-status values.
- Authorization helpers that deny pending and suspended accounts from trading features.
- PostgreSQL schema for users, one-to-one Telegram identity links, audit events, and expiring link challenges.
- Bounded PostgreSQL pool and graceful shutdown.
- User repository for pending account creation and identity lookups.
- One-time linking codes stored as hashes, expiring after ten minutes, and consumed transactionally.
- Admin status-change service requiring an active admin and recording an audit event.

## Required before this phase is complete
- Build an authenticated account surface that issues linking codes only to the account owner. The issuance function must never be exposed as an unauthenticated endpoint.
- Add a reviewed migration runner and verify migrations against a disposable PostgreSQL database.
- Add admin-only activation/suspension routes or commands with authorization tests.
- Add per-user and per-chat rate limits to Telegram handlers.
- Add end-to-end tests against a disposable PostgreSQL database.
- Define secure initial admin provisioning; ordinary user creation cannot grant admin role.
- Ensure logs and audit metadata never include bot tokens, exchange credentials, or raw authentication challenges.

## Security rules
- New accounts default to `pending`; they are not authorized to trade.
- Telegram identity IDs and application user IDs are unique across links.
- Linking challenges are random, short-lived, stored as hashes, and consumed in a transaction.
- Admin access requires both an active account and the admin role.
- This phase does not add exchange connectivity or order execution. Live trading remains blocked.
