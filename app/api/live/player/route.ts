import { NextResponse } from 'next/server';
import { aflwProfile } from '@/lib/aflw';
import { getMe } from '@/lib/data';

// AFLW player profile for the pop-up in the live game. Members only.
export async function GET(req: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'No player' }, { status: 400 });
  try {
    const p = await aflwProfile(id);
    return p ? NextResponse.json(p, { headers: { 'Cache-Control': 'private, max-age=60' } }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
