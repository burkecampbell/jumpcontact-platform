---
tags: [aws, client/msc, ghl, google-sheets, jump-contact, platform, twilio, type/credentials, type/integration, type/spec, type/tool, vercel]
---

# JumpContact Platform

Real-time operations intelligence for Jump Contact (24/7 virtual receptionist) and Med Spa Communications. Built for investor-grade data integrity.

## Architecture

```
Data Sources                    Orchestration                     Storage
─────────────                   ─────────────                     ───────
Twilio CDR (real-time)  ──┐
Google Sheets (daily)   ──┤──►  /api/data                  ──►   Dashboard (4 pages)
GoHighLevel CRM         ──┤     Parallel fetch + merge            Brand-derived views
Twilio TaskRouter       ──┘     60s in-memory cache               JC | Mixed | MSC
                                Brand derivation
                                                             ──►  Neon Postgres
                                /api/cron/snapshot                 Immutable daily snapshots
                                Daily 7am MST freeze              91 days backfilled

                                /api/cron/health-check       ──►  Telegram alerts
                                Every 30 min                      Admin dashboard banner
                                4 health checks
```

## Data Integrity Model

**Mixed is the canonical total.** JC and MSC are derived views where `JC + MSC = Mixed` exactly, on every metric, every time. No rounding errors, no mystery buckets.

| Principle | Implementation |
|-----------|---------------|
| **Additive consistency** | `deriveBrandView()` guarantees JC + MSC = Mixed across calls, talk time, missed calls |
| **Blended agent splitting** | Agents working both brands split by CDR ratio (or 50/50 with ceil/floor for exact additivity) |
| **Data provenance** | Every call tagged with `pairMethod` (how matched) and `brandSource` (how brand determined) |
| **Immutable history** | `daily_snapshots` in Postgres — once written, never modified. Reconciliation metadata preserved. |
| **Cross-source reconciliation** | API reports Ytica vs CDR vs agent sums with automatic verification |
| **Multi-source conversions** | JC from Google Sheets, MSC from GoHighLevel — merged for Mixed, separated for brand views |

## Operational Health Monitoring

Four automated checks run every 30 minutes:

| Check | Fires After | Detects |
|-------|-------------|---------|
| Ytica staleness | 8am MST | Daily data dump failure |
| Sheets auth | Always | Expired service account credentials |
| Zero conversions | 11am MST | Dead conversion pipeline |
| CDR health | 9am MST | Twilio API failures |

Alerts delivered via Telegram. Admin-only banner on dashboard shows health status in real-time.

## Security

- All cron endpoints require `CRON_SECRET` (fail-closed, not optional)
- CORS restricted to deployment domain + preview URLs (not wildcard)
- No hardcoded secrets or fallback credentials
- Clerk auth gates all dashboard pages
- API routes include `Cache-Control` headers for CDN edge caching

## Test Suite

244 tests across 10 files. Tests run before every build — broken tests block deployment.

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `constants.test.ts` | 90 | Agent normalization, speed grades, formatting, schedule |
| `brandSummary.test.ts` | 26 | CDR bucketing, brand derivation, Mixed additivity |
| `filterByBrand.test.ts` | 21 | Brand view filtering, blended agent splitting |
| `brand.test.ts` | 19 | Brand assignment, MSC/JC/blended classification |
| `formatters.test.ts` | 18 | Phone, duration, time, date+time formatting |
| `callPairing-extra.test.ts` | 16 | Cross-trunk, parent SID chains, edge cases |
| `reconciliation.test.ts` | 15 | Cross-source verification, rounding guarantees |
| `dateHandling.test.ts` | 23 | Flexible date parsing (5+ formats), DST boundaries |
| `pairCallLegs.test.ts` | 10 | Multi-tier call pairing strategies |
| `cache.test.ts` | 8 | TTL expiry, invalidation, prefix clearing |

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Auth | Clerk (Vercel Marketplace) |
| Database | Neon Postgres (Vercel Marketplace) |
| ORM | Drizzle |
| Phone | Twilio CDR + TaskRouter |
| CRM | GoHighLevel (via ops-center) |
| Sheets | Google Sheets API (service account) |
| Alerts | Telegram Bot API |
| Styling | Tailwind CSS 4 (dark theme) |
| Testing | Vitest (CI-gated) |
| Deploy | Vercel (auto-deploy from main) |

## Pages

| Page | Route | Purpose |
|------|-------|---------|
| Live Now | `/` | Real-time KPIs, agent ranking, recent calls |
| Call Log | `/calls` | Searchable history, recording playback, CSV/XLSX export |
| Meeting | `/meeting` | Presentation deck with carousel |
| Race | `/race` | MTD leaderboard, daily grid, projected EOM |

## Development

```bash
npm install
cp .env.example .env.local    # 20 vars documented
npm run dev                    # localhost:3003
npm test                       # 244 tests
npm run build                  # tests must pass first
npm run db:push                # push schema to Neon
npm run db:studio              # browse data
npm run backfill               # populate historical snapshots
```

## Repo Structure

```
src/
├── app/api/                 # API routes (data, calls, cron, health, snapshots)
├── components/              # React pages + shared UI
├── lib/
│   ├── blender.ts           # Brand derivation engine (Mixed-first architecture)
│   ├── twilio.ts            # CDR fetch + multi-tier call pairing
│   ├── sheets.ts            # Google Sheets connectors
│   ├── ops-center.ts        # GoHighLevel/MSC API client
│   ├── health-checks.ts     # Operational monitoring
│   ├── alerts.ts            # Telegram alerting
│   ├── cache.ts             # In-memory TTL cache for serverless
│   └── db/                  # Drizzle schema + Neon connection
├── __tests__/               # 244 unit tests (10 files)
└── proxy.ts                 # Clerk auth + restricted CORS

scripts/                     # Backfill, env verification
CLAUDE.md                    # AI development context
AUDIT.md                     # Quality audit checklist
RECOVERY.md                  # Disaster recovery runbook
```

## Build History

89 commits across 8 active development days (March 8 - April 2, 2026).

| Date | Milestone |
|------|-----------|
| Mar 8 | Initial 4-page dashboard (Twilio CDR + Google Sheets) |
| Mar 22-24 | Platform evaluation: AWS Amplify/Cognito vs Vercel/Clerk. Chose Vercel. |
| Mar 30 | Removed proxy chain, direct API access with in-memory caching |
| Apr 1 | Mixed-first brand pipeline, data provenance, 244-test suite |
| Apr 2 | Neon Postgres snapshots (91 days), GHL integration, Telegram monitoring, security hardening |
