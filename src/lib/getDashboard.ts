/**
 * getDashboard.ts — Barrel re-export for types.
 *
 * UNIFIED CONTRACT: All types match ops-center /api/live exactly.
 * No transforms, no adapters. Direct consumption.
 */

export type {
  AgentStat,
  AcctStat,
  RepAgent,
  OutboundAgent,
  MissedPeriod,
  ConvPeriod,
  RawCall,
  PeriodData,
  DashboardData,
  MtdData,
  RepActivity,
  ScheduleData,
} from './types';
