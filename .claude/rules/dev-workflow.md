# Dev Workflow Rules

## Local Development

```bash
npm run dev          # localhost:3003
npm run build        # production build (must pass clean)
npm run verify       # env var health check
```

Port is **3003** (configured in package.json and .claude/launch.json).

## Clerk Auth Blocks Preview Tools

The app is gated by Clerk authentication. Preview tools (preview_start, screenshot) will show the sign-in page, not the actual app content.

**To verify changes locally:**
```bash
curl http://localhost:3003/api/data | jq .    # API routes work without auth
curl http://localhost:3003/api/calls?date=2026-03-10 | jq .
```

API routes are the best way to verify backend changes. For frontend changes, use `npm run build` to catch TypeScript errors.

## Deploy

Push to git → Vercel auto-deploys. Production URL: `https://jumpcontact-platform.vercel.app`

Vercel runs **UTC** — that's why all date logic explicitly uses `America/Edmonton` timezone.

## Environment Variables

Required in both `.env.local` (dev) and Vercel dashboard (prod):
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` — Google Sheets API
- `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_WORKSPACE_SID` — Twilio
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` — Clerk auth

Optional overrides:
- `ACTIVE_AGENTS`, `OUTBOUND_AGENTS`, `EXCLUDED_AGENTS` — agent lists
- `CONVERSIONS_SHEET_ID`, `MISSED_CALLS_SHEET_ID`, `YTICA_SHEET_ID`, `SCHEDULE_SHEET_ID` — sheet IDs
- `RECORDING_API_KEY` — recording proxy auth

## Build Verification Checklist

1. `npm run build` passes with zero errors and zero warnings
2. All 4 pages render: `/`, `/calls`, `/meeting`, `/race`
3. API routes return valid JSON: `/api/data`, `/api/calls`
4. No TypeScript errors in any file
5. No unused imports or dead code

## File Naming Conventions

- Source files: **kebab-case** (`twilio-calls.ts`, `missed-calls.ts`)
- Components: **PascalCase** (`LiveNowPage.tsx`, `StepConversions.tsx`)
- Exports: **camelCase** (`getDashboardData`, `buildRepActivity`)
- Types/interfaces: **PascalCase** (`DashboardData`, `RepAgent`)

## Import Aliases

- `@/*` → `./src/*` (configured in tsconfig.json)
- `@/lib/constants` — colors, agents, helpers
- `@/lib/formatters` — phone, duration, time formatters
- `@/lib/types` — all shared TypeScript interfaces
- `@/lib/api-types` — API response contracts
- `@/lib/cache` — in-memory TTL cache
- `@/components/Card` — glass card wrapper
- `@/components/ErrorBoundary` — error boundary with retry

## Known Gotchas

1. **Monday mode** — On Mondays, `getDashboardData()` fetches Fri/Sat/Sun in addition to today/yesterday. MeetingPage shows extra tabs. Don't break this.
2. **In-memory cache resets on cold start** — Vercel keeps functions warm 5-15 min. First request after cold start is slow.
3. **clients.json is static** — phone→client mapping doesn't auto-update. Manual refresh needed.
4. **Twilio rate limits** — cache prevents hitting them, but be careful adding new uncached Twilio calls.
5. **`getDashboard.ts` is a barrel only** — never add logic there, it's for backward compat imports.
