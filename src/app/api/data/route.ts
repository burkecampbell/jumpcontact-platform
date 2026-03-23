import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const OPS_CENTER = process.env.NEXT_PUBLIC_OPS_CENTER_URL || 'https://your-ops-center.vercel.app';

export async function GET() {
  try {
    const res = await fetch(`${OPS_CENTER}/api/live`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`ops-center returned ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API /data → ops-center]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
