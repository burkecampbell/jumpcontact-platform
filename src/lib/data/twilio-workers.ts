/**
 * Twilio TaskRouter — per-worker speed and wrap-up stats.
 */
import { WORKSPACE_SID } from '../auth/twilio';

/**
 * Fetch per-worker avg_task_acceptance_time and avg_task_cleanup_time from TaskRouter.
 */
export async function getWorkerSpeedStats(
  ds: string,
  auth: string,
): Promise<Record<string, { speedSec: number; wrapUpSec: number }>> {
  try {
    const workersRes = await fetch(
      `https://taskrouter.twilio.com/v1/Workspaces/${WORKSPACE_SID}/Workers?PageSize=100`,
      { headers: { Authorization: auth } },
    );
    const workersData = await workersRes.json() as {
      workers?: Array<{ sid: string; friendly_name: string }>;
    };
    const workers = workersData.workers || [];
    const results = await Promise.allSettled(
      workers.map(async w => {
        const statsRes = await fetch(
          `https://taskrouter.twilio.com/v1/Workspaces/${WORKSPACE_SID}/Workers/${w.sid}/Statistics?StartDate=${ds}`,
          { headers: { Authorization: auth } },
        );
        const statsData = await statsRes.json() as {
          cumulative?: { avg_task_acceptance_time?: number; avg_task_cleanup_time?: number };
        };
        const speedSec  = Math.round(statsData?.cumulative?.avg_task_acceptance_time || 0);
        const wrapUpSec = Math.round(statsData?.cumulative?.avg_task_cleanup_time   || 0);
        // Keep agents even if both are 0 — they still answered calls, just had instant accept/wrap
        if (speedSec === 0 && wrapUpSec === 0 && !statsData?.cumulative) return null;
        const rawName = w.friendly_name.split('@')[0].toLowerCase();
        return { agent: rawName, speedSec, wrapUpSec };
      }),
    );
    const map: Record<string, { speedSec: number; wrapUpSec: number }> = {};
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        map[r.value.agent] = { speedSec: r.value.speedSec, wrapUpSec: r.value.wrapUpSec };
      }
    }
    return map;
  } catch {
    return {};
  }
}
