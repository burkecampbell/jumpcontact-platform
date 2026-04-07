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

// ── Data Provenance Tags ────────────────────────────────────────────
// Every call carries metadata about HOW it was paired and HOW its brand
// was determined.  When either is 'unknown', it's a data gap — visible
// in the UI and API quality metrics, never silently defaulted.

export type PairMethod =
  | 'trunk-match'     // Strategy 1: same trunk, time window
  | 'cross-trunk'     // Strategy 1b: different trunk, brand-compatible
  | 'parent-sid'      // Strategy 2: parent call SID chain
  | 'fallback'        // Strategy 3: best-effort, missing data
  | 'missed'          // Unmatched inbound (no agent)
  | 'outbound';       // Agent-initiated outbound

export type BrandSource =
  | 'client-name'     // Resolved from clientBrands map
  | 'trunk-phone'     // Resolved from brands map in clients.json
  | 'agent-definitive'// MSC-only or JC-only agent
  | 'agent-blended'   // Blended agent, could be either brand
  | 'unknown';        // No signal — data gap, needs investigation

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
  /** How this call was paired (which strategy matched the agent to the inbound leg) */
  pairMethod?: PairMethod;
  /** How the brand was determined for filtering */
  brandSource?: BrandSource;
  /** The resolved brand ('jc' | 'msc' | null if unknown) */
  resolvedBrand?: 'jc' | 'msc' | null;
}

export interface DataQuality {
  totalCalls: number;
  paired: { trunkMatch: number; crossTrunk: number; parentSid: number; fallback: number; missed: number; outbound: number };
  branded: { clientName: number; trunkPhone: number; agentDefinitive: number; agentBlended: number; unknown: number };
  /** Percentage of calls with definitive brand assignment */
  brandConfidence: number;
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
export interface AcctStat { account: string; count: number; topAgent?: string; agentBreakdown?: Record<string, number> }

export interface RepAgent {
  agent: string;
  calls: number;
  talkMin: number;
  speedSec: number | null;
  wrapUpSec: number | null;
  hoursScheduled: number;
  hoursActive?: number;
  convsPerHour?: number;
  conversions: number;
  reservationsCreated?: number;
  reservationsAccepted?: number;
  reservationsRejected?: number;
  reservationsTimedOut?: number;
  pickupRate?: number;
  declineRate?: number;
  ghostRate?: number;
  trueYield?: number;
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
  hourly?: number[];
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

// ── Brand Data Pipeline ────────────────────────────────────────────
// CDR calls bucketed by brand. Built once per period, used by
// deriveBrandView() to produce complete per-brand PeriodData.

export interface BrandBucket {
  answered: number;     // completed inbound calls
  missed: number;       // inbound duration=0 calls
  talkSec: number;      // total talk seconds
  ringSum: number;      // sum of ring times (for avg speed)
  ringCount: number;    // count of valid ring times
}

export interface BrandCallSummary {
  jc: BrandBucket;
  msc: BrandBucket;
  unknown: BrandBucket;
  /** Per blended agent: fraction of their calls that are JC vs MSC */
  agentRatios: Record<string, { jc: number; msc: number }>;
  /** Missed calls broken down by brand, then by account */
  missedByBrand: {
    jc: { total: number; byAccount: AcctStat[] };
    msc: { total: number; byAccount: AcctStat[] };
  };
}

export interface PeriodData {
  date: string;
  conversions: ConvPeriod;
  missedCalls: MissedPeriod;
  repActivity: RepActivity;
  teamStats: TeamStats | null;
  conversionRate: number | null;
  // CDR-derived fields (populated for today + yesterday)
  totalCalls?: number;
  answeredCalls?: number;
  answerRate?: number;
  missedCallRate?: number;
  teamAvgSpeed?: number;
  fastestPickup?: number;
  convPerHour?: number;
}

export interface RawCall {
  time: string;
  agent: string;
  phone: string;
  duration: number;
  direction: 'inbound' | 'outbound';
  callSid?: string;
  agentLegSid?: string;
  recordingUrl?: string;
  account?: string;
  ringTime?: number;
  totalDuration?: number;
  wrapUpSec?: number;
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

export interface MonthChampion {
  agent: string;
  value: number;
  runnerUp?: string;
  runnerUpValue?: number;
}

export interface MonthChampions {
  month: string;         // "March 2026"
  mostConversions: MonthChampion;
  mostCalls: MonthChampion;
  fastestSpeed: MonthChampion;
  mostTalkTime: MonthChampion;
  bestConvRate: MonthChampion;
}

export interface YticaMtdAgent {
  agent: string;
  totalCalls: number;
  totalTalkMin: number;
  avgSpeedSec: number | null;
  avgWrapUpSec: number | null;
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
  prevMonthChampions?: MonthChampions;
  dataQuality?: DataQuality;
  brandBreakdown?: {
    jc: { calls: number; avgSpeed: number | null };
    msc: { calls: number; avgSpeed: number | null };
  };
  mtdRepActivity?: YticaMtdAgent[];
  clientSpeed?: { account: string; avgSpeed: number; calls: number }[];
  brand?: string;
  pulledAt: string;
}
