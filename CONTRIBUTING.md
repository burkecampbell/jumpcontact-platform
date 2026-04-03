# Contributing

## Development Setup

```bash
git clone https://github.com/burke-jpg/jumpcontact-platform.git
cd jumpcontact-platform
npm install
cp .env.example .env.local    # Fill in credentials
npm run dev                    # http://localhost:3003
```

## Code Standards

### Architecture Rules

- **Mixed is canonical.** All brand views derive from Mixed. Never compute JC or MSC independently.
- **Ytica is source of truth** for agent metrics. CDR is real-time supplement. Never overwrite Ytica with CDR.
- **All times are MST.** Use `America/Edmonton` timezone everywhere. Never hardcode UTC offsets.
- **Immutable snapshots.** Once a daily snapshot is written to Postgres, it is never updated.

### Agent Rules

- **Jose and Daniel are separate agents.** Jose is CEO (blended). Daniel aliases to Danny.
- **MSC agents** (Natalie, Desi, Sue, etc.) never appear on JC-only views.
- **Blended agents** (Sara, Wendy, Jose) appear on both brands, split by CDR ratio.
- **Sara and Sue** are excluded from conversion rankings (`EXCLUDED_AGENTS`).
- **ACTIVE_AGENTS** is the display list. Agent brand sets (`brand.ts`) control filtering.

### Code Patterns

- **Data sources**: One module per source in `src/lib/data/` or `src/lib/`. Each exports typed async functions.
- **Caching**: Wrap external fetches with `cached(key, ttlMs, fn)` from `cache.ts`.
- **Components**: Client components (`'use client'`). Import `NavBar`, `Card`, `ErrorBoundary`, `HealthBanner`.
- **Colors**: Use the `C` object from `constants.ts`. Never hardcode hex values in components.
- **Types**: All shared interfaces in `types.ts`. API response types in `api-types.ts`.

### Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

- Tests must pass before build (`npm run build` runs `vitest run` first).
- Test data transformations, not rendering. Mock external APIs.
- Test the math: brand additivity, rounding, date parsing edge cases.

### Commit Messages

Follow conventional commits:

```
feat: add new feature
fix: correct a bug
chore: maintenance (no behavior change)
docs: documentation only
```

Include what changed and why. Multi-line body for complex changes.

## Pull Requests

1. Create a feature branch from `main`
2. Make changes, ensure `npm test` and `npx tsc --noEmit` pass
3. Push and open PR — CI runs automatically
4. Merge to `main` triggers Vercel auto-deploy

## Adding a New Agent

1. Add to appropriate set in `src/lib/brand.ts` (MSC_ONLY, JC_ONLY, or BLENDED)
2. Add to `JUMP_AGENTS` in `src/lib/sheets.ts` (Ytica whitelist)
3. Add color in `AGENT_COLORS` in `src/lib/constants.ts`
4. Optionally add schedule in `AGENT_SCHEDULE` in `constants.ts`
5. Update Apps Script `AGENT_MAP` if the agent has a known alias

## Adding a New Data Source

1. Create `src/lib/data/{source}.ts` with typed fetch function
2. Add auth module to `src/lib/auth/` if needed
3. Wire into the parallel fetch in `src/app/api/data/route.ts`
4. Wrap with `cached()` for TTL caching
5. Add types to `src/lib/types.ts`
6. Add health check in `src/lib/health-checks.ts`
