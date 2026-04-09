'use client';

import { useEffect, useState, useCallback } from 'react';
import NavBar from './NavBar';
import Card from './Card';
import KPICard from './KPICard';
import ErrorBoundary from './ErrorBoundary';
import AgentStatCard from './outbound/AgentStatCard';
import ActivityFeed from './outbound/ActivityFeed';
import PipelineView from './outbound/PipelineView';
import { C } from '@/lib/constants';
import { formatDuration } from '@/lib/formatters';
import { Phone, PhoneOff, PhoneIncoming, Clock, RefreshCw } from 'lucide-react';
import type { OutboundDashboardData } from '@/lib/outbound-types';

export default function OutboundPage() {
  const [data, setData] = useState<OutboundDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (forceRefresh = false) => {
    try {
      const url = forceRefresh ? '/api/outbound?refresh=1' : '/api/outbound';
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: OutboundDashboardData = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    // Poll hourly (matches 1hr server cache)
    const interval = setInterval(fetchData, 3_600_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Loading ──────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="min-h-screen" style={{ background: C.bg }}>
        <NavBar />
        <div className="max-w-7xl mx-auto px-4 pt-20">
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="h-24 animate-pulse"><div /></Card>
            ))}
          </div>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-3 space-y-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i} className="h-36 animate-pulse"><div /></Card>
              ))}
            </div>
            <Card className="col-span-6 h-96 animate-pulse"><div /></Card>
            <Card className="col-span-3 h-96 animate-pulse"><div /></Card>
          </div>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="min-h-screen" style={{ background: C.bg }}>
        <NavBar />
        <div className="max-w-7xl mx-auto px-4 pt-20 text-center">
          <p className="text-lg mb-2" style={{ color: C.bad }}>Failed to load outbound data</p>
          <p className="text-sm mb-4" style={{ color: C.sub }}>{error}</p>
          <button
            onClick={() => fetchData(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: C.cyan, color: '#000' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { agents, teamTotals, activityFeed, deals, pipelines, pulledAt } = data;
  // Sort by most calls descending; observer (Jose) always last
  const teamAgents = agents
    .filter(a => a.key !== 'jose')
    .sort((a, b) => b.totalCalls - a.totalCalls);
  const observer = agents.find(a => a.key === 'jose');

  return (
    <div className="min-h-screen" style={{ background: C.bg }}>
      <NavBar pulledAt={pulledAt} />

      <div className="max-w-7xl mx-auto px-4 pt-20 pb-8">
        {/* ── Header with refresh ──────────────────────────────── */}
        <div className="flex items-center justify-end mb-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
            style={{ color: C.sub, border: `1px solid ${C.border}` }}
            title="Force refresh from HubSpot (bypasses 1hr cache)"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* ── KPI Strip ─────────────────────────────────────────── */}
        <ErrorBoundary section="KPI Strip">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KPICard
              label="Calls Today"
              value={teamTotals.totalCalls}
              icon={<Phone size={18} />}
            />
            <KPICard
              label="Connected"
              value={teamTotals.connected}
              icon={<PhoneIncoming size={18} />}
              badge={teamTotals.totalCalls > 0 ? {
                label: `${Math.round((teamTotals.connected / teamTotals.totalCalls) * 100)}%`,
                color: '#4ade80',
              } : undefined}
            />
            <KPICard
              label="No Answer"
              value={teamTotals.noAnswer}
              icon={<PhoneOff size={18} />}
              inverse
            />
            <KPICard
              label="Talk Time"
              value={formatDuration(Math.round(teamTotals.totalDurationMs / 1000))}
              icon={<Clock size={18} />}
            />
          </div>
        </ErrorBoundary>

        {/* ── Main Grid ─────────────────────────────────────────── */}
        <div className="grid grid-cols-12 gap-4">
          {/* Left: Agent Cards */}
          <div className="col-span-12 md:col-span-3 space-y-4">
            <ErrorBoundary section="Agent Cards">
              {teamAgents.map(agent => (
                <AgentStatCard key={agent.key} agent={agent} />
              ))}
              {observer && observer.totalCalls > 0 && (
                <AgentStatCard agent={observer} />
              )}
            </ErrorBoundary>
          </div>

          {/* Center: Activity Feed */}
          <div className="col-span-12 md:col-span-6">
            <ErrorBoundary section="Activity Feed">
              <ActivityFeed items={activityFeed} />
            </ErrorBoundary>
          </div>

          {/* Right: Pipeline */}
          <div className="col-span-12 md:col-span-3">
            <ErrorBoundary section="Pipeline">
              <PipelineView pipelines={pipelines} deals={deals} />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
