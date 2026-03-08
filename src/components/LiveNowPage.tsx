'use client';

import { useEffect, useState, useCallback } from 'react';
import NavBar from './NavBar';
import Card from './Card';
import { C, capitalize, fmtSpeed, speedGrade } from '@/lib/constants';
import type { DashboardData, RawCall } from '@/lib/getDashboard';
import { Phone, PhoneMissed, TrendingUp, Zap, Users, ArrowDown, ArrowUp } from 'lucide-react';

function formatPhone(num: string): string {
  if (!num) return '—';
  const digits = num.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  return num;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Edmonton',
    });
  } catch { return '—'; }
}

interface KPIProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  delta?: number | null;
  suffix?: string;
  badge?: { label: string; color: string };
}

function KPICard({ label, value, icon, delta, suffix, badge }: KPIProps) {
  return (
    <Card className="flex-1 min-w-[160px]">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: C.sub }}>{label}</span>
        <span style={{ color: C.cyan }}>{icon}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold count-up" style={{ color: C.text }}>
          {value}{suffix || ''}
        </span>
        {badge && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded mb-0.5"
                style={{ background: badge.color + '22', color: badge.color }}>
            {badge.label}
          </span>
        )}
      </div>
      {delta !== undefined && delta !== null && (
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs" style={{ color: delta >= 0 ? '#4ade80' : '#f87171' }}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} vs yesterday
          </span>
        </div>
      )}
    </Card>
  );
}

export default function LiveNowPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/data');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <>
        <NavBar />
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
          <div className="skeleton h-96 rounded-2xl" />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <NavBar />
        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          <p style={{ color: '#f87171' }}>Failed to load: {error}</p>
          <button onClick={fetchData} className="mt-4 px-4 py-2 rounded-lg text-sm" style={{ background: C.cyan, color: '#000' }}>
            Retry
          </button>
        </div>
      </>
    );
  }

  const todayConv     = data.today.conversions.total;
  const yesterdayConv = data.yesterday.conversions.total;
  const todayCalls    = data.today.repActivity.agents.reduce((s, a) => s + a.calls, 0);
  const yesterdayCalls= data.yesterday.repActivity.agents.reduce((s, a) => s + a.calls, 0);
  const todayMissed   = data.today.missedCalls.jcTotal;
  const yesterdayMissed= data.yesterday.missedCalls.jcTotal;
  const avgSpeed      = data.today.repActivity.avgSpeedSec;
  const grade         = speedGrade(avgSpeed);
  const activeAgents  = data.today.repActivity.agents.length;

  return (
    <>
      <NavBar pulledAt={data.pulledAt} />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <KPICard
            label="Conversions"
            value={todayConv}
            icon={<TrendingUp size={18} />}
            delta={todayConv - yesterdayConv}
          />
          <KPICard
            label="Calls Answered"
            value={todayCalls}
            icon={<Phone size={18} />}
            delta={todayCalls - yesterdayCalls}
          />
          <KPICard
            label="Missed Calls"
            value={todayMissed}
            icon={<PhoneMissed size={18} />}
            delta={todayMissed - yesterdayMissed}
          />
          <KPICard
            label="Avg Speed"
            value={fmtSpeed(avgSpeed)}
            icon={<Zap size={18} />}
            badge={avgSpeed !== null ? { label: grade.grade, color: grade.color } : undefined}
          />
          <KPICard
            label="Active Agents"
            value={`${activeAgents}/5`}
            icon={<Users size={18} />}
          />
        </div>

        {/* Recent Calls Table */}
        <Card padding={false}>
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: C.text }}>Last 20 Calls</h2>
            <span className="text-xs" style={{ color: C.sub }}>Auto-refreshes every 60s</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Time', 'Agent', 'Phone', 'Duration', ''].map(h => (
                    <th key={h} className="px-5 py-2 text-left text-xs font-medium" style={{ color: C.sub }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.recentCalls || []).map((call: RawCall, i: number) => (
                  <tr key={i} className="table-row-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.sub }}>
                      {formatTime(call.time)}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="font-medium" style={{ color: C.text }}>{capitalize(call.agent)}</span>
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.sub }}>
                      {formatPhone(call.phone)}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs" style={{ color: C.text }}>
                      {formatDuration(call.duration)}
                    </td>
                    <td className="px-5 py-2.5">
                      {call.direction === 'inbound' ? (
                        <ArrowDown size={14} style={{ color: '#4ade80' }} />
                      ) : (
                        <ArrowUp size={14} style={{ color: '#38bdf8' }} />
                      )}
                    </td>
                  </tr>
                ))}
                {(!data.recentCalls || data.recentCalls.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm" style={{ color: C.sub }}>
                      No calls yet today
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
