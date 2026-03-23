/**
 * UNIFIED DATA CONTRACT — Jump Contact Platform
 *
 * These types match ops-center's /api/live response exactly.
 * No transforms, no adapters. Direct consumption.
 *
 * Source of truth: operations-center/src/lib/contract.ts
 */

export interface AgentStat { agent: string; count: number }
export interface AcctStat { account: string; count: number }

export interface RepAgent {
  agent: string;
  calls: number;
  talkMin: number;
  speedSec: number | null;
  wrapUpSec: number | null;
  hoursScheduled: number;
  convsPerHour?: number;
  conversions: number;
}

export interface OutboundAgent {
  agent: string;
  callsMade: number;
  talkMin: number;
}

export interface ConvPeriod {
  total: number;
  byAgent: AgentStat[];
  byAccount: AcctStat[];
  hourly: number[];
}

export interface MissedPeriod {
  total: number;
  byAccount: AcctStat[];
}

export interface RepActivity {
  agents: RepAgent[];
  outbound: OutboundAgent[];
  avgSpeedSec: number | null;
}

export interface PeriodData {
  date: string;
  conversions: ConvPeriod;
  missedCalls: MissedPeriod;
  repActivity: RepActivity;
  conversionRate: number | null;
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

export interface MtdData {
  total: number;
  byAgent: AgentStat[];
  goal: number;
  dailyGoal: number;
  dayOfMonth: number;
  daysInMonth: number;
  daysRemaining: number;
  goalPace: number;
  projectedEOM: number;
  deficit: number;
  requiredDailyRate: number;
  onTrack: boolean;
}

export interface ScheduleData {
  agents: {
    name: string;
    schedule: Record<string, string>;
    hrsPerWeek: number;
    isOnShift: boolean;
  }[];
}

/** Full payload from ops-center /api/live */
export interface DashboardData {
  today: PeriodData & {
    totalCalls: number;
    answeredCalls: number;
    answerRate: number;
    missedCallRate: number;
    teamAvgSpeed: number;
    fastestPickup: number;
    convPerHour: number;
  };
  yesterday: PeriodData;
  mtd: MtdData;
  trend7d: { dates: string[]; conversions: number[]; missed: number[]; conversionRate: (number | null)[] };
  ytd: { total: number; byMonth: { month: string; conversions: number }[]; goal: number; annualPace: number; projectedEOY: number; onTrack: boolean };
  thisWeek: number;
  lastWeek: number;
  schedule: ScheduleData | null;
  recentCalls: RawCall[];
  pulledAt: string;
}
