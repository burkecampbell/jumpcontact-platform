# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, contact **burke@jumpcontact.com** directly. Do not open a public issue.

## Authentication

- **Dashboard pages**: Gated by Clerk authentication. All routes except `/sign-in`, `/sign-up`, `/api/*`, and `/play/*` require an authenticated session.
- **API routes**: Public (no per-request auth). Protected by CORS origin restrictions.
- **Cron endpoints**: Require `CRON_SECRET` bearer token. Fail-closed — if the env var is unset, the endpoint returns 500.
- **Recording proxy**: Optionally gated by `RECORDING_API_KEY`. If unset, recordings are accessible via SID.

## CORS

Origins restricted to:
- `*.vercel.app` (production + preview deployments)
- `http://localhost:3003` (local development)
- Custom origin via `NEXT_PUBLIC_APP_URL` env var

Wildcard (`*`) is **not** used.

## Secrets Management

- All secrets stored in Vercel environment variables (production-scoped)
- `.env.example` documents required vars with placeholder values
- `.env*.local` files are gitignored
- No secrets hardcoded in source code
- Twilio credentials, Google service account keys, and Clerk keys are never exposed client-side

## Data Access

- Google Sheets: Read-only access via service account (`sheets-api-jump@...`)
- Twilio: Read-only CDR + TaskRouter access via account SID + auth token
- Neon Postgres: Read-write via `POSTGRES_URL` (connection string with SSL)
- GoHighLevel: Read-only via ops-center proxy (no direct GHL credentials in this repo)

## Admin Features

- Health banner: Visible only to `burke@jumpcontact.com` (checked via Clerk `useUser()`)
- Health alerts: Sent to a single Telegram chat (configured via `TELEGRAM_CHAT_ID`)

## Dependencies

Run `npm audit` periodically. Current known vulnerabilities are in transitive dependencies with no available fix. No critical vulnerabilities in direct dependencies.
