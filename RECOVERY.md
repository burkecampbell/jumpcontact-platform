---
tags: [google-sheets, jump-contact, platform, twilio, type/credentials, type/integration, type/tool, vercel]
---

# Disaster Recovery — JumpContact Platform

> If your machine dies, follow this to get back to full operations.

## Prerequisites

- Node.js 20+ installed
- Git installed
- Access to burke@jumpcontact.com Google account (for Sheets API)
- Access to burke@jumpcontact.com Vercel account

## Step 1: Clone the Repo

```bash
git clone https://github.com/burke-jpg/jumpcontact-platform.git
cd jumpcontact-platform
npm install
```

## Step 2: Link to Vercel & Pull Environment Variables

```bash
npm i -g vercel
vercel login                    # Log in as burke@jumpcontact.com
vercel link --yes --project jump-contact-dashboard --scope burke-5005s-projects
vercel env pull .env.local      # Downloads all secrets
```

This gives you:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` (Sheets API)
- `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_WORKSPACE_SID`
- `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CONVERSIONS_SHEET_ID`, `MISSED_CALLS_SHEET_ID`, `YTICA_SHEET_ID`
- All other env vars

## Step 3: Verify & Run

```bash
npm run verify    # Checks all env vars are present
npm run dev       # Starts on localhost:3003
```

Open http://localhost:3003 — sign in with Google (burke@jumpcontact.com).

## Step 4: Deploy

Push to `main` auto-deploys to Vercel:

```bash
git push origin main
```

Or deploy manually:

```bash
vercel --prod
```

## Key Accounts & Services

| Service | Account | URL |
|---------|---------|-----|
| **Vercel** | burke@jumpcontact.com | https://vercel.com/burke-5005s-projects/jump-contact-dashboard |
| **GitHub** | burke-jpg | https://github.com/burke-jpg/jumpcontact-platform |
| **Clerk** | burke@jumpcontact.com | https://dashboard.clerk.com (polished-parakeet-55) |
| **Twilio** | Jump Contact account | https://console.twilio.com |
| **Google Sheets** | your-service-account@your-project.iam.gserviceaccount.com | Service account (no login needed) |
| **Ytica** | burke@jumpcontact.com | 6am daily email → Apps Script → Google Sheet |

## Google Sheet IDs

| Sheet | ID | Purpose |
|-------|-----|---------|
| Conversions | `YOUR_SHEET_ID` | Agent conversion tracking |
| Missed Calls | `YOUR_SHEET_ID` | Missed call log |
| Ytica | `YOUR_SHEET_ID` | Daily agent metrics (Sheet1 + TeamStats tabs) |

## File Structure (What Lives Where)

```
GitHub (source of truth for code):
  └── All source code, scripts, prototypes, PICKUP.md, RECOVERY.md

Vercel (source of truth for deployment):
  └── Environment variables, production deployment, domains, Clerk integration

Google Sheets (source of truth for business data):
  └── Conversions, missed calls, Ytica daily metrics, schedule

Twilio (source of truth for call data):
  └── CDR, recordings, TaskRouter worker stats

clients.json (source of truth for phone→client→brand mapping):
  └── In repo at src/data/clients.json — update manually or via script
```

## If Vercel Account Is Lost

1. Create new Vercel account with burke@jumpcontact.com
2. Import GitHub repo
3. Re-add environment variables from Twilio/Google/Clerk dashboards
4. Re-install Clerk integration: `vercel integration add clerk`
5. Set production domain

## If GitHub Account Is Lost

The code also exists on your local machine AND on Vercel's build cache. To recover:
1. Create new GitHub account
2. `git remote set-url origin https://github.com/NEW-ACCOUNT/jumpcontact-platform.git`
3. `git push -u origin main`
4. Re-link Vercel to new repo in dashboard
