# Agents & Business Data Rules

## Agent Schedule

Agent schedules are sourced from **Google Sheets** (`SCHEDULE_SHEET_ID`), cached 1 hour. Sheet format: time ranges ("8a-5p", "OFF") with automatic lunch deduction (1hr when gross > 6hrs). Falls back to hardcoded `AGENT_SCHEDULE` in `constants.ts` on any error.

The schedule feeds: conversions per hour, coverage trends, staffing analysis, and utilization metrics.

## Agent Identification

Agents come from **Twilio Flex** `client:` URIs — NOT from any CRM.
The `decodeAgent()` function in `constants.ts` extracts the username:
```
client:omar_40jumpcontact_2Ecom → omar
```

## Agent Lists (env-overridable in constants.ts)

| List | Agents | Purpose |
|------|--------|---------|
| `ACTIVE_AGENTS` | omar, burke, ian, danny, chris, george | Inbound team — shown on all pages |
| `OUTBOUND_AGENTS` | william, joseph | Outbound team — separate section |
| `EXCLUDED_AGENTS` | sara | Filtered from conversion rankings only |

## Critical Agent Rules

1. **"Jose" and "Daniel" → "Danny"** — `normalizeAgent()` handles this everywhere
2. Never display raw Twilio usernames — always run through `normalizeAgent()` then `capitalize()`
3. Agent colors are in `AGENT_COLORS` map in constants.ts — use `agentColor(name)` helper
4. Agent schedule is in `AGENT_SCHEDULE` (7-element array: [Sun..Sat] hours per day)
5. `hoursScheduled` drives conversions-per-hour calculations in `period.ts`

## Adding a New Agent

1. Add name to `ACTIVE_AGENTS` env var (or constant fallback array)
2. Add color in `AGENT_COLORS` map in `constants.ts`
3. Add schedule in `AGENT_SCHEDULE` in `constants.ts` (7-element array: [Sun..Sat] hours)
4. That's it — all pages pick them up automatically

## MSC Isolation

**MSC (Med Spa Communications)** is a separate brand. Its phone numbers are in `src/data/clients.json` under `brands.msc`.

- `isJCAccount(phone)` returns `false` for MSC numbers
- Filter MSC out everywhere: dashboards, reports, KPIs
- MSC data goes in `VERTICALS/med-spa-communications/` — never in this project

## Business Constants

| Constant | Value | Location |
|----------|-------|----------|
| `GOAL` | 900 (conversions/month) | constants.ts |
| Timezone | `America/Edmonton` (MST) | All date logic |
| Standup | 9:05 AM MST | Gather Town |
| Monday mode | Shows Fri/Sat/Sun tabs instead of Today/Yesterday | MeetingPage + data/index.ts |

## Conversion Data

- Source: Google Sheets (`CONVERSIONS_SHEET_ID`)
- Columns: timestamp, agent, account name
- `getConversions()` builds: total, byAgent (AgentStat[]), byAccount (AcctStat[]), hourly, mtdDaily
- Conversion rate = conversions / calls answered × 100
- Conversions per hour = agent conversions / agent hoursScheduled

## Phone → Client Mapping

- `src/data/clients.json` maps phone numbers to client/account names
- Structure: `{ "byPhone": { "+1234567890": "Client Name" }, "brands": { "msc": [...] } }`
- Updated manually or via script from Twilio IncomingPhoneNumbers API
- Used in CallsPage and API routes for the "Account" column
