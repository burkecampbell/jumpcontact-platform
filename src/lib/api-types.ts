/**
 * Typed API response contracts for every JumpContact Platform endpoint.
 * Import these on the frontend to get type-safe API consumption.
 */

import type { DashboardData, RawCall } from './types';

// ── /api/data ────────────────────────────────────────────────────────────────

/** GET /api/data — full dashboard payload (60s server-side cache) */
export type DataResponse = DashboardData;

// ── /api/calls ───────────────────────────────────────────────────────────────

/** Per-agent summary included in CallsResponse */
export interface AgentCallSummary {
  agent: string;
  calls: number;
  talkMin: number;
}

/** GET /api/calls?date=YYYY-MM-DD&limit=50&offset=0 */
export interface CallsResponse {
  calls: RawCall[];
  agents: AgentCallSummary[];
  pulledAt: string;
  /** Total calls for the day (all agents, before pagination) */
  total: number;
  /** Whether there are more calls beyond offset + limit */
  hasMore: boolean;
}

// ── /api/calls/recording ─────────────────────────────────────────────────────

/**
 * GET /api/calls/recording?sid=CAxxxx[&key=xxx][&download=1]
 * Success: streams audio/mpeg body (no JSON)
 * Error: returns RecordingError JSON
 */
export interface RecordingError {
  error: string;
}

// ── Shared error shape ───────────────────────────────────────────────────────

/** Common error envelope returned by all JSON endpoints on failure */
export interface ApiError {
  error: string;
}
