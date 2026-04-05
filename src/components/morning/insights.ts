/**
 * "Story of the numbers" — generates contextual insights from DashboardData.
 * Pure functions, no React.
 */
import { capitalize, EXCLUDED_AGENTS } from '@/lib/constants';
import type { DashboardData } from '@/lib/types';

export interface Insight {
  icon: string;
  text: string;
  tone: 'positive' | 'caution' | 'neutral';
}

export function generateInsights(data: DashboardData): Insight[] {
  const insights: Insight[] = [];
  const mtd = data.mtd;
  const yd = data.yesterday;

  // 1. MTD pace
  if (mtd.onTrack) {
    const surplus = mtd.goalPace - mtd.goal;
    insights.push({
      icon: '\uD83D\uDE80',
      text: `On track for ${mtd.goalPace} (${surplus >= 0 ? '+' : ''}${surplus} vs ${mtd.goal} goal)`,
      tone: 'positive',
    });
  } else {
    insights.push({
      icon: '\u26A0\uFE0F',
      text: `Behind pace \u2014 need ${mtd.requiredDailyRate}/day to hit ${mtd.goal}`,
      tone: 'caution',
    });
  }

  // 2. Yesterday's leader
  const convAgents = yd.conversions.byAgent.filter(a => !EXCLUDED_AGENTS.includes(a.agent));
  if (convAgents.length > 0 && convAgents[0].count > 0) {
    insights.push({
      icon: '\uD83D\uDC51',
      text: `${capitalize(convAgents[0].agent)} led yesterday with ${convAgents[0].count} conversions`,
      tone: 'positive',
    });
  }

  // 3. Week-over-week
  if (data.thisWeek > 0 && data.lastWeek > 0) {
    const diff = data.thisWeek - data.lastWeek;
    const pct = Math.round((diff / data.lastWeek) * 100);
    if (Math.abs(pct) >= 5) {
      insights.push({
        icon: pct >= 0 ? '\uD83D\uDCC8' : '\uD83D\uDCC9',
        text: `This week: ${data.thisWeek} vs last week: ${data.lastWeek} (${pct >= 0 ? '+' : ''}${pct}%)`,
        tone: pct >= 0 ? 'positive' : 'caution',
      });
    }
  }

  // 4. Speed alert
  const speedAgents = yd.repActivity.agents.filter(a => !EXCLUDED_AGENTS.includes(a.agent) && a.speedSec != null && a.speedSec > 0);
  if (speedAgents.length > 0) {
    const allUnder10 = speedAgents.every(a => a.speedSec! < 10);
    const avg = speedAgents.reduce((s, a) => s + a.speedSec!, 0) / speedAgents.length;
    if (allUnder10) {
      insights.push({ icon: '\u26A1', text: `All agents under 10s target (avg ${avg.toFixed(1)}s)`, tone: 'positive' });
    } else {
      const slow = speedAgents.filter(a => a.speedSec! >= 14);
      if (slow.length > 0) {
        insights.push({
          icon: '\u23F3',
          text: `${slow.map(a => capitalize(a.agent)).join(', ')} above 14s speed`,
          tone: 'caution',
        });
      }
    }
  }

  // 5. Missed calls
  const missed = yd.missedCalls.total;
  if (missed <= 5) {
    insights.push({ icon: '\u2705', text: `Only ${missed} missed call${missed === 1 ? '' : 's'} yesterday`, tone: 'positive' });
  } else if (missed >= 15) {
    insights.push({ icon: '\uD83D\uDEA8', text: `${missed} missed calls yesterday \u2014 above average`, tone: 'caution' });
  }

  // 6. Champions tease (days 1-3)
  if (data.prevMonthChampions) {
    insights.push({
      icon: '\uD83C\uDFC6',
      text: `${data.prevMonthChampions.month} Champions crowned \u2014 see step 1`,
      tone: 'neutral',
    });
  }

  return insights;
}
