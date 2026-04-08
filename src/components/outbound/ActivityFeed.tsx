'use client';

import { Phone, Mail, StickyNote, CheckSquare, Calendar } from 'lucide-react';
import Card from '@/components/Card';
import { C, agentColor, TZ } from '@/lib/constants';
import type { ActivityFeedItem, ActivityType } from '@/lib/outbound-types';

const TYPE_CONFIG: Record<ActivityType, { icon: typeof Phone; borderColor: string; label: string }> = {
  call:    { icon: Phone,       borderColor: C.cyan, label: 'Call' },
  email:   { icon: Mail,        borderColor: C.lime, label: 'Email' },
  note:    { icon: StickyNote,  borderColor: C.warn, label: 'Note' },
  task:    { icon: CheckSquare, borderColor: C.info, label: 'Task' },
  meeting: { icon: Calendar,    borderColor: C.good, label: 'Meeting' },
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: TZ,
  });
}

function fmtCallDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

function CallDetail({ item }: { item: ActivityFeedItem }) {
  const parts: string[] = [];
  if (item.status === 'COMPLETED' && (item.durationMs || 0) > 30_000) {
    parts.push('Connected');
  } else if (item.status === 'NO_ANSWER' || (item.status === 'COMPLETED' && (item.durationMs || 0) <= 30_000)) {
    parts.push('No Answer');
  }
  if (item.durationMs && item.durationMs > 0) {
    parts.push(fmtCallDuration(item.durationMs));
  }
  return parts.length > 0
    ? <span className="text-[10px]" style={{ color: C.sub }}>{parts.join(' · ')}</span>
    : null;
}

export default function ActivityFeed({ items }: { items: ActivityFeedItem[] }) {
  if (items.length === 0) {
    return (
      <Card className="p-5 flex-1">
        <h3 className="text-sm font-semibold mb-3" style={{ color: C.text }}>Activity Feed</h3>
        <p className="text-xs" style={{ color: C.sub }}>No recent activity</p>
      </Card>
    );
  }

  return (
    <Card className="p-0 flex-1 flex flex-col overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold" style={{ color: C.text }}>Activity Feed</h3>
      </div>
      <div className="overflow-y-auto flex-1 px-2 pb-2" style={{ maxHeight: 'calc(100vh - 320px)' }}>
        {items.map(item => {
          const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.call;
          const Icon = config.icon;
          const aColor = agentColor(item.agentKey);

          return (
            <div
              key={`${item.type}-${item.id}`}
              className="flex items-start gap-2 px-2 py-2 rounded-md hover:bg-white/5 transition-colors"
              style={{ borderLeft: `3px solid ${config.borderColor}` }}
            >
              {/* Icon */}
              <div className="mt-0.5 shrink-0">
                <Icon size={13} style={{ color: config.borderColor }} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[11px] shrink-0" style={{ color: C.sub }}>
                    {fmtTime(item.timestamp)}
                  </span>
                  <span className="text-[11px] font-semibold shrink-0" style={{ color: aColor }}>
                    {item.agentName}
                  </span>
                  <span className="text-[11px] truncate" style={{ color: C.text }}>
                    {item.title}
                  </span>
                </div>

                {/* Call-specific detail */}
                {item.type === 'call' && <CallDetail item={item} />}

                {/* Detail text (notes, summaries) */}
                {item.detail && item.type !== 'call' && (
                  <p className="text-[10px] mt-0.5 line-clamp-2" style={{ color: C.sub }}>
                    {item.detail}
                  </p>
                )}

                {/* Task status */}
                {item.type === 'task' && item.status && (
                  <span
                    className="text-[10px] mt-0.5 inline-block"
                    style={{ color: item.status === 'COMPLETED' ? C.good : C.warn }}
                  >
                    {item.status === 'COMPLETED' ? 'Done' : item.status === 'NOT_STARTED' ? 'Open' : item.status}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
