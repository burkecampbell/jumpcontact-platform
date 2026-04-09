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

### CRITICAL: Wendy's conversions underreported (blended agent bug)
MTD shows Wendy had **17 conversions on April 8**, but `yesterday.conversions.byAgent` shows only **1**. The 1 is probably from her MSC call — the brand filter assigned 16 of her conversions to MSC and only 1 to JC. But MTD daily breakdown (from Google Sheets aggregate) correctly shows 17 total.

**Root cause:** `applyKPIOverrides()` overwrites Wendy's 17 JC conversions (from Google Sheets) with 1 MSC conversion (from KPI sheet / GHL). The KPI sheet doesn't distinguish JC vs MSC conversions — it just has a total that comes from GHL (MSC source). For blended agents, this replaces correct JC data with wrong MSC data.

**Fix:** `applyKPIOverrides()` should NOT override conversions for blended agents (Sara, Wendy, Jose). KPI sheet should only override speed, wrap-up, pickup — NOT conversions. Conversions must come from: Google Sheets for JC, GHL for MSC. The brand filter handles the split.

**In `src/app/api/data/route.ts` `applyKPIOverrides()`**, change:
```ts
// BEFORE (broken for blended agents):
if (kpi.conversions > 0) agent.conversions = kpi.conversions;

// AFTER:
// Skip conversion override for blended agents — KPI mixes JC+MSC
const isBlended = BLENDED_AGENTS.has(agent.agent.toLowerCase());
if (kpi.conversions > 0 && !isBlended) agent.conversions = kpi.conversions;
```

Also: the `if (kpiRows.length > 0)` block that rebuilds `conversions.byAgent` should skip blended agents too.

### CRITICAL: Call Log is broken as a reporting tool
Burke needs the Call Log to function as a **minute counter and reporting tool**, not just a call list. Full audit required. Here's what's wrong and what Burke expects:

**What's broken:**
- Pagination (Load 50 more) is useless for reporting — if Omar has 833 calls in March, you can't scroll through 50 at a time
- No summary stats for the filtered view — when you filter to Omar + Inbound, there's no total showing "Omar: 34 inbound calls, 2h 15m talk time for this period"
- No per-client subtotals — filter to Omar + Jacob Sapochnick should show "Omar had X calls to Jacob Sapochnick totaling Y minutes"
- Agent filter is hardcoded to ACTIVE_AGENTS — should include ALL agents in the data
- Export requires loading all data first — should export the full filtered dataset directly

**What Burke wants:**
1. **Filter summary bar** — when any filter is active, show: "Omar | Inbound | Mar 1-31 → 34 calls, 2h 15m, 12 conversions"
2. **Per-client breakdown** — when agent+client are both filtered, show subtotals
3. **Load All for single-agent** — when filtering to one agent, load all their calls automatically (not 200+50+50...)
4. **Sortable totals** — the agent strip at top should update to show only the filtered agent's stats
5. **Minute counter** — prominently display total talk time for the current filter combination
6. **Export filtered** — "Export All" exports the FILTERED view with correct totals, not everything

**Architecture note:** The API already supports `from`, `to`, `brand`, `limit`, `offset`. The issue is the frontend UX — it paginates when it should aggregate. For single-agent views, fetch everything and show summary stats.

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
