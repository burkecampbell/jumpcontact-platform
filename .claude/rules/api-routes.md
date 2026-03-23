# API Routes Rules

## Endpoints

### GET /api/data
- **File:** `src/app/api/data/route.ts`
- **Response:** `DataResponse` (extends `DashboardData`) from `api-types.ts`
- **Cache:** 60s TTL via `cached('dashboard', ...)`
- **Used by:** LiveNowPage, MeetingPage, RacePage (all poll every 60s)
- **Contains:** today + yesterday PeriodData, MTD conversions, recent calls, weekend data (Mondays)

### GET /api/calls
- **File:** `src/app/api/calls/route.ts`
- **Params:** `date` (YYYY-MM-DD), `limit` (default 50), `offset` (default 0)
- **Response:** `CallsResponse` from `api-types.ts`
- **Cache:** 30s TTL per date via `cached('calls:{date}', ...)`
- **Used by:** CallsPage (paginated, filterable)
- **Contains:** calls array, agent summaries, recording annotations, total count, hasMore flag

### GET /api/calls/recording
- **File:** `src/app/api/calls/recording/route.ts`
- **Params:** `sid` (Twilio Call SID), optional `key` (API key when RECORDING_API_KEY is set)
- **Response:** Audio stream (proxied from Twilio)
- **Auth:** Optional API key gate via `RECORDING_API_KEY` env var
- **Used by:** InlinePlayer component

## Rules

1. **All routes use `force-dynamic`** — no static generation for real-time data
2. **Always return typed responses** — use interfaces from `api-types.ts`
3. **Wrap data fetches with `cached()`** — set appropriate TTL
4. **Error responses** use `ApiError` type: `{ error: string, details?: string }`
5. **MST timezone** — all date parsing uses `America/Edmonton`
6. **MSC filtering** — exclude MSC phone numbers from all responses
7. **Agent normalization** — run through `normalizeAgent()` before returning

## Adding a New API Route

```ts
// src/app/api/{name}/route.ts
import { NextResponse } from 'next/server';
import { cached } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const data = await cached('my-key', 60_000, async () => {
      // fetch data...
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch', details: String(err) },
      { status: 500 }
    );
  }
}

// Add response type to src/lib/api-types.ts
```
