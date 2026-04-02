import { C, fmtSpeed, speedGrade } from '@/lib/constants';

export default function SpeedBadge({ sec }: { sec: number | null }) {
  if (sec == null || sec <= 0) return <span style={{ color: C.sub }}>—</span>;
  const { letter, color } = speedGrade(sec);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[13px]">
      <span style={{ color }}>{fmtSpeed(sec)}</span>
      <span className="text-[10px] font-bold px-1 rounded" style={{ background: color + '22', color }}>
        {letter}
      </span>
    </span>
  );
}
