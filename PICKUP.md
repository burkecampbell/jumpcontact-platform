---
tags: [client/msc, ghl, google-sheets, jump-contact, platform, twilio, type/integration, type/spec, type/tool]
---

# Pickup Prompt — April 7 Session Handoff

> Read CLAUDE.md first, then this file. Handoff from April 6-7 marathon (50+ commits).

## What's Working

- **Brand toggle** (JC/Mixed/MSC) via `?brand=` — all pages respond
- **Date range picker** — double calendar, presets, 90-day max
- **Call Log** — pagination (200 + Load 50), Export All ExcelJS, Ring Time column
- **Meeting page** — 5 steps (Calls → Speed → Pickup Rate → Conversions → MTD), Monday mode
- **KPI Sheet connected** — reads "Stats & KPI" sheet (15d--jXha...), overrides speed/wrap/pickup
- **Recording map** — 29,707 CA→RE pairs, midnight cron
- **316 tests pass**, build clean, production live

## Unfinished (Priority Order)

### 1. LIGHT MODE — Half-baked
C object returns CSS var() refs. 26 opacity patterns fixed. ThemeToggle in NavBar.
BUT: hardcoded dark colors (`#141824`, `rgba(10,14,26,...)`) in many components.
Light palette in globals.css defined but untested end-to-end.
**Fix**: grep hardcoded dark hex, replace with C vars, test light mode.

### 2. MSC CONVERSIONS — Not flowing for today
KPI sheet has yesterday's MSC conversions (Desi=10, Francis=9). Today may not have data yet.
`applyKPIOverrides()` patches agents from KPI sheet when data exists.
**Fix**: verify yesterday MSC conv, investigate KPI sheet update cadence.

### 3. WRAP-UP COLUMN — Reverted after crash
Caused infinite re-render (React #310) from agentWrap useMemo.
**Fix**: enrich call records in `toRawCall()` server-side, not client-side memo.

### 4. MSC AGENT HOURS → Conv/Hr
File: `C:\Users\fuzzy\Downloads\All AGENT HOURS - MSC MST _ Mountain Time (Shared) (4).xlsx`
Monthly tabs, shift strings like "6am-5pm". Parse to hours, compute conv/hr.

### 5. CEO BUILD REPORT
`src/lib/ceo-report.ts` written (5-sheet ExcelJS). Not wired to any UI button.

### 6. RECORDING PERSISTENCE → Neon
Cron discovers pairs but only caches in-memory (~15 min). Need Neon `recordings` table.

### 7. MSC CLIENT CALLS SHEET
`src/lib/msc-calls.ts` reads Sheet ID 15sZ-T-y1lre... Not wired to any page.

### 8. CLEANUP
- Delete `src/app/api/debug-kpi/route.ts` (temporary)
- Fix favicon 404

## Env Vars Added (Production)

- `MSC_KPI_SHEET_ID` = `15d--jXhaWvWk_QuMJcsxV1Oirlc7bjtieS1p4ClZnec`
- `MSC_CALLS_SHEET_ID` = `YOUR_SHEET_ID`
