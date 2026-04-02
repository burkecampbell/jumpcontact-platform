import { NextResponse } from 'next/server';
import { runHealthChecks } from '@/lib/health-checks';
import { cached } from '@/lib/cache';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * Lightweight health status endpoint for the dashboard banner.
 * Cached for 60s to avoid hammering external services on every page load.
 * Does NOT send alerts — that's the cron's job.
 */
export async function GET() {
  const result = await cached('health-check', 60_000, runHealthChecks);
  return NextResponse.json(result);
}
