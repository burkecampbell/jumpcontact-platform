// ── Call Types ───────────────────────────────────────────────────────

export interface CallLeg {
  sid: string;
  from: string;
  to: string;
  direction: 'inbound' | 'outbound-dial' | 'outbound-api' | string;
  status: string;
  startTime: string;
  endTime: string;
  duration: number;
  queueTime: number;
  parentCallSid?: string;
}

export interface PairedCall {
  id: string;
  time: string;
  agent: string;
  from: string;
  to: string;
  client: string;
  direction: 'inbound' | 'outbound';
  duration: number;
  totalDuration: number;
  ringTime: number;
  status: string;
  recordingSid?: string;
  agentLegSid?: string;
}

export interface CallsResponse {
  calls: PairedCall[];
  total: number;
  hasMore: boolean;
  pulledAt: string;
}

// ── Agent Stats ─────────────────────────────────────────────────────

export interface ActivityBreakdown {
  availableSec: number;
  busySec: number;
  wrapUpSec: number;
  offlineSec: number;
  totalActiveSec: number;
  reservationsCreated: number;
  reservationsAccepted: number;
  reservationsRejected: number;
  reservationsTimedOut: number;
  taskAcceptanceRate: number;
}

export interface AgentEfficiency {
  name: string;
  calls: number;
  inbound: number;
  outbound: number;
  answered: number;
  missed: number;
  totalDuration: number;
  avgCallDuration: number;
  avgSpeed: number;
  avgWrapUp: number;
  avgRingTime: number;
  speedGrade: string;
  conversions: number;
  conversionRate: number | null;
  missedCallRate: number;
  firstConversionTime: string;
  lastConversionTime: string;
  conversionsPerHour: number;
  callsPerHour: number;
  hoursScheduled: number;
  hoursActive: number;
  utilization: number;
  activity: ActivityBreakdown;
}

export interface AnalyticsData {
  date: string;
  totalCalls: number;
  totalInbound: number;
  totalOutbound: number;
  totalAnswered: number;
  totalMissed: number;
  totalConversions: number;
  teamConversionRate: number | null;
  missedCallRate: number;
  activeAgentCount: number;
  teamConvPerHour: number | null;
  teamCallsPerHour: number | null;
  teamAvgSpeed: number;
  teamAvgWrapUp: number;
  teamAvgRingTime: number;
  answerRate: number;
  avgCallDuration: number;
  totalTalkMinutes: number;
  peakHour: number;
  peakHourCalls: number;
  agents: AgentEfficiency[];
  hourly: Record<string, number[]>;
  hourlyTotal: number[];
  hourlyAnswered: number[];
  hourlyMissed: number[];
  convByHour: number[];
  convByAgent: Record<string, number>;
  convByAccount: { account: string; count: number }[];
  pulledAt: string;
}

// ── Schedule ────────────────────────────────────────────────────────

export interface ScheduleEntry {
  name: string;
  schedule: Record<string, string>;
  hrsPerWeek: number;
}

// ── Contract Types ──────────────────────────────────────────────────

export interface AgentStat { agent: string; count: number; daily?: Record<string, number> }
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

export interface TeamStats {
  totalCalls: number;
  inbound: number;
  outbound: number;
  talkTime: string;
  avgTalk: string;
  missed: number;
  missedOver15: number;
  missedPct: string;
  source: 'ytica';
}

export interface PeriodData {
  date: string;
  conversions: ConvPeriod;
  missedCalls: MissedPeriod;
  repActivity: RepActivity;
  teamStats: TeamStats | null;
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
  byAccount?: AcctStat[];
  hourly?: number[];
  mtdDaily?: { date: string; total: number }[];
}

export interface ScheduleData {
  agents: {
    name: string;
    schedule: Record<string, string>;
    hrsPerWeek: number;
    isOnShift: boolean;
  }[];
}

export interface TrendData {
  dates: string[];
  conversions: number[];
  missed: number[];
  conversionRate: (number | null)[];
}

export interface YtdData {
  total: number;
  byMonth: { month: string; conversions: number }[];
  goal: number;
  annualPace: number;
  projectedEOY: number;
  onTrack: boolean;
}

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
  trend7d: TrendData;
  ytd: YtdData;
  date?: string;
  yesterdayDate?: string;
  thisWeek: number;
  lastWeek: number;
  schedule: ScheduleData | null;
  recentCalls: RawCall[];
  weekend?: { friday: PeriodData; saturday: PeriodData; sunday: PeriodData };
  pulledAt: string;
}
