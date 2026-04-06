/**
 * Generate insight callouts for a period's data.
 */
import type { DashboardData, PeriodData } from '@/lib/types';
import { capitalize, speedGrade } from '@/lib/constants';

export interface Callout { emoji: string; message: string }

export function generateCallouts(period: PeriodData, data?: DashboardData): Callout[] {
  const callouts: Callout[] = [];
  const convAgents = period.conversions.byAgent;
  const repAgents = period.repActivity.agents;
  const sorted = [...convAgents].sort((a, b) => b.count - a.count);

  // DAILY_LEADER
  if (sorted.length > 0 && sorted[0].count > 0) {
    callouts.push({ emoji: '👑', message: `${capitalize(sorted[0].agent)} led with ${sorted[0].count} conversions` });
  }

  // RUNNER_UP — close race
  if (sorted.length >= 2 && sorted[0].count > 0 && sorted[1].count > 0) {
    const gap = sorted[0].count - sorted[1].count;
    if (gap <= 2) {
      callouts.push({ emoji: '🔥', message: `${capitalize(sorted[1].agent)} was ${gap === 0 ? 'tied' : `just ${gap} behind`} with ${sorted[1].count}` });
    }
  }

  // HIGH_CONV_RATE — agent with 20%+ conversion rate and meaningful volume
  for (const rep of repAgents) {
    if (rep.calls < 10) continue;
    const conv = convAgents.find(a => a.agent.toLowerCase() === rep.agent.toLowerCase());
    const rate = conv ? Math.round((conv.count / rep.calls) * 100) : 0;
    if (rate >= 20) {
      callouts.push({ emoji: '🎯', message: `${capitalize(rep.agent)} converted at ${rate}% (${conv!.count}/${rep.calls})` });
      break; // only show the top one
    }
  }

  // ZERO_CONV — agent with calls but 0 conversions
  const zeroConv = repAgents.filter(rep => {
    if (rep.calls < 3) return false;
    const conv = convAgents.find(a => a.agent.toLowerCase() === rep.agent.toLowerCase());
    return !conv || conv.count === 0;
  });
  if (zeroConv.length > 0) {
    if (zeroConv.length <= 2) {
      for (const rep of zeroConv) {
        callouts.push({ emoji: '⚠️', message: `${capitalize(rep.agent)} had 0 conversions despite ${rep.calls} calls answered` });
      }
    } else {
      callouts.push({ emoji: '⚠️', message: `${zeroConv.length} agents had 0 conversions despite taking calls` });
    }
  }

  // SPEED_STAR — fastest agent under 6s
  const withSpeed = repAgents.filter(a => a.speedSec != null && a.speedSec > 0).sort((a, b) => a.speedSec! - b.speedSec!);
  if (withSpeed.length > 0 && withSpeed[0].speedSec! < 6) {
    callouts.push({ emoji: '⚡', message: `${capitalize(withSpeed[0].agent)} was fastest at ${withSpeed[0].speedSec!.toFixed(1)}s pickup` });
  }

  // SLOW_SPEED — team average above 12s
  if (period.repActivity.avgSpeedSec != null && period.repActivity.avgSpeedSec > 12) {
    callouts.push({ emoji: '🐢', message: `Team avg speed ${period.repActivity.avgSpeedSec.toFixed(1)}s — target is under 10s` });
  }

  // CALL_VOLUME_LEADER — most calls taken
  const callsSorted = [...repAgents].sort((a, b) => b.calls - a.calls);
  if (callsSorted.length > 0 && callsSorted[0].calls >= 20) {
    callouts.push({ emoji: '📞', message: `${capitalize(callsSorted[0].agent)} handled the most calls (${callsSorted[0].calls})` });
  }

  // TALK_TIME_CHAMP — highest total talk time
  const talkSorted = [...repAgents].sort((a, b) => b.talkMin - a.talkMin);
  if (talkSorted.length > 0 && talkSorted[0].talkMin >= 60) {
    const hrs = Math.floor(talkSorted[0].talkMin / 60);
    const mins = Math.round(talkSorted[0].talkMin % 60);
    callouts.push({ emoji: '🎙️', message: `${capitalize(talkSorted[0].agent)} logged ${hrs}h ${mins}m on the phone` });
  }

  // MISSED_CALLS
  const missed = period.missedCalls.total;
  if (missed === 0) {
    callouts.push({ emoji: '✅', message: 'Zero missed calls — clean sheet' });
  } else if (missed >= 15) {
    callouts.push({ emoji: '🚨', message: `${missed} missed calls — above average` });
  }

  // TOP_MISSED_ACCOUNT — which client got the worst service
  if (period.missedCalls.byAccount.length > 0 && period.missedCalls.byAccount[0].count >= 3) {
    const top = period.missedCalls.byAccount[0];
    callouts.push({ emoji: '📵', message: `${top.account} had ${top.count} missed calls` });
  }

  // EVENING_CARRY — conversions after 5 PM
  const hourly = period.conversions.hourly;
  if (hourly) {
    const eveningTotal = hourly.slice(17).reduce((s, n) => s + n, 0);
    if (eveningTotal >= 3) {
      callouts.push({ emoji: '🌙', message: `${eveningTotal} conversions closed after 5 PM` });
    }
  }

  // PEAK_HOUR
  if (hourly) {
    let peakHour = 0, peakCount = 0;
    for (let i = 0; i < hourly.length; i++) {
      if (hourly[i] > peakCount) { peakCount = hourly[i]; peakHour = i; }
    }
    if (peakCount >= 3) {
      const label = peakHour === 0 ? '12 AM' : peakHour < 12 ? `${peakHour} AM` : peakHour === 12 ? '12 PM' : `${peakHour - 12} PM`;
      callouts.push({ emoji: '📊', message: `Peak hour: ${label} with ${peakCount} conversions` });
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

  // MTD_MILESTONE — round number milestones
  if (data) {
    const mtdTotal = data.mtd.total;
    const milestones = [100, 200, 300, 400, 500, 600, 700, 800, 900];
    for (const m of milestones) {
      if (mtdTotal >= m && mtdTotal < m + 20) {
        callouts.push({ emoji: '🏁', message: `Hit ${m} MTD conversions — ${data.mtd.goal - mtdTotal} to go` });
        break;
      }
    }

    // MTD_PACE
    if (data.mtd.onTrack) {
      callouts.push({ emoji: '🚀', message: `On pace for ${data.mtd.goalPace} this month (goal: ${data.mtd.goal})` });
    } else if (data.mtd.dayOfMonth >= 5) {
      callouts.push({ emoji: '⏳', message: `Need ${data.mtd.requiredDailyRate}/day to hit ${data.mtd.goal} — currently at ${Math.round(data.mtd.total / data.mtd.dayOfMonth)}/day` });
    }

    // TOP_ACCOUNT — biggest client contributor
    const topAcct = period.conversions.byAccount[0];
    if (topAcct && topAcct.count >= 3) {
      callouts.push({ emoji: '🏢', message: `${topAcct.account} was the top account with ${topAcct.count} conversions` });
    }
  }

  return callouts;
}
