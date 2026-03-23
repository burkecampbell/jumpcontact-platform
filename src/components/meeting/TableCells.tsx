'use client';

import { C } from '@/lib/constants';

/** Shared table header cell */
export function TH({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 text-xs font-medium whitespace-nowrap ${right ? 'text-right' : 'text-left'}`} style={{ color: C.sub }}>
      {children}
    </th>
  );
}

/** Shared table data cell */
export function TD({ children, mono, right, color }: { children: React.ReactNode; mono?: boolean; right?: boolean; color?: string }) {
  return (
    <td className={`px-3 py-2.5 text-[13px] ${mono ? 'font-mono' : ''} ${right ? 'text-right' : ''}`} style={{ color: color || C.text }}>
      {children}
    </td>
  );
}
