import { NextRequest, NextResponse } from 'next/server';
import { runHealthChecks } from '@/lib/health-checks';
import { sendAlerts } from '@/lib/alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/cron/health-check
 *
 * Runs every 30 min via Vercel Cron. Checks Ytica, Sheets, conversions, CDR.
 * Sends Telegram alerts for any failures.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runHealthChecks();

  let sent = 0;
  if (result.alerts.length > 0) {
    sent = await sendAlerts(result.alerts);
  }

  return NextResponse.json({
    ...result,
    alertsSent: sent,
  });
}
