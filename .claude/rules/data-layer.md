# Data Layer Rules

## Architecture

All data modules live in `src/lib/data/`. Each file is a focused fetcher:

| Module | Function | Source |
|--------|----------|--------|
| `schedule.ts` | `fetchSchedule()`, `parseTimeRange()`, `getScheduledHoursFromSchedule()`, `getTotalCoverage()` | Google Sheets |
| `conversions.ts` | `getConversions()` | Google Sheets |
| `missed-calls.ts` | `getMissedCalls()` | Google Sheets |
| `ytica.ts` | `getYticaSpeedStats()` | Google Sheets |
| `twilio-calls.ts` | `fetchCallsForDate()`, `extractRecentCalls()`, `computeSpeedFromCDR()`, `computeWrapUpFromCDR()` | Twilio CDR API |
| `twilio-workers.ts` | `getWorkerSpeedStats()` | Twilio TaskRouter |
| `rep-activity.ts` | `buildRepActivity()` | Joins Twilio + Ytica |
| `recordings.ts` | `fetchRecordingSids()` | Twilio Recordings |
| `period.ts` | `buildPeriodData()` | Orchestrates single-date data |
| `index.ts` | `getDashboardData()` | Main orchestrator (today + yesterday + MTD + weekend) |

## Rules

1. **New data source** = new file in `src/lib/data/`, never add to existing files
2. **Types go in `src/lib/types.ts`** — not inline in data modules
3. **Auth goes in `src/lib/auth/`** — `google.ts` for Sheets, `twilio.ts` for Twilio
4. **Always wrap with `cached()`** from `src/lib/cache.ts` for TTL caching
5. **Sheet IDs** live in `src/lib/constants.ts` with env var fallbacks
6. **`getDashboard.ts`** is a barrel re-export only — never add logic there
7. **All dates are MST** (`America/Edmonton`) — use `dateStr()` from conversions.ts
8. **Agent names** must go through `normalizeAgent()` — Daniel and Danny are SEPARATE people
9. **MSC filtering** — check `isJCAccount()` to exclude MSC phone numbers
10. **Conversion rate** = conversions / calls answered (computed in `period.ts`)

## Cache TTLs

| Key | TTL | Set in |
|-----|-----|--------|
| `dashboard` | 60s | `data/index.ts` |
| `calls:{date}` | 30s | `api/calls/route.ts` |
| `recordings:{date}` | 5 min | `data/recordings.ts` |
| `schedule` | 1 hour | `data/schedule.ts` |

## Adding a New Google Sheet Source

```ts
// 1. Add sheet ID to constants.ts
export const MY_SHEET_ID = process.env.MY_SHEET_ID || 'default-id';

// 2. Create src/lib/data/my-source.ts
import { getSheets } from '../auth/google';
import { MY_SHEET_ID } from '../constants';

export async function getMyData(sheets: ReturnType<typeof getSheets>) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: MY_SHEET_ID,
    range: 'Sheet1!A:Z',
  });
  const rows = (res.data.values || []).slice(1); // skip header
  // transform rows...
}

// 3. Add types to types.ts
// 4. Wire into period.ts or index.ts if it feeds the dashboard
// 5. Wrap with cached() for TTL caching
```
