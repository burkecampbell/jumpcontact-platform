import { C } from '@/lib/constants';

export default function RingChart({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(value / Math.max(max, 1), 1);
  const r = 72, stroke = 10;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const over = value >= max;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 180 180" className="w-44 h-44">
        <circle cx="90" cy="90" r={r} fill="none" stroke="rgba(139,146,168,0.12)" strokeWidth={stroke} />
        <circle
          cx="90" cy="90" r={r} fill="none"
          stroke={over ? C.lime : C.cyan}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 90 90)"
          className="transition-all duration-1000 ease-out"
        />
        <text x="90" y="82" textAnchor="middle" fill={C.text} fontSize="32" fontWeight="700">
          {value.toLocaleString()}
        </text>
        <text x="90" y="104" textAnchor="middle" fill={C.sub} fontSize="13">
          / {max.toLocaleString()} goal
        </text>
      </svg>
      <span className="text-xs font-medium mt-1" style={{ color: C.sub }}>{label}</span>
    </div>
  );
}
