/**
 * getDashboard.ts — Barrel re-export for types and utilities.
 *
 * VOLTRON MIGRATION: All credential-dependent data fetchers (Twilio, Google Sheets)
 * have been removed. Data now flows through ops-center API:
 *   /api/data  → ops-center /api/live
 *   /api/calls → ops-center /api/calls
 *
 * This file re-exports types so existing component imports continue to work.
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
