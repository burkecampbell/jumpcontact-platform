# JumpContact Platform

Internal operations dashboard for **Jump Contact** (24/7 virtual receptionist) and **Med Spa Communications**.

## Pages

| Page | Route | Purpose |
|------|-------|---------|
| Live Now | `/` | Real-time KPIs, agent ranking, recent calls |
| Call Log | `/calls` | Searchable call history with recording playback, CSV/XLSX export |
| Meeting | `/meeting` | Step-through meeting deck (conversions, speed, talk time, MTD) |
| Race | `/race` | MTD leaderboard, daily grid, awards, projected EOM |

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Auth**: Clerk
- **Data**: Twilio CDR + Google Sheets + Ops-Center API
- **Styling**: Tailwind CSS 4 (dark theme)
- **Fonts**: Inter + JetBrains Mono
- **Deploy**: Vercel (`jump-contact-dashboard` project)
- **Tests**: Vitest (13 unit tests, CI-gated)

## Brand Toggle

Three-position toggle on every page: **JC** | **Mixed** | **MSC**

- **JC**: Jump Contact agents and clients only
- **MSC**: Med Spa Communications agents and clients only
- **Mixed**: All agents, conversion metrics hidden (different sources)

Filtering is trunk-based (by phone number), not agent-based, so blended agents (Wendy, Sara) appear correctly in both views.

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in: Twilio, Google Sheets, Clerk credentials

# Run locally
npm run dev          # http://localhost:3003

# Run tests
npm test             # Vitest (must pass before deploy)

# Build for production
npm run build        # Runs tests first, then next build
```

## Environment Variables

| Variable | Required | Source |
|----------|----------|--------|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio Console |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio Console |
| `TWILIO_WORKSPACE_SID` | Yes | Twilio TaskRouter |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Yes | GCP Console |
| `GOOGLE_PRIVATE_KEY` | Yes | GCP Console |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk Dashboard |
| `CLERK_SECRET_KEY` | Yes | Clerk Dashboard |
| `ACTIVE_AGENTS` | No | Comma-separated agent names |
| `CRON_SECRET` | No | Vercel cron authentication |

## Data Pipeline

```
Twilio CDR ──────┐
Google Sheets ───┤──> /api/data (30s cache) ──> All pages
Ops-Center API ──┘
                     /api/calls (per-date cache) ──> Call Log
```

- **Twilio**: Call legs, recordings, TaskRouter worker stats
- **Google Sheets**: Conversions, schedule, Ytica speed/wrap-up
- **Ops-Center**: MSC conversions (GHL appt_booked tags)
- **Recording Map**: 24,569 static CA→RE pairs + nightly cron sync

## CI/CD

- **GitHub Actions**: Tests + type check + build on every push/PR
- **Vercel**: Auto-deploys from `main`, tests run as part of build
- **Cron**: Nightly recording sync at 6am UTC (`/api/cron/sync-recordings`)

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/data/           # Dashboard data endpoint
│   ├── api/calls/          # Call log + recording proxy
│   └── api/cron/           # Scheduled jobs
├── components/             # React components
│   ├── LiveNowPage.tsx     # / page
│   ├── CallsPage.tsx       # /calls page
│   ├── RacePage.tsx        # /race page
│   ├── meeting/            # /meeting (decomposed)
│   ├── KPICard.tsx         # Shared KPI card
│   ├── RingChart.tsx       # SVG progress ring
│   ├── SpeedBadge.tsx      # Speed grade indicator
│   └── TableCells.tsx      # Shared TH/TD components
├── lib/
│   ├── twilio.ts           # Call leg fetching + pairing
│   ├── blender.ts          # Brand filtering
│   ├── ops-center.ts       # Ops-center API client
│   ├── cache.ts            # In-memory TTL cache
│   ├── recording-utils.ts  # Shared recording helpers
│   └── constants.ts        # Colors, agents, helpers
└── __tests__/              # Vitest unit tests
```
