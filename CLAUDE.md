---
tags: [client/msc, ghl, google-sheets, jump-contact, platform, twilio, type/credentials, type/integration, type/spec, type/strategy, type/tool, vercel]
---

# JumpContact Platform — AI Context

> **Read this file first.** It gives Claude everything needed to add features, fix bugs, or extend the platform without re-discovering the codebase.

## What This Is

Internal operations dashboard for Jump Contact + Med Spa Communications (24/7 virtual receptionist). Six pages: Live Now, Call Log, Meeting, Morning, Race, Play. Three-position brand toggle (JC | Mixed | MSC). Deployed on Vercel. Built by Burke Campbell.

## Tech Stack

| Layer | Tech | Details |
|-------|------|---------|
| Framework | Next.js 16.1.6 (App Router) | React 19.2.3, Turbopack bundler |
| Auth | Clerk 7.x | Gates all pages, UserButton in NavBar |
| Styling | Inline styles (morning) / Tailwind 4 (rest) | Morning has light theme (`T` object), rest is dark (`C` object) |
| Animation | Custom spring physics + @chenglou/pretext | `useSpringValue`, `useSpring` hooks for DOM-free text measurement |
| Testing | Vitest 4.x | 316 tests, runs before build (`vitest run && next build`) |
| Data: Primary | KPI Sheet (Google Sheets) | **Source of truth** — ring time, pickup %, wrap-up, conversions, brand tags per agent per day |
| Data: Real-time | Twilio CDR API | Today's calls, leg pairing, recordings |
| Data: Fallback | Ytica (Google Sheets) | MTD speed/wrap when KPI sheet missing |
| Data: Conversions | Google Sheets (JC) + KPI Sheet/GHL (MSC) | Merged for Mixed view |
| Data: MSC Calls | MSC Client Calls Sheet | Call records, dispositions, conversion tracking |
| Data: Schedule | Google Sheets | Agent hours, shift parsing |
| Data: Snapshots | Neon Postgres (drizzle-orm) | Daily immutable snapshots via cron |
| Export | ExcelJS | Branded XLSX per JC Document Standards |
| Cache | In-memory TTL | 30s-1hr depending on data freshness needs |
| Icons | lucide-react | |
| Fonts | Inter (body) + JetBrains Mono (data) | |
| Deploy | Vercel | Auto-deploy from `main`, project `jump-contact-dashboard` |
| Port | 3003 (local dev) | |

## Brand System

Three-position toggle: **JC | Mixed | MSC** via `?brand=` query param (URL-persistent, bookmarkable).

| File | Purpose |
|------|---------|
| `src/lib/brand.ts` | `Brand` type, agent sets (`MSC_ONLY_AGENTS`, `JC_ONLY_AGENTS`, `BLENDED_AGENTS`), accent colors |
| `src/hooks/useBrand.ts` | `useBrand()` hook — reads URL, returns `{ brand, setBrand, isMixed, isMSC, isJC, brandHref }` |
| `src/components/BrandToggle.tsx` | Pill toggle in NavBar |
| `src/lib/blender.ts` | `filterByBrand()` dispatches to JC/MSC/Mixed filters |

- **JC**: Shows JC agents only (filters out MSC-only). Current behavior.
- **MSC**: Shows MSC-only + blended agents (Sara, Wendy, Jose). Teal accent `#5BC5D4`.
- **Mixed**: Shows ALL agents, strips conversions (JC=Sheets, MSC=GHL — they don't mix). Purple accent.
- API routes accept `?brand=` and cache independently per brand.
- **Blended agents appear in both JC and MSC** — JC + MSC totals > Mixed total by the blended count.

## Critical Rules

1. **Replace "Jose" and "Daniel" with "Danny"** — `normalizeAgent()` in `constants.ts`
2. **All times are MST** — `America/Edmonton` timezone everywhere (Vercel runs UTC)
3. **Ytica is source of truth** — for agent speed, calls, talk time, wrap-up. CDR is real-time supplement only
4. **ACTIVE_AGENTS** = `omar,burke,ian,danny,chris,wendy,sara,george,sue` (env-overridable)
5. **Color palette** lives in `C` object in `constants.ts` — all dark-theme components use it
6. **Clerk auth gates everything** — preview tools can't render pages (use `curl localhost:3003` to verify)
7. **Meeting tab** = "Money Monday" on Mondays, "Meeting" all other days (dynamic in NavBar)

## Directory Structure

```
src/
├── app/                              # Next.js App Router pages
│   ├── page.tsx                      # / → LiveNowPage
│   ├── calls/page.tsx                # /calls → CallsPage
│   ├── meeting/page.tsx              # /meeting → MeetingPage
│   ├── morning/page.tsx              # /morning → MorningDashboard
│   ├── race/page.tsx                 # /race → RacePage
│   ├── play/page.tsx                 # /play → Recording player (standalone)
│   ├── sign-in/[[...sign-in]]/       # Clerk sign-in
│   ├── sign-up/[[...sign-up]]/       # Clerk sign-up
│   ├── layout.tsx                    # Root layout (ClerkProvider, fonts, theme)
│   └── api/
│       ├── data/route.ts             # GET /api/data?brand= — full dashboard payload
│       ├── calls/route.ts            # GET /api/calls?date=&from=&to=&brand=&limit=&offset=
│       ├── calls/recording/route.ts  # GET /api/calls/recording?sid= — audio proxy
│       ├── health/route.ts           # GET /api/health — client staleness monitor
│       ├── snapshots/route.ts        # GET /api/snapshots — Neon daily data
│       ├── cron/snapshot/route.ts    # Neon daily snapshot cron
│       ├── cron/health-check/route.ts # Health check cron
│       └── cron/sync-recordings/route.ts # Recording map sync cron
│
├── components/
│   ├── LiveNowPage.tsx               # / — KPIs, agent ranking, recent calls
│   ├── CallsPage.tsx                 # /calls — call log, date range picker, ExcelJS export
│   ├── RacePage.tsx                  # /race — MTD leaderboard + monthly awards
│   ├── MorningDashboard.tsx          # /morning — light theme, TV carousel, spring animations
│   ├── meeting/                      # /meeting — step-based huddle presentation
│   │   ├── MeetingPage.tsx           # Shell: data fetch, step navigation, Monday mode
│   │   ├── StepCalls.tsx             # Call volume and agent breakdown
│   │   ├── StepTalkTime.tsx          # Talk time averages
│   │   ├── StepSpeed.tsx             # Ring-to-pickup speed metrics
│   │   ├── StepConversions.tsx       # Conversions + pickup/decline/ghost rates
│   │   ├── StepMTD.tsx               # Month-to-date pace
│   │   └── StepSlack.tsx             # Copyable Slack summary
│   ├── NavBar.tsx                    # Top nav with BrandToggle + dynamic meeting label
│   ├── BrandToggle.tsx               # JC | Mixed | MSC pill toggle
│   ├── DateRangePicker.tsx           # Double calendar date range picker
│   ├── KPICard.tsx                   # Reusable KPI card with delta + badge
│   ├── Card.tsx                      # Glass card wrapper
│   ├── InlinePlayer.tsx              # Audio player for recordings
│   ├── MixedInsights.tsx             # Cross-brand comparison insights
│   ├── HealthBanner.tsx              # Client health status banner
│   ├── RingChart.tsx                 # SVG ring/donut chart
│   ├── SpeedBadge.tsx                # Color-coded speed grade badge
│   ├── DraggableCard.tsx             # Draggable card for morning dashboard
│   ├── ErrorBoundary.tsx             # React error boundary with retry
│   └── TableHelpers.tsx              # Shared table components (TH, TD)
│
├── hooks/
│   ├── useBrand.ts                   # Brand context from URL ?brand= param
│   ├── useSpring.ts                  # Spring physics animation
│   ├── useSpringValue.ts             # Single spring value hook
│   ├── usePretext.ts                 # DOM-free text measurement via @chenglou/pretext
│   └── useDraggable.ts              # Drag-and-drop hook
│
├── lib/
│   ├── brand.ts                      # Brand type, agent sets, accent colors, isAgentForBrand()
│   ├── blender.ts                    # filterByBrand(), blendYticaIntoPerioData(), stripConversions()
│   ├── constants.ts                  # C (colors), GOAL, agents, schedule, sheet IDs, helpers
│   ├── types.ts                      # All shared TypeScript interfaces
│   ├── api-types.ts                  # Typed API response contracts
│   ├── formatters.ts                 # formatPhone, formatDuration, formatTime
│   ├── cache.ts                      # In-memory TTL cache for serverless
│   ├── sheets.ts                     # Google Sheets reader (node-forge JWT, Ytica, conversions, schedule)
│   ├── twilio.ts                     # fetchCallLegs(), pairCallLegs(), todayMST()
│   ├── clients.ts                    # resolveClient(), isMscPhone(), isJCPhone(), getClientBrand()
│   ├── daily-analytics.ts            # fetchAllWorkerStats() — Twilio TaskRouter
│   ├── ops-center.ts                 # MSC data fetcher (ops-center API calls)
│   ├── health-checks.ts              # Client staleness monitoring
│   ├── alerts.ts                     # Slack/notification alerts
│   ├── kpi-sheet.ts                  # PRIMARY: KPI Sheet fetcher (ring time, pickup %, wrap-up, conversions)
│   ├── msc-calls.ts                 # MSC Client Calls Sheet fetcher (dispositions, conversion tracking)
│   ├── recording-map.ts              # Static CA→RE pairs (26,091 entries)
│   ├── recording-utils.ts            # buildPlayerUrl(), shareRecording()
│   ├── theme.ts                      # Clerk theme variables derived from C palette
│   ├── getDashboard.ts               # Barrel re-export (backward compat)
│   └── auth/twilio.ts                # twilioAuth(), twilioAccountSid(), WORKSPACE_SID
│
├── data/clients.json                 # Phone→client mapping with brands (jc/msc)
├── db/schema.ts                      # Drizzle schema for Neon snapshots
└── proxy.ts                          # Clerk middleware (clerkMiddleware)
```

## Gotchas (Hard-Won Lessons)

1. **KPI Sheet is primary** — `kpi-sheet.ts` overrides Ytica and CDR for speed, wrap-up, and pickup. Falls back to Ytica MTD if KPI has no data for the date.
2. **KPI Sheet has brand tags** — Column C ("MSC", "Jump", "MSC/Jump") enables proper brand filtering without guessing
3. **Conv rate denominator** — use Ytica agent calls sum, NOT CDR `answeredCalls` (which is incomplete after brand filtering)
4. **`request.nextUrl.searchParams` is synchronous** in Route Handlers — ignore linter warnings about async searchParams (that's page components only, not route handlers)
5. **Blended agents (Sara, Wendy, Jose)** appear in both JC and MSC — JC + MSC totals > Mixed total by the blended agent count. This is correct, not a bug.
6. **`useCallback` with `data` dependency** causes infinite re-render loops — use `setData(prev => ...)` functional update instead
7. **Temporal dead zone** — `const` declarations used before their line cause "Cannot access 'X' before initialization" in production builds (minified). Always declare before use.
8. **Recording map covers through April 2026** — calls after this need the sync-recordings cron or manual refresh
9. **ExcelJS for exports, not xlsx** — ExcelJS supports full cell styling, hyperlinks, frozen rows, auto-filters. The xlsx library does not.
10. **Vercel CLI auth** — must be logged in as `burke@jumpcontact.com` (team `burke-5005s-projects`). If deploys go to wrong account, `vercel login burke@jumpcontact.com` then re-link.

## Data Pipeline

```
KPI Sheet ──────────────→ PRIMARY: ring time, pickup %, wrap-up, conversions, brand tags
Twilio CDR ─────────────→ Today's calls + recordings (real-time)
Ytica (Google Sheets) ──→ FALLBACK: MTD speed/wrap when KPI sheet missing
Conversions Sheet ──────→ JC conversions (Google Sheets)
MSC Client Calls Sheet ─→ MSC call records, dispositions, conversion tracking
Neon Postgres ──────────→ Daily immutable snapshots

All merge in /api/data (30s cache per brand) → All pages poll this
/api/calls (CDR only) → Call Log page with pagination
```

### KPI Sheet (Primary Data Source)

**"Stats & KPI - Agents & Teams | Jump & MSC"**
- Sheet ID: `15d--jXhaWvWk_QuMJcsxV1Oirlc7bjtieS1p4ClZnec` (env: `MSC_KPI_SHEET_ID`)
- Tab: `Agents` — per-agent per-day metrics with brand tagging
- Column C: Team tag ("MSC", "Jump", "MSC/Jump") — enables proper brand filtering
- Column F: Ring Time (seconds) — THE speed metric
- Column I: % picked up calls — pickup rate
- Column M: Avg Wrap up time — wrap-up
- Column D: # of Conversions — with brand context
- Fetcher: `src/lib/kpi-sheet.ts`
- Overrides Ytica and CDR-derived values for speed, wrap-up, and pickup rate

### Cache TTLs

| Key pattern | TTL | Reason |
|------------|-----|--------|
| `dashboard-data:{brand}` | 30s | Brand-independent caching |
| `calls:{date}` | 30s today, 1hr historical | Call log is interactive |
| `yesterday-*` | 1hr | Historical data rarely changes |
| `hist-conv` | 1hr | Monthly conversion history |

## Build & Deploy

```bash
npm run dev          # localhost:3003
npm run build        # vitest run && next build (both must pass)
npm test             # vitest run (316 tests)
npm run test:watch   # vitest watch mode
npm run db:push      # push drizzle schema to Neon
npm run backfill     # backfill Neon snapshots
# Deploy: push to git → Vercel auto-deploys
```

### Deployment Details

| Item | Value |
|------|-------|
| Vercel project | `jump-contact-dashboard` |
| Vercel team | `burke-5005s-projects` (burke@jumpcontact.com) |
| Project ID | `prj_WcgTCC74L7S64tJoxXd64UWuosjC` |
| Team ID | `team_1g0g9of1Ai0ApouxqAKlBAlT` |
| GitHub repo | `burke-jpg/jumpcontact-platform` |
| Auto-deploy | Pushes to `main` trigger production deploys |
| Production URL | `jump-contact-dashboard-burke-5005s-projects.vercel.app` |
| Recording map | 26,091 CA→RE static pairs |
| Call log limit | 90-day max range, 200 initial + 50 per Load More |

## Page-Specific Notes

### LiveNowPage (/)
- Fetches `/api/data?brand=` every 60s
- KPICard with `inverse` prop (Missed Calls — down=green)
- Mixed view hides Conversions + Conv Rate KPI cards
- Agent speed/wrap comes from MTD Ytica (overrides daily)

### CallsPage (/calls)
- DateRangePicker (double calendar, presets, 90-day max)
- Pagination: 200 initial, Load 50 more, Export All
- ExcelJS export with JC Document Standards (light theme, teal accents, hyperlinked recordings)
- Brand-aware agent summaries via `?brand=` on API

### MeetingPage (/meeting)
- Dynamic step list: Mixed skips Conversions + MTD steps
- Monday mode: Friday/Weekend tabs + "Money Monday" NavBar label
- Auto-advances every 12s, keyboard nav (← →)

### MorningDashboard (/morning)
- **Light theme** with own `T` color object (NOT the dark `C` palette)
- Spring animations via `useSpringValue`, `useSpring`
- Pretext for DOM-free text measurement
- TV carousel with draggable cards
- Monday mode: shows weekend data from Ytica

### RacePage (/race)
- MTD leaderboard + monthly awards (Most Conversions, Best Conv/Hr, etc.)
- Daily performance from today's `repActivity.agents`
- Daily grid: conversions per agent per day this month

### Play (/play)
- Standalone recording player (shareable URL with call metadata)
- Waveform visualization + play/pause/seek + download + share
