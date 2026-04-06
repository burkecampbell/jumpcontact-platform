---
tags: [client/msc, ghl, google-sheets, jump-contact, platform, twilio, type/integration, type/spec, type/strategy, type/tool, vercel]
---

# Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     DATA SOURCES                              │
├──────────────┬───────────────┬──────────────┬────────────────┤
│ Twilio CDR   │ Google Sheets │ GoHighLevel  │ TaskRouter     │
│ (real-time)  │ (daily dump)  │ (MSC CRM)    │ (agent stats)  │
│              │               │              │                │
│ Call legs    │ Ytica metrics │ appt_booked  │ Reservations   │
│ Recordings   │ Conversions   │ tags         │ Speed/Wrap     │
│ Parent SIDs  │ Schedule      │              │ Activity       │
└──────┬───────┴───────┬───────┴──────┬───────┴───────┬────────┘
       │               │              │               │
       └───────────────┴──────┬───────┴───────────────┘
                              │
              ┌───────────────▼───────────────┐
              │     /api/data (orchestrator)   │
              │                               │
              │  1. Parallel fetch all sources │
              │  2. Pair CDR call legs         │
              │  3. Tag brands (provenance)    │
              │  4. Build canonical Mixed view │
              │  5. Cache 30s (in-memory)      │
              │  6. Derive brand view per req  │
              └───────────┬───────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
    │  JC View  │  │Mixed View │  │ MSC View  │
    │           │  │           │  │           │
    │ Sheets    │  │ JC + MSC  │  │ GHL only  │
    │ convs     │  │ merged    │  │ convs     │
    │ JC agents │  │ everyone  │  │ MSC agents│
    └───────────┘  └───────────┘  └───────────┘
```

## Core Design Principle: Mixed-First

**Mixed is the canonical total.** It's computed first from Ytica + CDR. JC and MSC are derived views where every additive metric satisfies:

```
JC + MSC = Mixed  (exactly, no rounding errors)
```

This is enforced by:
- `buildBrandSummary()` — single pass over CDR, buckets by brand
- `deriveBrandView()` — filters/splits from canonical Mixed
- Blended agents split by CDR ratio; JC gets `Math.round()`, MSC gets remainder
- Unknown-brand calls tracked explicitly, never silently defaulted

## Call Pairing Strategy

Twilio CDR returns separate inbound and agent legs. We join them using a 4-tier strategy:

| Tier | Strategy | Match Rate |
|------|----------|-----------|
| 1 | Trunk phone match (same number, 60s window) | ~70% |
| 1b | Cross-trunk match (different trunk, brand-compatible) | ~15% |
| 2 | Parent SID chain (Twilio call hierarchy) | ~10% |
| 3 | Fallback heuristic | ~3% |
| — | Unmatched → tagged as "missed" | ~2% |

Every paired call carries a `pairMethod` tag for data quality auditing.

## Brand Assignment

Each call is tagged with `brandSource` indicating how its brand was determined:

| Source | Priority | Method |
|--------|----------|--------|
| `client-name` | 1 (highest) | Lookup in `clients.json` brand mapping |
| `trunk-phone` | 2 | Match against MSC phone numbers |
| `agent-definitive` | 3 | MSC-only or JC-only agent |
| `agent-blended` | 4 | Agent works both brands (unknown for this call) |
| `unknown` | 5 | No signal — data gap, tracked in quality metrics |

## Data Freshness

| Source | TTL | Reason |
|--------|-----|--------|
| Dashboard (today) | 30s | Real-time operations |
| Dashboard (yesterday) | 1hr | Finalized by morning |
| Health check | 60s | Prevent hammering external APIs |
| Snapshots | Immutable | Never expires once frozen |
| Recordings | 1hr | Audio files don't change |

## Immutable Snapshots

Daily cron at 7am MST freezes yesterday's data into Neon Postgres:

```sql
daily_snapshots (
  id           TEXT PRIMARY KEY,     -- "2026-04-01_jc"
  date         TEXT NOT NULL,
  brand        TEXT NOT NULL,        -- "mixed" | "jc" | "msc"
  answered_calls, missed_calls, total_calls, conversions,
  avg_speed_sec, avg_wrap_sec, agent_count,
  agent_data   JSONB,               -- per-agent breakdown
  reconciliation JSONB,             -- source cross-validation
  created_at   TIMESTAMPTZ          -- when frozen
)
```

Once written, rows are **never modified**. Reconciliation metadata records which sources were used and any discrepancies.

## Health Monitoring

4 checks run every 30 minutes via Vercel Cron:

```
Ytica staleness (after 8am)  → Is yesterday's TeamStats present?
Sheets auth (always)         → Can we read from the conversions sheet?
Zero conversions (after 11am)→ Has anyone converted today?
CDR health (after 9am)       → Is Twilio returning calls?
```

Failures → Telegram alert to Burke. Admin-only banner shows real-time status on dashboard.

## Component Architecture

```
Layout (ClerkProvider + dark theme)
└── Page (server component, force-dynamic)
    └── PageInner (client component)
        ├── NavBar (fixed, brand toggle, Clerk user button)
        ├── HealthBanner (admin-only, polls /api/health)
        ├── ErrorBoundary (section-level recovery)
        └── Content (KPICards, tables, charts)
            └── Polls /api/data every 60s via setInterval
```

## File Organization

```
src/lib/           — Business logic (no React)
  ├── blender.ts   — Brand derivation (Mixed-first)
  ├── twilio.ts    — CDR fetch + call pairing
  ├── sheets.ts    — Google Sheets connectors
  ├── constants.ts — Config, colors, agents, helpers
  ├── cache.ts     — In-memory TTL cache
  ├── alerts.ts    — Telegram Bot API
  └── db/          — Drizzle ORM + Neon

src/app/api/       — API routes (serverless functions)
src/components/    — React client components
src/__tests__/     — Vitest unit tests
```

## Deployment

```
git push origin main
  → GitHub Actions: test + typecheck + build
  → Vercel: auto-deploy from main
  → Cron jobs: sync-recordings (6am), snapshot (2pm UTC), health-check (*/30min)
```
