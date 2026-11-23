import { NextResponse } from 'next/server';
import { LEAGUE_COOKIE } from '@/lib/league';
import { createClient } from '@/lib/supabase/server';

// Open one of your leagues: sets the league cookie (only for a league you're in), then goes to the clubhouse
// (or to ?next=, a path on this site).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const want = Number(searchParams.get('l'));
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_leagues');
  const mine = (data ?? []) as { id: number }[];
  const id = mine.some((l) => l.id === want) ? want : mine[0]?.id;
  if (!id) return NextResponse.redirect(`${origin}/`);
  const next = searchParams.get('next') ?? '';
  const path = /^\/[A-Za-z0-9/_-]*$/.test(next) && !next.startsWith('//') ? next : '/clubhouse';
  const res = NextResponse.redirect(`${origin}${path}`);
  res.cookies.set(LEAGUE_COOKIE, String(id), { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return res;
}
