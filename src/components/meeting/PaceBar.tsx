'use client';

import { useEffect, useState } from 'react';
import { C } from '@/lib/constants';

/** MTD pace progress bar with animated fill */
export default function PaceBar({ pct, color }: { pct: number; color: string }) {
  const [w, setW] = useState(0);
  useEffect(() => { setW(0); const t = setTimeout(() => setW(pct), 100); return () => clearTimeout(t); }, [pct]);
  return (
    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: C.border }}>
      <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}
