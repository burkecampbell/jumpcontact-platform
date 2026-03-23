/**
 * Generate insight callouts for a period's data.
 */
import type { PeriodData } from '@/lib/types';

export interface Callout { emoji: string; message: string }

export function generateCallouts(period: PeriodData): Callout[] {
  const callouts: Callout[] = [];
  const convAgents = period.conversions.byAgent;
  const repAgents = period.repActivity.agents;

  // DAILY_LEADER
  if (convAgents.length > 0 && convAgents[0].count > 0) {
    callouts.push({ emoji: '👑', message: `${convAgents[0].agent} led with ${convAgents[0].count} conversions` });
  }

  // ZERO_CONV — agent with calls but 0 conversions
  for (const rep of repAgents) {
    if (rep.calls < 3) continue;
    const conv = convAgents.find(a => a.agent.toLowerCase() === rep.agent.toLowerCase());
    if (!conv || conv.count === 0) {
      callouts.push({ emoji: '⚠️', message: `${rep.agent} had 0 conversions despite ${rep.calls} calls answered` });
    }
  }

  // EVENING_CARRY — conversions after 5 PM
  const hourly = period.conversions.hourly;
  if (hourly) {
    const eveningTotal = hourly.slice(17).reduce((s, n) => s + n, 0);
    if (eveningTotal >= 3) {
      callouts.push({ emoji: '🌙', message: `${eveningTotal} conversions closed after 5 PM` });
    }
  }

  // ODD_HOUR — before 7 AM or after 9 PM
  if (hourly) {
    const earlyTotal = hourly.slice(0, 7).reduce((s, n) => s + n, 0);
    const lateTotal = hourly.slice(21).reduce((s, n) => s + n, 0);
    const oddTotal = earlyTotal + lateTotal;
    if (oddTotal > 0) {
      callouts.push({ emoji: '🕐', message: `${oddTotal} conversion${oddTotal > 1 ? 's' : ''} logged at unusual hours` });
    }
  }

  return callouts;
}
