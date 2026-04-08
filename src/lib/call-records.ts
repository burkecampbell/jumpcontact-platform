import { getDb } from '@/lib/db';
import { callRecords } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { cached } from './cache';

/**
 * Fetch per-call wrap-up from Neon call_records.
 * Returns a Map<callSid, wrapUpSec> for the given date range.
 * Cached 60s — these values don't change once scraped.
 */
export async function fetchCallWrapUp(fromDate: string, toDate: string): Promise<Map<string, number>> {
  const key = `call-wrapup:${fromDate}:${toDate}`;
  return cached(key, 60_000, async () => {
    try {
      const db = getDb();
      const rows = await db.select({
        callSid: callRecords.callSid,
        wrapUpSec: callRecords.wrapUpSec,
      })
      .from(callRecords)
      .where(sql`${callRecords.date} >= ${fromDate} AND ${callRecords.date} <= ${toDate} AND ${callRecords.wrapUpSec} IS NOT NULL`);

      const map = new Map<string, number>();
      for (const row of rows) {
        if (row.wrapUpSec != null) {
          map.set(row.callSid, row.wrapUpSec);
        }
      }
      return map;
    } catch {
      // Neon not provisioned or table doesn't exist yet — graceful fallback
      return new Map<string, number>();
    }
  });
}
