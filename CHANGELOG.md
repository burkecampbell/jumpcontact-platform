# Changelog

All notable changes to the JumpContact Platform.

## [0.4.0] - 2026-04-02

### Added
- **Neon Postgres** — Immutable daily snapshots via Vercel Marketplace. 92 days backfilled.
- **`GET /api/snapshots`** — Frozen historical data endpoint for trend charts.
- **`POST /api/cron/snapshot`** — Daily 7am MST cron freezes yesterday's data for all brands.
- **GHL integration** — MSC conversions (GoHighLevel appt_booked) merged into Mixed view. JC+MSC=Mixed.
- **Telegram health alerts** — 4 automated checks every 30 min (Ytica, Sheets, conversions, CDR).
- **Admin-only health banner** — Visible to burke@jumpcontact.com on all pages.
- **Race page sortable columns** — Click any header to sort. Speed sorts fastest-first.
- **244-test suite** — Brand, reconciliation, date handling, call pairing, formatting, cache.
- **`AUDIT.md`** — Runnable quality audit checklist for future sessions.

### Fixed
- CRON_SECRET now required on all cron endpoints (was optional on 2 of 3).
- CORS restricted to *.vercel.app + localhost (was wildcard `*`).
- Removed hardcoded Twilio WORKSPACE_SID fallback.
- Outbound calls now show agent names in Call Log.
- Race page Best Day column populated (was always 0).
- Speed decimal precision: 17.3s instead of 17s.
- Blended agents (Sara) hidden from brand views when 0 calls for that brand.
- MSC Race page filters to MSC-only + blended agents, sorts by Calls.
- Meeting carousel: spacebar toggles pause, Slack Post step removed.
- Jose separated from Danny alias — own agent, blended.
- fmtSpeed(59.95) boundary bug fixed.
- CORS null origin no longer sends invalid empty header.
- Recording share links (/play) now public (was behind Clerk auth).
- Sheet ID inconsistency (constants.ts vs sheets.ts) unified.
- Jose added to Ytica JUMP_AGENTS whitelist.
- MSC shows 0 conversions when GHL unavailable (was showing JC data).

### Changed
- Speed priority: Ytica ring time preferred over CDR total wait. CDR used for precision when within 3s.
- Mixed view now shows combined JC+MSC conversions (was zeroing all).
- MSC Race page defaults to sort by Calls (not MTD conversions).
- README rewritten for investor-grade presentation.
- Cache-Control headers on /api/data (30s) and /api/snapshots (5min).
- .env.example expanded from 3 vars to 20.

### Removed
- Prototype HTML files (tv-broadcast, draggable-canvas, card-stack).
- 344K-line recording-manifest.json from scripts/output.
- amplify.yml (AWS Amplify abandoned in March).

## [0.3.0] - 2026-04-01

### Added
- **Brand data pipeline** — Mixed-first architecture. JC+MSC=Mixed on every metric.
- **Data provenance** — Every call tagged with `pairMethod` and `brandSource`.
- **Morning dashboard** (`/morning`) — Automated presentation with TV/Auto/Mobile modes.
- **Staleness detection** — API reports Ytica and CDR freshness in `_health` field.
- **Reconciliation** — Ytica vs CDR vs agent sums with auto-verification.

### Fixed
- Ytica data was being overwritten by CDR — Ytica is now source of truth.
- JUMP_AGENTS whitelist was missing all MSC agents.
- Blended agents with no CDR ratio split 50/50 (was zeroing).
- Cross-Brand Insights accounts for all calls.
- Date-only conversions defaulting to midnight UTC (wrong day in MST).
- Call Log shows date + time in multi-day ranges.
- Sign-in card contrast improved.
- Clerk dark theme for UserProfile modal.

## [0.2.0] - 2026-03-30

### Changed
- Removed proxy chain — direct API access to Twilio CDR + Google Sheets.
- Replaced centralized ops-center proxy with in-memory caching.
- Date picker UX improvements.

## [0.1.0] - 2026-03-22 – 2026-03-24

### Added
- Ops-center proxy architecture (later removed).
- Cognito auth (later replaced with Clerk).
- MSC data isolation.

### Changed
- Evaluated AWS Amplify vs Vercel — chose Vercel for integration ecosystem.
- Evaluated Cognito vs Clerk — chose Clerk for DX and cost.

## [0.0.1] - 2026-03-08 – 2026-03-09

### Added
- Initial 4-page dashboard: Live Now, Call Log, Meeting, Race.
- Twilio CDR integration + Google Sheets conversions.
- Call recording playback + CSV export.
- Timezone bug fix (Vercel UTC → MST).
- Environment variable health checker (`verify-env`).
