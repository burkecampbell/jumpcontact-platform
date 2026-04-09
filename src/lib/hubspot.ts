/**
 * HubSpot API client for JC Outbound Sales Dashboard.
 *
 * Portal: Jump Contact (YOUR_PORTAL_ID)
 * Auth: Private App PAT via HUBSPOT_PAT env var
 *
 * This module is SEPARATE from the Twilio-based agent system.
 * HUBSPOT_TEAM does not interact with ACTIVE_AGENTS, OUTBOUND_AGENTS,
 * or MSC_ONLY_AGENTS in constants.ts. Anthony appears in both systems
 * (MSC inbound on Twilio, JC outbound on HubSpot) — same person, dual role.
 */

import { TZ } from './constants';
import { cached } from './cache';
import type {
  HubSpotCall,
  HubSpotDeal,
  HubSpotTask,
  ActivityFeedItem,
  ActivityType,
  Pipeline,
  PipelineStage,
} from './outbound-types';

// ── Team Config ─────────────────────────────────────────────────────
// Colors come from AGENT_COLORS in constants.ts via agentColor() — not redefined here.

interface HubSpotOwner {
  ownerId: string;
  name: string;
  key: string;
}

export const HUBSPOT_TEAM: HubSpotOwner[] = [
  { ownerId: '263706316', name: 'Anthony', key: 'anthony' },
  { ownerId: '264612211', name: 'Angel M', key: 'angel' },
  { ownerId: '263685131', name: 'William', key: 'william' },
];

export const HUBSPOT_OBSERVERS: HubSpotOwner[] = [
  { ownerId: '89367067', name: 'Jose', key: 'jose' },
];

export const ALL_HUBSPOT_OWNERS = [...HUBSPOT_TEAM, ...HUBSPOT_OBSERVERS];

const OWNER_BY_ID = new Map(ALL_HUBSPOT_OWNERS.map(o => [o.ownerId, o]));

function resolveOwner(ownerId: string): { key: string; name: string } {
  return OWNER_BY_ID.get(ownerId) ?? { key: 'unknown', name: `Owner ${ownerId}` };
}

// ── Auth + Fetch ────────────────────────────────────────────────────

const HUBSPOT_BASE = 'https://api.hubapi.com';

function getToken(): string {
  const token = process.env.HUBSPOT_PAT;
  if (!token) throw new Error('HUBSPOT_PAT env var is not set');
  return token;
}

async function hubspotFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HubSpot ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

interface SearchResponse {
  total: number;
  results: Array<{ id: string; properties: Record<string, string | null>; createdAt: string; updatedAt: string; url?: string }>;
  paging?: { next?: { after: string } };
}

async function hubspotSearch(
  objectType: string,
  filters: Array<{ propertyName: string; operator: string; value?: string; values?: string[] }>,
  properties: string[],
  sorts: Array<{ propertyName: string; direction: string }> = [],
  limit = 100,
): Promise<SearchResponse['results']> {
  const all: SearchResponse['results'] = [];
  let after: string | undefined;

  // Paginate (HubSpot caps at 100 per page, 10K total)
  do {
    const body: Record<string, unknown> = {
      filterGroups: filters.length ? [{ filters }] : [],
      properties,
      sorts,
      limit,
    };
    if (after) body.after = after;

    const res = await hubspotFetch<SearchResponse>(
      `/crm/v3/objects/${objectType}/search`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    all.push(...res.results);
    after = res.paging?.next?.after;
    // Safety cap: don't fetch more than 500 items per type
    if (all.length >= 500) break;
  } while (after);

  return all;
}

// ── Date Helpers (MST) ──────────────────────────────────────────────

export function todayMST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

function startOfDayUTC(dateStr: string): string {
  // Convert MST date to UTC start-of-day for HubSpot timestamp filtering
  const d = new Date(`${dateStr}T00:00:00`);
  // MST is UTC-7 (MDT is UTC-6). Using timezone-aware approach:
  const mstStart = new Date(d.toLocaleString('en-US', { timeZone: TZ }));
  const utcOffset = d.getTime() - mstStart.getTime();
  return new Date(d.getTime() + utcOffset).toISOString();
}

// ── Data Fetchers ───────────────────────────────────────────────────

export async function fetchCallsForOwners(
  ownerIds: string[],
  dateStr: string,
): Promise<HubSpotCall[]> {
  const dayStart = `${dateStr}T00:00:00.000Z`;
  const dayEnd = `${dateStr}T23:59:59.999Z`;

  const results = await hubspotSearch(
    'calls',
    [
      { propertyName: 'hs_call_direction', operator: 'EQ', value: 'OUTBOUND' },
      { propertyName: 'hubspot_owner_id', operator: 'IN', values: ownerIds },
      { propertyName: 'hs_timestamp', operator: 'GTE', value: dayStart },
      { propertyName: 'hs_timestamp', operator: 'LTE', value: dayEnd },
    ],
    [
      'hs_call_title', 'hs_call_duration', 'hs_call_status', 'hs_call_direction',
      'hs_call_body', 'hs_call_summary', 'hs_call_recording_url',
      'hs_call_from_number_nickname', 'hs_connected_count', 'hs_timestamp',
      'hubspot_owner_id',
    ],
    [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
  );

  return results.map(r => {
    const p = r.properties;
    const owner = resolveOwner(p.hubspot_owner_id || '');
    return {
      id: r.id,
      title: p.hs_call_title || '',
      contactName: (p.hs_call_title || '').replace(/^Call with /, ''),
      durationMs: parseInt(p.hs_call_duration || '0', 10),
      status: p.hs_call_status || 'UNKNOWN',
      direction: p.hs_call_direction || 'OUTBOUND',
      body: p.hs_call_body || '',
      summary: p.hs_call_summary || '',
      recordingUrl: p.hs_call_recording_url || '',
      fromNickname: p.hs_call_from_number_nickname || '',
      connectedCount: parseInt(p.hs_connected_count || '0', 10),
      timestamp: p.hs_timestamp || r.createdAt,
      ownerKey: owner.key,
      ownerName: owner.name,
      hubspotUrl: r.url || '',
    };
  });
}

export async function fetchDealsForOwners(ownerIds: string[]): Promise<HubSpotDeal[]> {
  const results = await hubspotSearch(
    'deals',
    [
      { propertyName: 'hubspot_owner_id', operator: 'IN', values: ownerIds },
    ],
    [
      'dealname', 'amount', 'dealstage', 'pipeline', 'closedate',
      'createdate', 'hs_lastmodifieddate', 'hubspot_owner_id',
    ],
    [{ propertyName: 'createdate', direction: 'DESCENDING' }],
  );

  // We'll resolve stage labels after fetching pipelines
  return results.map(r => {
    const p = r.properties;
    const owner = resolveOwner(p.hubspot_owner_id || '');
    return {
      id: r.id,
      name: p.dealname || '',
      amount: p.amount ? parseFloat(p.amount) : null,
      stage: p.dealstage || '',
      stageLabel: '', // resolved later
      pipelineId: p.pipeline || '',
      pipelineLabel: '', // resolved later
      closeDate: p.closedate || null,
      ownerKey: owner.key,
      ownerName: owner.name,
      createdAt: p.createdate || r.createdAt,
    };
  });
}

export async function fetchPipelines(): Promise<Pipeline[]> {
  return cached('hs-pipelines', 300_000, async () => {
    const res = await hubspotFetch<{
      results: Array<{
        id: string;
        label: string;
        displayOrder: number;
        stages: Array<{
          id: string;
          label: string;
          displayOrder: number;
          metadata: { isClosed: string; probability: string };
        }>;
      }>;
    }>('/crm/v3/pipelines/deals');

    return res.results.map(p => ({
      id: p.id,
      label: p.label,
      stages: p.stages.map(s => ({
        id: s.id,
        label: s.label,
        order: s.displayOrder,
        isClosed: s.metadata.isClosed === 'true',
        probability: parseFloat(s.metadata.probability),
      })).sort((a, b) => a.order - b.order),
    }));
  });
}

export async function fetchTasksForOwners(ownerIds: string[]): Promise<HubSpotTask[]> {
  const results = await hubspotSearch(
    'tasks',
    [
      { propertyName: 'hubspot_owner_id', operator: 'IN', values: ownerIds },
    ],
    ['hs_task_subject', 'hs_task_status', 'hs_task_type', 'hubspot_owner_id', 'hs_timestamp'],
    [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
    200,
  );

  return results.map(r => {
    const p = r.properties;
    const owner = resolveOwner(p.hubspot_owner_id || '');
    return {
      id: r.id,
      subject: p.hs_task_subject || '',
      status: p.hs_task_status || '',
      type: p.hs_task_type || '',
      ownerKey: owner.key,
      ownerName: owner.name,
      timestamp: p.hs_timestamp || r.createdAt,
    };
  });
}

// ── Activity Feed ───────────────────────────────────────────────────

export async function fetchRecentActivity(
  ownerIds: string[],
  limit = 50,
): Promise<ActivityFeedItem[]> {
  const ownerFilter = { propertyName: 'hubspot_owner_id', operator: 'IN' as const, values: ownerIds };

  // Fetch engagement types sequentially with delays to respect HubSpot's per-second rate limit.
  // Private App tokens allow ~4-5 requests/second. We add 300ms gaps.
  const calls = await hubspotSearch(
    'calls',
    [ownerFilter],
    ['hs_call_title', 'hs_call_status', 'hs_call_duration', 'hs_call_summary', 'hs_timestamp', 'hubspot_owner_id'],
    [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
    limit,
  );
  await sleep(300);
  const tasks = await hubspotSearch(
    'tasks',
    [ownerFilter],
    ['hs_task_subject', 'hs_task_status', 'hs_timestamp', 'hubspot_owner_id'],
    [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
    limit,
  );
  await sleep(300);
  const notes = await hubspotSearch(
    'notes',
    [ownerFilter],
    ['hs_note_body', 'hs_timestamp', 'hubspot_owner_id'],
    [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
    20,
  );
  await sleep(300);
  const emails = await hubspotSearch(
    'emails',
    [ownerFilter],
    ['hs_email_subject', 'hs_email_status', 'hs_timestamp', 'hubspot_owner_id'],
    [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
    20,
  );

  const items: ActivityFeedItem[] = [];

  // Map calls
  for (const r of calls) {
    const p = r.properties;
    const owner = resolveOwner(p.hubspot_owner_id || '');
    items.push({
      id: r.id,
      type: 'call',
      timestamp: p.hs_timestamp || r.createdAt,
      agentName: owner.name,
      agentKey: owner.key,
      title: p.hs_call_title || 'Outbound Call',
      detail: stripHtml(p.hs_call_summary || ''),
      status: p.hs_call_status || '',
      durationMs: parseInt(p.hs_call_duration || '0', 10),
      hubspotUrl: r.url,
    });
  }

  // Map tasks
  for (const r of tasks) {
    const p = r.properties;
    const owner = resolveOwner(p.hubspot_owner_id || '');
    items.push({
      id: r.id,
      type: 'task',
      timestamp: p.hs_timestamp || r.createdAt,
      agentName: owner.name,
      agentKey: owner.key,
      title: p.hs_task_subject || 'Task',
      status: p.hs_task_status || '',
      hubspotUrl: r.url,
    });
  }

  // Map notes
  for (const r of notes) {
    const p = r.properties;
    const owner = resolveOwner(p.hubspot_owner_id || '');
    items.push({
      id: r.id,
      type: 'note',
      timestamp: p.hs_timestamp || r.createdAt,
      agentName: owner.name,
      agentKey: owner.key,
      title: 'Note',
      detail: stripHtml(p.hs_note_body || ''),
      hubspotUrl: r.url,
    });
  }

  // Map emails
  for (const r of emails) {
    const p = r.properties;
    const owner = resolveOwner(p.hubspot_owner_id || '');
    items.push({
      id: r.id,
      type: 'email',
      timestamp: p.hs_timestamp || r.createdAt,
      agentName: owner.name,
      agentKey: owner.key,
      title: p.hs_email_subject || 'Email',
      status: p.hs_email_status || '',
      hubspotUrl: r.url,
    });
  }

  // Sort all by timestamp descending, take top N
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return items.slice(0, limit);
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Brief pause between HubSpot API calls to avoid per-second rate limit. */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}
