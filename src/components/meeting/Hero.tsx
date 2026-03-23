'use client';

import { C } from '@/lib/constants';
import { useCountUp } from './useCountUp';

/** Hero number with count-up animation */
export default function Hero({ value, sub, color }: { value: number; sub?: string; color?: string }) {
  const displayed = useCountUp(value);
  return (
    <div className="text-center py-7 pb-5">
      <div
        className="font-mono font-extralight text-[88px] leading-none tracking-[-4px]"
        style={{ color: color || C.cyan, textShadow: '0 0 40px rgba(62,165,195,0.35)' }}
      >
        {displayed}
      </div>
      {sub && <div className="mt-2 text-[13px] font-medium" style={{ color: C.sub }}>{sub}</div>}
    </div>
  );
}
