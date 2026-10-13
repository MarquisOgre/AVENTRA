# Phase 2 — Users and Telegram Identity

## Implemented foundation
- Read-only Telegram commands: `/start`, `/help`, and `/status`.
- Zod-validated user input with explicit role and account-status values.
- Authorization helpers that deny trading features to pending and suspended accounts.
- Initial PostgreSQL schema for application users, a one-to-one Telegram identity link, and append-oriented audit events.

## Required before this phase is complete
- Add a PostgreSQL connection pool with bounded connections and graceful shutdown.
- Implement repository operations and transactional Telegram identity linking.
- Add a secure account-linking challenge; never trust a user-supplied Telegram ID as proof of identity.
- Add admin-only activation/suspension workflows and audit each change.
- Add per-user and per-chat rate limits to Telegram handlers.
- Add integration tests against a disposable PostgreSQL database.
- Ensure logs and audit metadata never include bot tokens, exchange credentials, or raw authentication challenges.

## Security rules
- New accounts default to `pending`; they are not authorized to trade.
- Telegram identity IDs are unique and can link to only one application account.
- Admin access requires both an active account and the admin role.
- This phase does not add exchange connectivity or order execution. Live trading remains blocked.
