'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { AlertTriangle, XCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { C } from '@/lib/constants';

const ADMIN_EMAIL = 'admin@example.com';
const POLL_INTERVAL = 60_000; // 60s

interface HealthData {
  ok: boolean;
  mstHour: number;
  checks: Record<string, string>;
  alerts: { title: string; message: string; severity: 'warning' | 'critical' }[];
}

export default function HealthBanner() {
  const { user, isLoaded } = useUser();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const isAdmin = isLoaded && user?.primaryEmailAddress?.emailAddress === ADMIN_EMAIL;

  useEffect(() => {
    if (!isAdmin) return;

    let active = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok && active) setHealth(await res.json());
      } catch { /* silent */ }
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => { active = false; clearInterval(id); };
  }, [isAdmin]);

  // Don't render for non-admins, when loading, when healthy, or when dismissed
  if (!isAdmin || !health || health.ok || dismissed) return null;

  const hasCritical = health.alerts.some(a => a.severity === 'critical');
  const bgColor = hasCritical ? 'rgba(230,56,136,0.12)' : 'rgba(251,191,36,0.12)';
  const borderColor = hasCritical ? 'rgba(230,56,136,0.4)' : 'rgba(251,191,36,0.4)';
  const accentColor = hasCritical ? '#E63888' : '#fbbf24';
  const Icon = hasCritical ? XCircle : AlertTriangle;

  return (
    <div
      style={{
        background: bgColor,
        borderBottom: `1px solid ${borderColor}`,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
      className="px-4 py-2"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm font-medium min-w-0"
          style={{ color: accentColor }}
        >
          <Icon size={16} />
          <span>
            {health.alerts.length} health {health.alerts.length === 1 ? 'issue' : 'issues'}
          </span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        <div className="flex items-center gap-3 text-xs shrink-0" style={{ color: '#8B92A8' }}>
          <span>Admin only</span>
          <button
            onClick={() => setDismissed(true)}
            className="hover:opacity-80"
            style={{ color: '#8B92A8' }}
          >
            Dismiss
          </button>
        </div>
      </div>

      {expanded && (
        <div className="max-w-7xl mx-auto mt-2 pb-1 space-y-1">
          {health.alerts.map((alert, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs rounded px-2 py-1.5"
              style={{
                background: C.overlay,
                color: C.text,
              }}
            >
              <span style={{ color: alert.severity === 'critical' ? '#E63888' : '#fbbf24' }}>
                {alert.severity === 'critical' ? '!!' : '!'}
              </span>
              <div>
                <span className="font-medium">{alert.title}</span>
                <span style={{ color: '#8B92A8' }}> — {alert.message}</span>
              </div>
            </div>
          ))}

          {/* Check details */}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs pt-1" style={{ color: '#8B92A8' }}>
            {Object.entries(health.checks).map(([key, val]) => (
              <span key={key}>
                <span className="font-mono">{key}</span>:{' '}
                <span style={{ color: val.startsWith('OK') ? '#4ade80' : val.startsWith('SKIP') ? '#8B92A8' : '#fbbf24' }}>
                  {val}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
