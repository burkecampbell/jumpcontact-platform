# Component Rules

## Shared Components (import from `@/components/`)

| Component | File | Props |
|-----------|------|-------|
| `Card` | `Card.tsx` | `children`, `className?`, `padding?` (default "p-5") |
| `NavBar` | `NavBar.tsx` | `pulledAt?` (ISO string, shows "Updated X ago") |
| `InlinePlayer` | `InlinePlayer.tsx` | `callSid`, `recordingUrl` |
| `ErrorBoundary` | `ErrorBoundary.tsx` | `section?` (label), `children` |

## Page Components

| Page | Route | Component | Data Source |
|------|-------|-----------|-------------|
| Live Now | `/` | `LiveNowPage.tsx` | `GET /api/data` (60s poll) |
| Call Log | `/calls` | `CallsPage.tsx` | `GET /api/calls?date=&limit=&offset=` |
| Meeting | `/meeting` | `meeting/MeetingPage.tsx` | `GET /api/data` (60s poll) |
| Race | `/race` | `RacePage.tsx` | `GET /api/data` (60s poll) |

## Meeting Sub-Components (`@/components/meeting/`)

| Component | Purpose |
|-----------|---------|
| `MeetingPage.tsx` | Shell: data fetch, step navigation, tab state |
| `Hero.tsx` | Animated counter hero number |
| `PaceBar.tsx` | MTD pace progress bar |
| `StepConversions.tsx` | Conversions by agent + account tables |
| `StepCalls.tsx` | Call volume and missed calls |
| `StepSpeed.tsx` | Answer speed metrics |
| `StepTalkTime.tsx` | Talk time and wrap-up averages |
| `StepMTD.tsx` | Month-to-date trends |
| `StepSlack.tsx` | Copyable Slack summary |
| `TableCells.tsx` | Shared table cell components |
| `callouts.ts` | KPI callout card data builders |
| `aggregateDays.ts` | Aggregate PeriodData[] into one |
| `useCountUp.ts` | Count-up animation hook |

## Rules

1. **All components are `'use client'`** — pages fetch data client-side via API routes
2. **Use `Card` for containers** — provides glass card styling with `C.card` background
3. **Use `C` object for ALL colors** — never hardcode hex values; import from `@/lib/constants`
4. **Use `ErrorBoundary`** to wrap independent sections so one failure doesn't crash the page
5. **Formatters** — import `formatPhone`, `formatDuration`, `formatTime` from `@/lib/formatters`
6. **Agent colors** — use `agentColor(name)` from constants, not hardcoded
7. **Speed grading** — use `speedGrade(sec)` for color-coded speed badges
8. **Font classes** — `font-mono` for data values, default Inter for labels
9. **NavBar** has `NAV_ITEMS` array — add entries there for new pages
10. **Clerk UserButton** is in NavBar — no need to add auth UI elsewhere

## Adding a New Page

```tsx
// 1. Create src/app/{route}/page.tsx
import MyPage from '@/components/MyPage';
export const dynamic = 'force-dynamic';
export default function Route() { return <MyPage />; }

// 2. Create src/components/MyPage.tsx
'use client';
import { Card } from '@/components/Card';
import { C } from '@/lib/constants';
import { ErrorBoundary } from '@/components/ErrorBoundary';
// ... build your page

// 3. Add to NavBar.tsx → NAV_ITEMS array
{ href: '/my-route', label: 'My Page', icon: SomeIcon }
```

## Styling Patterns

- Page background: `C.bg` (#0A0E1A)
- Glass cards: `C.card` with `backdrop-blur-xl` and `C.border` border
- Primary text: `C.text` (#f1f5f9)
- Secondary/muted: `C.sub` (#8B92A8)
- Positive/CTA: `C.lime` (#BCFD4C)
- Data/links: `C.cyan` (#3EA5C3)
- Errors/alerts: `C.pink` (#E63888)
- Hover states: `hover:bg-white/5` or `hover:bg-white/10`
- Transitions: `transition-colors` on interactive elements
