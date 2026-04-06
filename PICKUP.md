---
tags: [client/msc, ghl, google-sheets, jump-contact, platform, twilio, type/integration, type/spec, type/tool]
---

# Pickup Prompt — Brand Pipeline Rework

Read CLAUDE.md at C:\App Builder\PLATFORM\tools\jumpcontact-platform\CLAUDE.md first.

## Context

The jumpcontact-platform has a JC/Mixed/MSC brand toggle. The numbers DON'T ADD UP:
- JC Yesterday: 270 calls | MSC Yesterday: 278 | Mixed: 460 | **Ytica truth: 351**
- JC + MSC = 548 ≠ 351. Mixed = 460 ≠ 351. All wrong.

## Root Cause

Mixed mode is not the canonical source. JC and MSC are built independently, causing:
1. Blended agents (Wendy 58 calls, Sara 16 calls) counted in BOTH JC and MSC at full value
2. `Math.max(cdr.calls, ytica.calls)` in blending inflates when CDR mispairs more than Ytica reports
3. No per-client call splitting for blended agents

## What Must Be True

- **Mixed = Ytica total (351 yesterday)** — the superset, built first
- **JC + MSC = Mixed** — mathematically enforced
- Blended agents' calls split by which client they served (Clients Yesterday Ytica sheet has per-phone-number data, each phone maps to a brand via clients.json)

## Data Sources (DO NOT CHANGE THIS HIERARCHY)

1. **Ytica Google Sheet** (6am daily dump) = source of truth for yesterday and historical daily metrics
2. **Twilio CDR** (30s cache) = source of truth for TODAY's real-time data only
3. **Google Sheets conversions** = JC conversion tracking
4. **GHL via ops-center** = MSC conversion tracking (appt_booked tags)

## Architecture Fix

1. `fetchDashboardData()` builds period data from Ytica (already works via `blendYticaIntoPerioData`)
2. The GET handler currently runs `filterByBrand()` which only removes agents — needs to SPLIT blended agent call counts
3. Need to read "Clients Yesterday" Ytica sheet (per-external-contact volumes) to split Wendy/Sara
4. Mixed shows the raw Ytica total. JC = JC agents + Wendy's JC-client portion + Sara's JC-client portion. MSC = MSC agents + Wendy's MSC-client portion + Sara's MSC-client portion.

## Key Files

- `src/app/api/data/route.ts` — GET handler, filterByBrand call, buildPeriodData
- `src/lib/blender.ts` — filterByBrand(), blendYticaIntoPerioData()
- `src/lib/sheets.ts` — fetchYticaRepActivity(), JUMP_AGENTS set, Ytica sheet reading
- `src/lib/types.ts` — PairedCall (has pairMethod/brandSource provenance fields)
- `src/data/clients.json` — phone→client mapping, clientBrands map

## What Was Done This Session

- Completed 9-item improvement backlog (phone pairing, cache, tests, CI, ops-center, etc.)
- Built /morning page (automated morning meeting dashboard, light theme, TV/Auto/Mobile modes)
- Built data provenance system (pairMethod + brandSource on every PairedCall)
- Fixed JUMP_AGENTS whitelist (was missing 7 MSC agents)
- Fixed GET handler to use Ytica as source of truth (not CDR rebuild)
- MSC now shows real Ytica numbers (Richard 38, Natalie 43, etc.)
- Brand filtering still double-counts blended agents — THE MAIN REMAINING BUG

## Verification Data

Burke's Ytica file (Burke Daily Rep Activity (71).xlsx) for April 1:
- Total: 351 calls across 14 agents
- JC agents: Omar 36, Burke 44, Danny 27, Chris 19, Ian 7 = 133
- MSC agents: Richard 38, Natalie 43, Sofia 29, Desi 31, Sue 25, Francis 20, Anthony 12, Rebecca 2 = 200
- Blended: Wendy 58, Sara 16 = 74
- 133 + 200 + 74 = 407 (agent total > 351 because Ytica counts "Call Conversations" which includes re-engagements)

Burke's Clients Yesterday (64).xlsx shows per-phone call volumes:
- JC client calls: 177
- MSC client calls: 211
- Unknown: 16
