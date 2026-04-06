---
tags: [ghl, google-sheets, jump-contact, platform, twilio, type/credentials, type/integration, type/tool, vercel]
---

# API Reference

All endpoints are served from the Vercel deployment. Base URL: `https://jump-contact-dashboard-burke-5005s-projects.vercel.app`

## Dashboard Data

### `GET /api/data`

Main dashboard payload. Returns today's metrics, yesterday's metrics, MTD, trends, and agent data.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `brand` | `jc` \| `mixed` \| `msc` | `jc` | Brand filter. Mixed = all agents combined. |

**Response:** `DashboardData`

```json
{
  "today": {
    "date": "2026-04-02",
    "conversions": { "total": 29, "byAgent": [...], "byAccount": [...], "hourly": [...] },
    "missedCalls": { "total": 3, "byAccount": [...] },
    "repActivity": { "agents": [...], "outbound": [...], "avgSpeedSec": 14.3 },
    "teamStats": { "totalCalls": 180, "inbound": 165, "outbound": 15, ... },
    "answeredCalls": 162,
    "totalCalls": 165,
    "answerRate": 98,
    "teamAvgSpeed": 14.3,
    "convPerHour": 3.2
  },
  "yesterday": { ... },
  "mtd": { "total": 52, "goal": 900, "byAgent": [...], "mtdDaily": [...] },
  "trend7d": { "dates": [...], "conversions": [...], "missed": [...] },
  "ytd": { "total": 2469, "byMonth": [...] },
  "thisWeek": 52,
  "lastWeek": 187,
  "schedule": { "agents": [...] },
  "recentCalls": [...],
  "dataQuality": { "totalCalls": 180, "paired": {...}, "branded": {...}, "brandConfidence": 94.2 },
  "brandBreakdown": { "jc": { "calls": 120, "avgSpeed": 12.1 }, "msc": { "calls": 42, "avgSpeed": 6.3 } },
  "brand": "jc",
  "_health": { "staleness": {...}, "reconciliation": {...} },
  "pulledAt": "2026-04-02T22:15:00.000Z"
}
```

**Cache:** 30s in-memory, `Cache-Control: s-maxage=30, stale-while-revalidate=60`

---

### `GET /api/calls`

Paginated call log with recording SIDs.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `date` | `YYYY-MM-DD` | today | Single date |
| `from` | `YYYY-MM-DD` | — | Range start (overrides `date`) |
| `to` | `YYYY-MM-DD` | — | Range end |
| `limit` | number | `50` | Page size |
| `offset` | number | `0` | Pagination offset |

**Response:** `CallsResponse`

```json
{
  "calls": [
    {
      "time": "2026-04-02T15:23:00Z",
      "agent": "omar",
      "from": "+14035551234",
      "to": "+14035559876",
      "client": "Acme Dental",
      "direction": "inbound",
      "duration": 245,
      "ringTime": 12,
      "status": "completed",
      "recordingSid": "RExxxx",
      "pairMethod": "trunk-match",
      "brandSource": "client-name",
      "resolvedBrand": "jc"
    }
  ],
  "total": 180,
  "hasMore": true,
  "agents": [{ "agent": "omar", "count": 45, "talkMin": 83 }],
  "pulledAt": "2026-04-02T22:15:00.000Z"
}
```

---

### `GET /api/calls/recording`

Proxy for Twilio recording audio. Returns `audio/mpeg` stream.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `sid` | string | Yes | Call SID or Recording SID |
| `agent_sid` | string | No | Agent leg SID (fallback lookup) |
| `key` | string | No | API key (if `RECORDING_API_KEY` is set) |
| `download` | `1` | No | Force download headers |

---

## Snapshots (Immutable History)

### `GET /api/snapshots`

Frozen daily metrics from Neon Postgres. Replaces mutable Google Sheets for historical views.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `from` | `YYYY-MM-DD` | 30 days ago | Start date (inclusive) |
| `to` | `YYYY-MM-DD` | today | End date (inclusive) |
| `brand` | `jc` \| `mixed` \| `msc` | `mixed` | Brand filter |

**Response:**

```json
{
  "brand": "mixed",
  "from": "2026-01-01",
  "to": "2026-04-02",
  "count": 92,
  "snapshots": [
    {
      "date": "2026-03-15",
      "brand": "mixed",
      "answeredCalls": 162,
      "missedCalls": 8,
      "totalCalls": 170,
      "conversions": 31,
      "avgSpeedSec": 14.2,
      "avgWrapSec": 28.1,
      "agentCount": 7,
      "agentData": [...],
      "reconciliation": { "source": "cdr+ytica", ... },
      "frozenAt": "2026-03-16T14:00:00.000Z"
    }
  ],
  "pulledAt": "2026-04-02T22:15:00.000Z"
}
```

**Cache:** `Cache-Control: s-maxage=300, stale-while-revalidate=600`

---

## Health Monitoring

### `GET /api/health`

Current pipeline health status. Used by the admin banner.

**Response:**

```json
{
  "ok": true,
  "timestamp": "2026-04-02T22:15:00.000Z",
  "mstHour": 16,
  "checks": {
    "ytica": "OK: 180 calls",
    "sheets": "OK",
    "conversions": "OK: 29",
    "cdr": "OK"
  },
  "alerts": []
}
```

**Cache:** 60s in-memory

---

## Cron Endpoints

All cron endpoints require `Authorization: Bearer {CRON_SECRET}` header.

### `GET /api/cron/snapshot`

Freezes yesterday's data for all 3 brands into Postgres. Idempotent (upsert).

| Param | Type | Description |
|-------|------|-------------|
| `date` | `YYYY-MM-DD` | Override target date (for backfill) |
| `secret` | string | Alternative to Authorization header |

**Schedule:** `0 14 * * *` (2pm UTC = 7am MST)

### `GET /api/cron/health-check`

Runs 4 health checks. Sends Telegram alerts for failures.

**Schedule:** `*/30 * * * *` (every 30 minutes)

### `GET /api/cron/sync-recordings`

Syncs recent Twilio recordings into in-memory cache for playback.

**Schedule:** `0 6 * * *` (6am UTC)

---

## Public Pages

### `GET /play`

Public recording player. No authentication required. Accepts call metadata via query params for display.

| Param | Type | Description |
|-------|------|-------------|
| `sid` | string | Call SID |
| `agent_sid` | string | Agent leg SID |
| `agent` | string | Agent name (display only) |
| `client` | string | Client name (display only) |
| `phone` | string | Phone number (display only) |
| `time` | ISO string | Call time (display only) |
| `dur` | string | Duration (display only) |
| `dir` | `inbound` \| `outbound` | Direction (display only) |
