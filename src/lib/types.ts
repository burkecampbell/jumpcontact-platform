/**
 * Shared type definitions for the JumpContact Platform data layer.
 */

/** Agent name → [Sun, Mon, Tue, Wed, Thu, Fri, Sat] net hours per day */
export type AgentSchedule = Record<string, number[]>;

export interface AgentStat {
  agent: string;
  count: number;
  daily?: Record<string, number>;
}

export interface AcctStat {
  account: string;
  count: number;
}

export interface RepAgent {
  agent: string;
  calls: number;
  talkMin: number;
  speedSec: number | null;
  wrapUpSec: number | null;
  hoursScheduled: number;
  convsPerHour?: number;
}

export interface OutboundAgent {
  agent: string;
  callsMade: number;
  talkMin: number;
}

export interface MissedData {
  total: number;
  jcTotal: number;
  ibrahimCount: number;
  byAccount: AcctStat[];
}

export interface ConvPeriod {
  total: number;
  byAgent: AgentStat[];
  byAccount: AcctStat[];
  hourly?: number[];
  mtdDaily?: { date: string; total: number }[];
}

export interface RawCall {
  time: string;
  agent: string;
  phone: string;
  duration: number;
  direction: 'inbound' | 'outbound';
  callSid?: string;
  recordingUrl?: string;
  account?: string;
}

export interface PeriodData {
  conversions: ConvPeriod;
  missedCalls: MissedData;
  repActivity: { agents: RepAgent[]; outbound: OutboundAgent[]; avgSpeedSec: number | null };
  conversionRate?: number;
}

export interface DashboardData {
  date: string;
  yesterdayDate: string;
  pulledAt: string;
  today: PeriodData;
  yesterday: PeriodData;
  mtd: ConvPeriod;
  recentCalls: RawCall[];
  weekend?: { friday: PeriodData; saturday: PeriodData; sunday: PeriodData };
  schedule?: AgentSchedule;
}

export interface TwilioCall {
  sid: string;
  to: string;
  from: string;
  duration: string;
  date_created: string;
  start_time: string;
  end_time: string;
  status: string;
  parent_call_sid?: string;
}
