---
tags: [client/msc, ghl, jump-contact, platform, twilio, type/credentials, type/integration, type/tool, vercel]
---

# Codebase Audit Prompt

> Paste this into a new Claude Code session to run a full audit against the known issues list.

## Instructions

Read CLAUDE.md first for full context. Then audit every item below against the current codebase. For each item, report: FIXED, STILL BROKEN, or PARTIALLY FIXED with evidence.

## Critical (Fix before any external presentation)

- [ ] **CRON_SECRET optional auth** — Check `src/app/api/cron/health-check/route.ts` and `src/app/api/cron/sync-recordings/route.ts`. Auth should be REQUIRED (fail if env var unset), not optional. Compare against `src/app/api/cron/snapshot/route.ts` which does it correctly.

- [ ] **CORS too permissive** — Check `src/proxy.ts` for `Access-Control-Allow-Origin`. Should be restricted to Vercel deployment domain, not `*`.

- [ ] **Twilio WORKSPACE_SID hardcoded** — Check `src/lib/auth/twilio.ts` for hardcoded fallback SID. Should require env var.

- [ ] **Test coverage** — Run `npx vitest run` and count tests. Run `npx tsc --noEmit` for type safety. Report total tests, passing, failing. List files with zero test coverage.

## High (Significant quality gaps)

- [ ] **Outbound calls missing agent names** — Check `src/lib/twilio.ts` call pairing logic. Look for how outbound legs are matched to agents. Report what's missing.

- [ ] **Ytica data staleness** — Hit `/api/health` and check the `ytica` check result. Is yesterday's data present?

- [ ] **No loading states** — Check `src/components/LiveNowPage.tsx`, `CallsPage.tsx`, `RacePage.tsx`, `meeting/MeetingPage.tsx`. Do they show a loading spinner/skeleton while data fetches?

- [ ] **No fetch error handling** — In the same components, what happens if `fetch('/api/data')` returns a 500? Is there a user-visible error message?

- [ ] **Sheet ID inconsistency** — Compare `SCHEDULE_SHEET_ID` in `src/lib/constants.ts` vs the hardcoded value in `src/lib/sheets.ts`. Are they the same?

- [ ] **`.env.example` completeness** — Does it list ALL required env vars? Check against: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WORKSPACE_SID, CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CRON_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, POSTGRES_URL, CONVERSIONS_SHEET_ID, MISSED_CALLS_SHEET_ID, YTICA_SHEET_ID.

## Medium (Data & performance)

- [ ] **Mixed view conversions** — Hit `/api/data?brand=mixed` and check `today.conversions.total`. Should be > 0 (JC Sheets + MSC GHL merged). If 0, the GHL integration is broken.

- [ ] **Race page empty columns** — Check `src/components/RacePage.tsx` for Yield and Best Day columns. Are they populated or showing dashes?

- [ ] **Speed decimal precision** — Check `fmtSpeed()` in `src/lib/constants.ts`. Does it return one decimal place ("17.3s") or whole numbers ("17s")?

- [ ] **Meeting carousel pause** — Check `src/components/meeting/MeetingPage.tsx` for auto-advance interval. Is there a play/pause toggle?

- [ ] **recording-map.ts bundle size** — Check if `src/recording-map.ts` (24K+ lines) is imported at the top level. Should be lazy-loaded.

- [ ] **API Cache-Control headers** — Check `/api/data`, `/api/calls`, `/api/snapshots` responses for `Cache-Control` header. Should have `s-maxage` for CDN caching.

## Run this to get a quick score

```bash
# Test count
npx vitest run 2>&1 | tail -5

# Type safety
npx tsc --noEmit 2>&1 | wc -l

# Lines of code
find src -name '*.ts' -o -name '*.tsx' | xargs wc -l | tail -1

# Test-to-code ratio
echo "Tests:" && grep -r "it(" src/__tests__/ | wc -l && echo "Source lines:" && find src -not -path '*/\__tests__/*' -name '*.ts' -o -name '*.tsx' | xargs wc -l | tail -1
```

After auditing, update the memory file at `~/.claude/projects/C--Burke/memory/project_known_issues.md` with current status of each item.
