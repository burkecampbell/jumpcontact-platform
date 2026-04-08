---
tags: [hubspot, jump-contact, platform, type/integration, type/tool]
---

# Pickup Prompt — April 8 Evening Session Handoff

> Read CLAUDE.md first, then this file. Handoff from April 8 session (2 commits).

## What Shipped Today

### HubSpot Outbound Sales Dashboard (`/outbound`)
New page tracking the outbound sales team via HubSpot CRM (Portal YOUR_PORTAL_ID).

**Team monitored:**
- Anthony (Anto Saenz, owner 263706316) — core team
- Angel M (264612211, created today) — core team
- William C (263685131) — core team
- Jose Saenz (89367067) — observer

**Features:**
- KPI strip: total calls, connected, no answer, talk time
- Per-agent stat cards with call progress bars and connect rate
- Rolling activity feed: calls, emails, notes, tasks — color-coded by type, sorted newest-first
- Deal pipeline visualization for all 4 pipelines (Full Send, Steady Close, Long Game, default)
- 60s API cache, 120s client polling
- Same dark theme as all other pages (C color object, Card components, font-mono data)

**Files created (8):**
- `src/lib/hubspot.ts` — API client, HUBSPOT_TEAM config, all fetch functions
- `src/lib/outbound-types.ts` — TypeScript interfaces
- `src/app/api/outbound/route.ts` — GET /api/outbound (60s cache)
- `src/app/outbound/page.tsx` — page entry
- `src/components/OutboundPage.tsx` — main page component
- `src/components/outbound/AgentStatCard.tsx`
- `src/components/outbound/ActivityFeed.tsx`
- `src/components/outbound/PipelineView.tsx`

**Files modified (3):**
- NavBar.tsx — added "Outbound" tab with PhoneOutgoing icon
- api-types.ts — re-exported OutboundDashboardData
- .env.example — added HUBSPOT_PAT placeholder

**Auth:** `HUBSPOT_PAT` env var (Private App token). Set in `.env.local` + Vercel production.

### Agent League (from previous unpushed commit)
EA Sports-style OVR rating system. Already in git, pushed alongside outbound.

## What's Working

- **All 7 pages render** — Live Now, Call Log, Outbound, League, Meeting, Race, Play
- **317 tests pass**, build clean
- **API verified** — William had 78 calls today (50% connect), Anthony had 2 (booked a demo!)
- **HUBSPOT_PAT on Vercel production** — deployed

## What's NOT Done Yet (Carry Forward)

### From previous sessions (still open):
1. **Outbound calls — no agent** in Call Log (Twilio issue, not HubSpot)
2. **Wrap-up column dashes** — date format mismatch in KPI sheet
3. **Light mode untested visually**
4. **MSC agent hours → Conv/Hr**
5. **CEO build report** — built, not wired to UI
6. **Recording persistence → Neon**
7. **MSC Client Calls Sheet** — fetcher built, not wired

### New from today:
8. **HubSpot rate limiting** — sequential fetches work but the activity feed is slow (~5s). Could pre-cache or paginate differently.
9. **Angel M has 0 calls** — just onboarded. Dashboard shows her but no data yet.
10. **0 deals in pipeline** — pipeline stages display correctly, deals list shows empty state. Will populate as team creates deals.
11. **Vercel preview env** — HUBSPOT_PAT only set for production. Preview deploys won't have HubSpot data.

## Key Architecture Decisions

- `HUBSPOT_TEAM` in `hubspot.ts` is SEPARATE from `ACTIVE_AGENTS`/`OUTBOUND_AGENTS`/`MSC_ONLY_AGENTS` in constants.ts. Anthony appears in both systems (MSC inbound + HubSpot outbound) — same person, dual role. No constants.ts edits.
- HubSpot fetches are sequential (not parallel) to avoid per-second rate limits. Cached at 60s.
- HUBSPOT-INTEGRATION.md says ops-center should be the backend. Burke chose jumpcontact-platform directly. Deliberate architectural override.

## Env Vars (New)

- `HUBSPOT_PAT` = `pat-xxx-REDACTED` (Private App, JC Portal YOUR_PORTAL_ID)
