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
- Admin-only `PATCH /admin/users/:userId/status` endpoint for activating or suspending other accounts.
- One-time operator-run initial administrator bootstrap command that refuses to run once any admin role exists.

## Account API foundation
- `POST /auth/register`: creates a pending user account. Passwords are hashed with scrypt; users cannot self-assign an admin role.
- `POST /auth/login`: returns an opaque bearer session token with a seven-day expiry.
- `GET /auth/me`: resolves the current bearer session.
- `POST /auth/logout`: revokes the current bearer session.
- `POST /auth/telegram-link-code`: authenticated users can request a one-time Telegram linking code. The code is shown only in the authenticated response and is stored as a hash.
- Authentication routes have an initial per-process rate limit of five requests per minute on registration, login, and linking-code issuance. Production deployments with multiple instances should configure a shared rate-limit store.
- Keep bearer tokens private. Use HTTPS in any deployed environment and never place tokens in URLs or logs.

## Required before this phase is complete
- Verify all migrations against a disposable PostgreSQL database and add an automated database integration test job.
- Add HTTP-level authorization tests for admin activation/suspension routes and verify them against a database-backed test fixture.
- Add per-user and per-chat rate limits to Telegram handlers; HTTP rate limits are currently per-process.
- Expand integration coverage for duplicate registration, session expiry, suspended-account behavior, and administrator bootstrap.
- Run the initial admin bootstrap command only from a trusted operator shell after the first account has registered. Set `BOOTSTRAP_ADMIN_EMAIL` only for that command, then remove it.
- Ensure logs and audit metadata never include bot tokens, exchange credentials, or raw authentication challenges.

## Security rules
- New accounts default to `pending`; they are not authorized to trade.
- Telegram identity IDs and application user IDs are unique across links.
- Linking challenges are random, short-lived, stored as hashes, and consumed in a transaction.
- Admin access requires both an active account and the admin role.
- This phase does not add exchange connectivity or order execution. Live trading remains blocked.
