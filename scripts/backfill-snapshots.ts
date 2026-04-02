#!/usr/bin/env npx tsx
/**
 * Backfill daily_snapshots from Google Sheets conversion data.
 *
 * Usage:
 *   npx dotenv -e .env.local -- npx tsx scripts/backfill-snapshots.ts
 *   npx dotenv -e .env.local -- npx tsx scripts/backfill-snapshots.ts --from 2026-01-01 --to 2026-03-31
 *
 * This reads historical conversion data from the Google Sheets conversions tab
 * and inserts snapshot rows into Neon Postgres. Since we don't have historical
 * CDR data readily available, call metrics (answered, missed, speed, wrap) are
 * populated only for conversion counts — CDR fields are set to 0/null.
 *
 * The cron job will capture full CDR data going forward.
 */

import 'dotenv/config';
import forge from 'node-forge';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../src/lib/db/schema';
import { dailySnapshots } from '../src/lib/db/schema';

// ── Config ──────────────────────────────────────────────────────────

const CONVERSIONS_SHEET_ID = process.env.CONVERSIONS_SHEET_ID || 'YOUR_SHEET_ID';
const TZ = 'America/Edmonton';

const AGENT_ALIASES: Record<string, string> = {
  jose: 'danny', daniel: 'danny',
};

function normalizeAgent(raw: string): string {
  const name = raw.trim().toLowerCase().replace(/[^a-z]/g, '');
  return AGENT_ALIASES[name] || name;
}

// ── Google Sheets Auth (standalone — no Next.js imports) ────────────

function b64url(str: string): string {
  return Buffer.from(str).toString('base64url');
}

async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.replace(/\\n/g, '').trim();
  const rawKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (!email || !rawKey) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY');

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const signing = `${header}.${payload}`;

  const privateKey = forge.pki.privateKeyFromPem(rawKey);
  const md = forge.md.sha256.create();
  md.update(signing, 'utf8');
  const sigBytes = privateKey.sign(md);
  const sig = Buffer.from(sigBytes, 'binary').toString('base64url');
  const jwt = `${signing}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function readSheet(sheetId: string, range: string): Promise<string[][]> {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.values || [];
}

// ── Date parsing (matches sheets.ts logic) ──────────────────────────

function parseFlexDate(val: string): Date | null {
  if (!val) return null;
  // Try ISO first
  const iso = new Date(val);
  if (!isNaN(iso.getTime()) && val.includes('-')) return iso;
  // Try M/D/YYYY H:MM:SS
  const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?/i);
  if (m) {
    let hr = parseInt(m[4]);
    if (m[7]?.toUpperCase() === 'PM' && hr < 12) hr += 12;
    if (m[7]?.toUpperCase() === 'AM' && hr === 12) hr = 0;
    return new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]), hr, parseInt(m[5]), parseInt(m[6]));
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const fromIdx = args.indexOf('--from');
  const toIdx = args.indexOf('--to');

  const fromDate = fromIdx >= 0 ? args[fromIdx + 1] : '2026-01-01';
  const toDate = toIdx >= 0 ? args[toIdx + 1] : '2026-03-31';

  console.log(`Backfilling snapshots from ${fromDate} to ${toDate}...`);

  // Generate all dates in range
  const dates: string[] = [];
  const cur = new Date(fromDate + 'T12:00:00Z');
  const end = new Date(toDate + 'T12:00:00Z');
  while (cur <= end) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cur.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  console.log(`  ${dates.length} dates to process`);

  // ── Read all conversions from Google Sheets ─────────────────────
  console.log('  Reading conversions sheet...');
  const rows = await readSheet(CONVERSIONS_SHEET_ID, 'A:E');
  console.log(`  ${rows.length - 1} rows read`);

  // Bucket by date
  const dateSet = new Set(dates);
  type DayBucket = {
    total: number;
    byAgent: Record<string, number>;
    byAccount: Record<string, number>;
  };
  const buckets = new Map<string, DayBucket>();
  for (const d of dates) buckets.set(d, { total: 0, byAgent: {}, byAccount: {} });

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;
    const ts = parseFlexDate(row[0]);
    if (!ts) continue;
    const mst = new Date(ts.toLocaleString('en-US', { timeZone: TZ }));
    const dateStr = `${mst.getFullYear()}-${String(mst.getMonth() + 1).padStart(2, '0')}-${String(mst.getDate()).padStart(2, '0')}`;
    if (!dateSet.has(dateStr)) continue;

    const bucket = buckets.get(dateStr)!;
    bucket.total++;
    const agent = normalizeAgent(row[4] || row[3] || '');
    if (agent) bucket.byAgent[agent] = (bucket.byAgent[agent] || 0) + 1;
    const account = (row[2] || '').trim().toLowerCase();
    if (account) bucket.byAccount[account] = (bucket.byAccount[account] || 0) + 1;
  }

  // ── Connect to Neon ─────────────────────────────────────────────
  const pgUrl = process.env.POSTGRES_URL;
  if (!pgUrl) throw new Error('POSTGRES_URL not set');
  const sql = neon(pgUrl);
  const db = drizzle(sql, { schema });

  // ── Insert snapshots ────────────────────────────────────────────
  let inserted = 0;
  let skipped = 0;

  for (const dateStr of dates) {
    const bucket = buckets.get(dateStr)!;
    const agentEntries = Object.entries(bucket.byAgent);
    const agentData = agentEntries
      .map(([agent, conversions]) => ({ agent, conversions, calls: 0, talkMin: 0, speedSec: null, wrapUpSec: null }))
      .sort((a, b) => b.conversions - a.conversions);

    // For backfill, we only have conversion data — CDR fields are 0/null.
    // The "mixed" brand gets total conversions. JC/MSC split is not possible
    // from the conversions sheet alone (no brand column), so we only write "mixed".
    const id = `${dateStr}_mixed`;
    const row = {
      id,
      date: dateStr,
      brand: 'mixed',
      answeredCalls: 0,        // No CDR data for backfill
      missedCalls: 0,
      totalCalls: 0,
      conversions: bucket.total,
      avgSpeedSec: null,
      avgWrapSec: null,
      agentCount: agentEntries.length,
      agentData,
      reconciliation: {
        source: 'backfill-sheets-only',
        conversionTotal: bucket.total,
        note: 'Backfilled from Google Sheets conversions. CDR metrics not available historically.',
      },
    };

    try {
      await db.insert(dailySnapshots).values(row).onConflictDoNothing();
      inserted++;
    } catch (err) {
      // Already exists — skip
      skipped++;
    }
  }

  console.log(`\nDone! Inserted: ${inserted}, Skipped (already exists): ${skipped}`);
  console.log('Note: Only "mixed" brand backfilled (JC/MSC split requires CDR data).');
  console.log('Going forward, the daily cron captures all three brands with full CDR metrics.');
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
