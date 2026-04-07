---
tags: [client/msc, ghl, google-sheets, jump-contact, platform, twilio, type/integration, type/spec, type/tool]
---

# Pickup Prompt — April 7 Evening Session Handoff

> Read CLAUDE.md first, then this file. Handoff from April 7 session (4 commits).

## What Shipped Today

- **Wrap-up column** in Call Log + ExcelJS export — server-side enrichment via `toRawCall()`, no more useMemo crash
- **"Yesterday by now"** context on Missed Calls KPI card — hourly missed data from CDR
- **Light mode sweep** — 18 hardcoded dark hex values replaced with CSS vars (`C.bg`, `C.contrast`, `C.overlay`, `C.navBg`). DateRangePicker popup, sticky thead, dropdowns, buttons all fixed. Sign-in/sign-up and play/page.tsx intentionally kept dark.
- **KPI sheet as primary** — removed CDR-only guards on call counts and talk time. KPI values always win when present. Added missed calls cross-check (available - picked up).
- **Cleanup** — debug-kpi route deleted, favicon.ico added
- **CSS vars added** — `--jc-contrast` (text on bright buttons), `--jc-overlay` (semi-transparent backdrop) for both themes

## What's Working

- **Brand toggle** (JC/Mixed/MSC) via `?brand=` — all pages respond
- **KPI Sheet is PRIMARY** — speed, wrap-up, pickup %, conversions, call counts, talk time all come from KPI sheet when available. CDR fills gaps only.
- **Call Log** — pagination, Export All, Ring Time, Wrap column, date range picker
- **Meeting page** — 5 steps, Monday mode
- **Recording map** — 29,707 CA→RE pairs, midnight cron
- **316 tests pass**, build clean, production live

## Unfinished (Priority Order)

### 1. OUTBOUND CALLS — No agent
All outbound calls show blank agent in Call Log. Was marked resolved Apr 2 but still broken. Needs investigation in `pairCallLegs()` in `src/lib/twilio.ts`. This is the #1 bug.

### 2. WRAP-UP COLUMN — Dashes showing
Code is correct (case mismatch fixed), but daily average per agent still shows "—" for all calls. Likely date format mismatch between `fetchKPIForDate('2026-04-07')` and how the KPI sheet stores today's date. Debug needed. Note: wrap-up is daily average per agent, NOT per-call (per-call would require TaskRouter reservation API, too expensive).

### 3. LIGHT MODE — Needs end-to-end test
CSS vars are in place, hardcoded hex replaced in components. But untested visually. Toggle the theme (gear icon → sun/moon) and verify all pages look correct.

### 4. MSC AGENT HOURS → Conv/Hr
File: `C:\Users\fuzzy\Downloads\All AGENT HOURS - MSC MST _ Mountain Time (Shared) (4).xlsx`
Monthly tabs, shift strings like "6am-5pm". Parse to hours, compute conv/hr.

### 5. CEO BUILD REPORT
`src/lib/ceo-report.ts` written (5-sheet ExcelJS). Not wired to any UI button.

### 6. RECORDING PERSISTENCE → Neon
Cron discovers pairs but only caches in-memory (~15 min). Need Neon `recordings` table.

### 7. MSC CLIENT CALLS SHEET
`src/lib/msc-calls.ts` reads Sheet ID 15sZ-T-y1lre... Not wired to any page.

## Key Architecture Decision (This Session)

KPI sheet is now the **authority** for agent metrics, not a fallback. `applyKPIOverrides()` always prefers KPI data when present. CDR is used for per-call detail only (recordings, phone numbers, timestamps, client resolution). This simplifies the data pipeline and produces more reliable numbers.

## Env Vars (Production)

- `MSC_KPI_SHEET_ID` = `15d--jXhaWvWk_QuMJcsxV1Oirlc7bjtieS1p4ClZnec`
- `MSC_CALLS_SHEET_ID` = `YOUR_SHEET_ID`
