import { NextResponse } from 'next/server';
import { getDashboardData } from '@/lib/getDashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const data = await getDashboardData();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API /data]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
