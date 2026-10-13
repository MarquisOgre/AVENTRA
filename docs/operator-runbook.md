# AVENTRA Operator Runbook

## Local prerequisites
- Node.js 22 or newer.
- PostgreSQL 16 or compatible.
- A Telegram bot token only if you want to run the bot locally.

## First local setup
1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to a dedicated AVENTRA database. Do not use a production database for development or CI.
3. Install packages with `npm install`.
4. Apply version-controlled migrations with `npm run db:migrate`.
5. Start the API with `npm run dev`.
6. Check `GET /health` and `GET /ready`. Readiness returns HTTP 503 until PostgreSQL is reachable.

## Register the first account
Send a registration request to the local API:

```sh
curl -X POST http://127.0.0.1:3000/auth/register \
  -H "content-type: application/json" \
  -d '{"email":"operator@example.com","password":"replace-with-a-long-unique-password","displayName":"Operator"}'
```

The new account starts as `pending` with the `user` role. Registration never grants administrator privileges.

## Bootstrap the initial administrator
Only after the intended account has been registered:

1. Set `BOOTSTRAP_ADMIN_EMAIL` in the trusted operator shell or local `.env` to the exact registered email.
2. Run `npm run admin:bootstrap`.
3. Confirm the command reports that the initial administrator was provisioned.
4. Remove `BOOTSTRAP_ADMIN_EMAIL` from the environment immediately afterward.

This is an operator-only command, not an HTTP endpoint. It refuses to run if any administrator role already exists. Do not run it against a shared or production database until the deployment procedure has been reviewed.

## Account API
- `POST /auth/register` — create a pending account.
- `POST /auth/login` — receive a bearer session token.
- `GET /auth/me` — inspect the current account using `Authorization: Bearer <token>`.
- `POST /auth/logout` — revoke the current session.
- `POST /auth/telegram-link-code` — issue a one-time code for an authenticated, active account.
- `PATCH /admin/users/:userId/status` — administrator-only activation or suspension.

Use HTTPS outside local development. Treat bearer tokens like passwords: never put them in URLs, logs, screenshots, or support chats.

## Telegram linking
After logging in, request a code from `POST /auth/telegram-link-code`, then send `/link <one-time-code>` to the configured Telegram bot. Codes expire after ten minutes and can only be used once. Never send exchange API keys or secrets to the bot.

## Current limitations
- No frontend account portal is included yet; account setup currently uses the API.
- CI runs migrations and integration tests against a disposable PostgreSQL service.
- Rate limiting is currently process-local; multi-instance production deployments need a shared store.
- Exchange connectivity, simulated execution, paper trading, and live trading are separate future milestones. Live trading is disabled.
