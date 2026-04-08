# Agent Power Ratings — EA Sports Style

## Formula

Six attributes, weighted, curved so floor is 55 and everyone is a pro.

| Attribute | Weight | What it measures | 99 at | 55 at |
|-----------|--------|-----------------|-------|-------|
| SPD (Speed) | 20% | Ring-to-pickup time | 4s | 20s |
| PKP (Pickup) | 15% | % of offered calls grabbed | 100% | 0% |
| CNV (Conversion) | 20% | Conversions per call % | 25%+ | 0% |
| VOL (Volume) | 15% | Calls per day | 30+/day | 0/day |
| DIS (Discipline) | 15% | Wrap-up time (lower=better) | 15s | 120s |
| END (Endurance) | 15% | Total talk minutes | 2000m+ | 0m |

### Scoring curves (all clamp to 55-99)
```
SPD = max(55, min(99, 99 - (ringTimeSec - 4) * 2.75))
PKP = max(55, min(99, 55 + pickupPct * 0.44))
CNV = max(55, min(99, 55 + convPct * 1.76))
VOL = max(55, min(99, 55 + callsPerDay * 1.47))
DIS = max(55, min(99, 99 - (wrapSec - 15) * 0.42))
END = max(55, min(99, 55 + totalTalkMin * 0.022))

OVR = max(62, SPD*0.20 + PKP*0.15 + CNV*0.20 + VOL*0.15 + DIS*0.15 + END*0.15)
```

### Tiers
| Range | Tier | Badge |
|-------|------|-------|
| 92-99 | 💎 MVP | 5 stars |
| 85-91 | ⭐ All-Star | 4 stars |
| 78-84 | 🔥 Pro Bowl | 3 stars |
| 72-77 | 🟢 Starter | 2 stars |
| 66-71 | 🔵 Key Player | 2 stars |
| 62-65 | 💪 Rising Pro | 1 star |

### Special badges (awarded to top performer in each)
- ⚡ Fastest Hands — highest SPD
- 🎯 Clutch Closer — highest CNV
- 🏋️ Iron Worker — highest VOL
- ✨ Cleanest Wrap — highest DIS

## Data sources

1. **KPI Sheet** (primary) — ring time, pickup %, wrap-up, conversions per agent per day
2. **MTD conversions** from `/api/data?brand=mixed` → `mtd.byAgent`
3. **Ytica MTD** from `/api/data` → `mtdRepActivity` — calls, talk time, speed, wrap averages
4. **Today's live data** from `/api/data` → `today.repActivity.agents`

For a full historical rating, use the KPI sheet directly via `fetchKPIForRange(from, to)` in `src/lib/kpi-sheet.ts` — it has every agent, every day, going back months.

## How to regenerate

```bash
curl -s "https://jump-contact-dashboard-burke-5005s-projects.vercel.app/api/data?brand=mixed" | node scripts/generate-ratings.js
```

Or from the dashboard: wire a "Power Rankings" button that calls `generateCEOReport()` with a ratings sheet.

## Design intent

- **Nobody scores below 62** — everyone who shows up to answer phones is a professional
- **Conversion at 0% still gets 55** — MSC agents track conversions differently, don't penalize them
- **Volume matters** — taking 30+ calls a day is elite work regardless of conversion
- **Badges celebrate strengths** — even a lower-ranked agent can be "Fastest Hands"
