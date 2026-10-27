import { NextResponse } from 'next/server';
import { liveRound } from '@/lib/aflw';
import { getMe } from '@/lib/data';

// Polled by the live page every ~25s during games. Members only (the middleware already requires a sign-in).
export async function GET(req: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  const r = Number(new URL(req.url).searchParams.get('round')) || undefined;
  try {
    return NextResponse.json(await liveRound(r), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
