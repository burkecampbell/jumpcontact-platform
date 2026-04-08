/**
 * TypeScript interfaces for the HubSpot Outbound Sales Dashboard.
 * Used by /api/outbound route and OutboundPage components.
 */

// ── HubSpot Raw Records ─────────────────────────────────────────────

export interface HubSpotCall {
  id: string;
  title: string;
  contactName: string;
  durationMs: number;
  status: 'COMPLETED' | 'NO_ANSWER' | 'BUSY' | 'FAILED' | string;
  direction: string;
  body: string;
  summary: string;
  recordingUrl: string;
  fromNickname: string;
  connectedCount: number;
  timestamp: string;
  ownerKey: string;
  ownerName: string;
  hubspotUrl: string;
}

export interface HubSpotDeal {
  id: string;
  name: string;
  amount: number | null;
  stage: string;
  stageLabel: string;
  pipelineId: string;
  pipelineLabel: string;
  closeDate: string | null;
  ownerKey: string;
  ownerName: string;
  createdAt: string;
}

export interface HubSpotTask {
  id: string;
  subject: string;
  status: string;
  type: string;
  ownerKey: string;
  ownerName: string;
  timestamp: string;
}

// ── Activity Feed ───────────────────────────────────────────────────

export type ActivityType = 'call' | 'email' | 'note' | 'task' | 'meeting';

export interface ActivityFeedItem {
  id: string;
  type: ActivityType;
  timestamp: string;
  agentName: string;
  agentKey: string;
  title: string;
  detail?: string;
  status?: string;
  durationMs?: number;
  hubspotUrl?: string;
}

// ── Per-Agent Stats ─────────────────────────────────────────────────

export interface OutboundAgentStats {
  key: string;
  name: string;
  ownerId: string;
  totalCalls: number;
  connected: number;
  noAnswer: number;
  totalDurationMs: number;
  avgDurationMs: number;
  connectRate: number;
  deals: number;
  tasks: { open: number; completed: number };
}

// ── Pipeline Stage ──────────────────────────────────────────────────

export interface PipelineStage {
  id: string;
  label: string;
  order: number;
  isClosed: boolean;
  probability: number;
}

export interface Pipeline {
  id: string;
  label: string;
  stages: PipelineStage[];
}

// ── Top-Level API Response ──────────────────────────────────────────

export interface OutboundDashboardData {
  agents: OutboundAgentStats[];
  deals: HubSpotDeal[];
  pipelines: Pipeline[];
  activityFeed: ActivityFeedItem[];
  teamTotals: {
    totalCalls: number;
    connected: number;
    noAnswer: number;
    totalDurationMs: number;
  };
  pulledAt: string;
}
