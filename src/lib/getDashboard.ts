/**
 * getDashboard.ts — Backward-compatible barrel re-export.
 *
 * All logic has been decomposed into focused modules under:
 *   src/lib/types.ts        — shared type definitions
 *   src/lib/auth/           — Google + Twilio auth
 *   src/lib/data/           — data fetchers and orchestrators
 *
 * Existing imports from '@/lib/getDashboard' continue to work unchanged.
 */

// Types
export type {
  AgentStat,
  AcctStat,
  RepAgent,
  OutboundAgent,
  MissedData,
  ConvPeriod,
  RawCall,
  PeriodData,
  DashboardData,
  TwilioCall,
  AgentSchedule,
} from './types';

// Auth
export { twilioAuth } from './auth/twilio';
export { getSheets } from './auth/google';

// Data fetchers
export { getConversions } from './data/conversions';
export { getMissedCalls } from './data/missed-calls';
export { getYticaSpeedStats } from './data/ytica';
export { fetchCallsForDate, extractRecentCalls, computeSpeedFromCDR, computeWrapUpFromCDR } from './data/twilio-calls';
export { fetchRecordingSids } from './data/recordings';
export { fetchSchedule, parseTimeRange, getScheduledHoursFromSchedule, getTotalCoverage } from './data/schedule';

// Main orchestrator
export { getDashboardData } from './data/index';
