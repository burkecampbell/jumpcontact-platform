# JumpContact Platform — AI Context

> **Read this file first.** It gives Claude everything needed to add features, fix bugs, or extend the platform without re-discovering the codebase.

## What This Is

Internal operations dashboard for Jump Contact (24/7 virtual receptionist). Four pages: Live Now, Call Log, Meeting, Race. Deployed on Vercel at `https://jumpcontact-platform.vercel.app`. Built by Burke Campbell.

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16.1.6 (App Router) |
| React | 19.2.3 |
| Styling | Tailwind CSS 4 (dark theme only) |
| Auth | Clerk (`@clerk/nextjs` 7.x) via `src/proxy.ts` |
| Data | Google Sheets API + Twilio CDR API |
| Icons | lucide-react |
| Font | Inter (body) + JetBrains Mono (data) |
| Deploy | Vercel project `jump-contact-dashboard` under `burke-5005s-projects` (burke@jumpcontact.com) |
| Port | 3003 (local dev) |

## Critical Rules

1. **Replace "Jose" and "Daniel" with "Danny"** — `normalizeAgent()` in `constants.ts` handles this
2. **MSC stays isolated** — `clients.json` has `brands.msc` phones; filter them out everywhere
3. **All times are MST** — `America/Edmonton` timezone everywhere (Vercel runs UTC)
4. **ACTIVE_AGENTS** = `omar,burke,ian,danny,chris,george` (env-overridable)
5. **OUTBOUND_AGENTS** = `william,joseph` (env-overridable)
6. **EXCLUDED_AGENTS** = `sara` (filtered from conversion rankings)
7. **Color palette** lives in `C` object in `constants.ts` — all components use it
8. **Clerk auth gates everything** — preview tools can't render pages (use `curl localhost:3003` to verify)

## Directory Structure

```
src/
├── app/                          # Next.js App Router pages
│   ├── page.tsx                  # / → LiveNowPage
│   ├── calls/page.tsx            # /calls → CallsPage
│   ├── meeting/page.tsx          # /meeting → MeetingPage
│   ├── race/page.tsx             # /race → RacePage
│   ├── sign-in/[[...sign-in]]/   # Clerk sign-in
│   ├── sign-up/[[...sign-up]]/   # Clerk sign-up
│   ├── layout.tsx                # Root layout (ClerkProvider, fonts, theme)
│   └── api/
│       ├── data/route.ts         # GET /api/data — full dashboard payload (60s cache)
│       ├── calls/route.ts        # GET /api/calls?date=&limit=&offset= — paginated call log
│       └── calls/recording/route.ts  # GET /api/calls/recording?sid= — audio proxy
│
├── components/
│   ├── LiveNowPage.tsx           # / — KPIs, agent ranking, recent calls
│   ├── CallsPage.tsx             # /calls — full call log with filters, CSV export
│   ├── RacePage.tsx              # /race — MTD leaderboard + daily performance
│   ├── meeting/                  # /meeting — decomposed meeting dashboard
│   │   ├── MeetingPage.tsx       # Shell: data fetch, step navigation
│   │   ├── Hero.tsx              # Animated counter hero number
│   │   ├── PaceBar.tsx           # MTD pace progress bar
│   │   ├── StepConversions.tsx   # Conversions by agent + account tables
│   │   ├── StepCalls.tsx         # Call volume and missed calls
│   │   ├── StepSpeed.tsx         # Answer speed metrics
│   │   ├── StepTalkTime.tsx      # Talk time and wrap-up averages
│   │   ├── StepMTD.tsx           # Month-to-date trends
│   │   ├── StepSlack.tsx         # Copyable Slack summary
│   │   ├── TableCells.tsx        # Shared table cell components
│   │   ├── callouts.ts           # KPI callout card data builders
│   │   ├── aggregateDays.ts      # Aggregate PeriodData[] into one
│   │   └── useCountUp.ts         # Count-up animation hook
│   ├── NavBar.tsx                # Fixed top nav (4 tabs + Clerk user button)
│   ├── Card.tsx                  # Reusable glass card wrapper
│   ├── InlinePlayer.tsx          # Audio player for call recordings
│   └── ErrorBoundary.tsx         # React error boundary with retry
│
├── lib/
│   ├── constants.ts              # GOAL, agents, colors, schedule, sheet IDs, helpers
│   ├── types.ts                  # All shared TypeScript interfaces
│   ├── api-types.ts              # Typed API response contracts
│   ├── formatters.ts             # formatPhone, formatDuration, formatTime
│   ├── cache.ts                  # In-memory TTL cache for serverless
│   ├── theme.ts                  # Clerk theme variables derived from C palette
│   ├── getDashboard.ts           # Barrel re-export (backward compat)
│   ├── auth/
│   │   ├── google.ts             # getSheets() — Google service account auth
│   │   └── twilio.ts             # twilioAuth() — Basic auth header + WORKSPACE_SID
│   └── data/
│       ├── index.ts              # getDashboardData() — main orchestrator
│       ├── conversions.ts        # getConversions() — Google Sheets
│       ├── missed-calls.ts       # getMissedCalls() — Google Sheets
│       ├── ytica.ts              # getYticaSpeedStats() — Google Sheets
│       ├── twilio-calls.ts       # fetchCallsForDate(), extractRecentCalls(), speed/wrapup CDR
│       ├── twilio-workers.ts     # getWorkerSpeedStats() — Twilio TaskRouter
│       ├── rep-activity.ts       # buildRepActivity() — joins all agent data
│       ├── period.ts             # buildPeriodData() — single-date orchestrator
│       └── recordings.ts         # fetchRecordingSids() — Twilio recordings
│
├── data/
│   └── clients.json              # Phone→client mapping (from Twilio IncomingPhoneNumbers)
│
├── recording-map.ts              # Static CA→RE pairs (24,569 entries, auto-generated)
└── proxy.ts                      # Clerk middleware (clerkMiddleware from @clerk/nextjs/server)
```

## Data Pipeline

```
Google Sheets ─┐
               ├──→ getDashboardData() ──→ /api/data (60s cache) ──→ Components
Twilio CDR ────┘
               └──→ /api/calls (30s cache per date) ──→ CallsPage
```

### Data Sources

| Source | What | Sheet ID / API | Module |
|--------|------|---------------|--------|
| Conversions Sheet | Agent conversions (timestamp, agent, account) | `CONVERSIONS_SHEET_ID` in constants | `data/conversions.ts` |
| Missed Calls Sheet | Missed call log | `MISSED_CALLS_SHEET_ID` in constants | `data/missed-calls.ts` |
| Ytica Sheet | Answer speed stats by agent | `YTICA_SHEET_ID` in constants | `data/ytica.ts` |
| Twilio CDR | Call detail records for a date | `api.twilio.com` REST API | `data/twilio-calls.ts` |
| Twilio TaskRouter | Per-worker speed stats | `taskrouter.twilio.com` | `data/twilio-workers.ts` |
| Twilio Recordings | Recording SIDs per call | `api.twilio.com` Recordings | `data/recordings.ts` |
| clients.json | Phone → client name mapping | Static file (updated manually) | `src/data/clients.json` |

### Cache TTLs

| Key pattern | TTL | Reason |
|------------|-----|--------|
| `dashboard` | 60s | Meeting page auto-refreshes every 60s |
| `calls:{date}` | 30s | Call log is interactive |
| `recordings:{date}` | 5 min | Rarely changes intraday |

## Environment Variables

```bash
# Google Sheets (required)
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

# Twilio (required)
TWILIO_ACCOUNT_SID=ACxxxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_WORKSPACE_SID=WSxxxxxxx

# Clerk auth (required for production)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_xxxxx
CLERK_SECRET_KEY=sk_xxxxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Optional overrides
ACTIVE_AGENTS=omar,burke,ian,danny,chris,george
OUTBOUND_AGENTS=william,joseph
EXCLUDED_AGENTS=sara
CONVERSIONS_SHEET_ID=YOUR_SHEET_ID
MISSED_CALLS_SHEET_ID=YOUR_SHEET_ID
YTICA_SHEET_ID=YOUR_SHEET_ID
RECORDING_API_KEY=           # When set, requires ?key= on recording proxy
```

## How To: Add a New Page

1. Create `src/app/{route}/page.tsx`:
   ```tsx
   import MyPage from '@/components/MyPage';
   export const dynamic = 'force-dynamic';
   export default function Route() { return <MyPage />; }
   ```
2. Create `src/components/MyPage.tsx` (client component with `'use client'`)
3. Add nav link in `src/components/NavBar.tsx` → `NAV_ITEMS` array
4. Use `Card` for containers, `C` object for colors, `ErrorBoundary` for sections

## How To: Add a New Data Source

### From Google Sheets
1. Add sheet ID to `src/lib/constants.ts`:
   ```ts
   export const MY_SHEET_ID = process.env.MY_SHEET_ID || 'default-id-here';
   ```
2. Create `src/lib/data/my-source.ts`:
   ```ts
   import { getSheets } from '../auth/google';
   import { MY_SHEET_ID } from '../constants';

   export async function getMyData(sheets: ReturnType<typeof getSheets>) {
     const res = await sheets.spreadsheets.values.get({
       spreadsheetId: MY_SHEET_ID,
       range: 'Sheet1!A:Z',
     });
     const rows = (res.data.values || []).slice(1); // skip header
     // ... transform rows into typed data
   }
   ```
3. Add types to `src/lib/types.ts`
4. If it feeds the dashboard, wire it into `data/period.ts` or `data/index.ts`
5. Wrap with `cached()` from `cache.ts` for TTL caching

### From a REST API
1. Create `src/lib/data/my-api.ts` with typed fetch calls
2. Add auth to `src/lib/auth/` if needed
3. Wire into orchestrator or create a new API route in `src/app/api/`

### As a New API Route
1. Create `src/app/api/{name}/route.ts`
2. Add response type to `src/lib/api-types.ts`
3. Wrap data fetch with `cached()` for TTL caching
4. Add `export const dynamic = 'force-dynamic'` for real-time data

## How To: Add a New Agent

1. Add name to `ACTIVE_AGENTS` env var (or constant fallback)
2. Add color in `AGENT_COLORS` in `constants.ts`
3. Add schedule in `AGENT_SCHEDULE` in `constants.ts` (7-element array: [Sun..Sat] hours)
4. That's it — all pages will pick them up automatically

## Shared Components (import from `@/components/`)

| Component | Props | Usage |
|-----------|-------|-------|
| `Card` | `children, className?, padding?` | Glass card container |
| `NavBar` | `pulledAt?` | Top nav (auto-shows 4 tabs) |
| `InlinePlayer` | `callSid, recordingUrl` | Audio player for recordings |
| `ErrorBoundary` | `section?, children` | Wraps sections; shows retry on crash |

## Shared Utilities (import from `@/lib/`)

| Module | Key Exports |
|--------|-------------|
| `constants.ts` | `C` (colors), `GOAL`, `ACTIVE_AGENTS`, `AGENT_COLORS`, `AGENT_SCHEDULE`, `agentColor()`, `normalizeAgent()`, `decodeAgent()`, `isJCAccount()`, `fmtTalkTime()`, `fmtSpeed()`, `speedGrade()`, `computePace()`, `capitalize()`, `isMonday()` |
| `formatters.ts` | `formatPhone()`, `formatDuration()`, `formatTime()` |
| `types.ts` | `DashboardData`, `PeriodData`, `ConvPeriod`, `RepAgent`, `OutboundAgent`, `AgentStat`, `AcctStat`, `MissedData`, `RawCall`, `TwilioCall` |
| `api-types.ts` | `DataResponse`, `CallsResponse`, `AgentCallSummary`, `RecordingError`, `ApiError` |
| `cache.ts` | `cached()`, `invalidate()`, `invalidatePrefix()`, `clearAll()` |
| `theme.ts` | `getClerkThemeVariables()`, `getClerkPageElements()`, `getPageBackground()` |

## Color Palette (the `C` object)

```ts
bg:     '#0A0E1A'    // page background
card:   'rgba(20,24,36,0.72)'  // glass card
text:   '#f1f5f9'    // primary text
sub:    '#8B92A8'    // secondary text
border: 'rgba(62,165,195,0.18)'
lime:   '#BCFD4C'    // CTAs, positive
cyan:   '#3EA5C3'    // data, links, active
pink:   '#E63888'    // errors, alerts
```

## Agent Identification

Agents come from **Twilio Flex** `client:` URIs, NOT from any CRM. The `decodeAgent()` function in `constants.ts` extracts the username:
```
client:omar_40jumpcontact_2Ecom → omar
```

## Known Limitations

1. **Clerk blocks preview tools** — the app is auth-gated; use `curl localhost:3003/{route}` to verify the dev server
2. **Agent schedule is hardcoded** — `AGENT_SCHEDULE` in `constants.ts` (planned: fetch from Google Sheet)
3. **clients.json is static** — phone→client mapping; update manually or via script
4. **In-memory cache resets on cold start** — Vercel keeps functions warm ~5-15 min
5. **Monday mode** — On Mondays, the meeting page shows Friday/Saturday/Sunday tabs instead of just Today/Yesterday

## Build & Deploy

```bash
npm run dev          # localhost:3003
npm run build        # production build (must pass clean)
npm run verify       # env var health check
# Deploy: push to git → Vercel auto-deploys
```

### Deployment Details

| Item | Value |
|------|-------|
| Vercel project | `jump-contact-dashboard` |
| Vercel team | `burke-5005s-projects` (burke@jumpcontact.com) |
| GitHub repo | `burke-jpg/jumpcontact-platform` |
| Auto-deploy | Pushes to `main` trigger production deploys |
| Production URL | `jump-contact-dashboard-burke-5005s-projects.vercel.app` |

**Important**: Always verify `.vercel/project.json` exists and points to `prj_WcgTCC74L7S64tJoxXd64UWuosjC` / `team_1g0g9of1Ai0ApouxqAKlBAlT`. If CLI deploys go to the wrong account, delete `.vercel/` and re-link.

## Page-Specific Notes

### LiveNowPage (/)
- Fetches `/api/data` every 60s via `setInterval`
- KPICard component with `inverse` prop (used for Missed Calls — down=green)
- Shows agent ranking table + recent calls table

### CallsPage (/calls)
- Fetches `/api/calls?date=&limit=50&offset=0` with pagination
- Date picker, agent filter, direction filter, search
- CSV export, bulk select, recording playback
- Client/account column from `clients.json` mapping

### MeetingPage (/meeting)
- Step-based carousel (6 steps): Conversions → Calls → Speed → Talk Time → MTD → Slack
- Auto-advances every 12s, keyboard nav (← →)
- Monday: shows additional weekend tabs (Friday/Saturday/Sunday)
- PaceBar shows projected vs GOAL (900/month)

### RacePage (/race)
- MTD leaderboard sorted by conversion count
- Daily performance columns from today's `repActivity.agents`
- Agents with no calls today show 0/0m (not dashes)
- Shows conversion rate and speed grade per agent
