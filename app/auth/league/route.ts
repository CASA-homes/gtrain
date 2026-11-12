import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { LEAGUE_COOKIE } from '@/lib/league';

// Switch league: /auth/league?id=2&next=/league. Only to a league you belong to; with no id, your first league.
// Used by the header switcher, and by the app layout when your current league isn't one of yours.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextRaw = url.searchParams.get('next') ?? '/clubhouse';
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/clubhouse';
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return NextResponse.redirect(new URL('/', url.origin));
  await supabase.rpc('claim_invites');
  const { data } = await supabase.rpc('my_leagues');
  const mine = (data ?? []) as { id: number }[];
  if (!mine.length) return NextResponse.redirect(new URL('/?error=noleague', url.origin));
  const want = Number(url.searchParams.get('id'));
  const id = mine.some((l) => l.id === want) ? want : mine[0].id;
  // Sent here by the app because your current league wasn't one of yours, but it already is: stop, don't loop.
  const cur = request.headers.get('cookie')?.match(/(?:^|; )khq_league=(\d+)/)?.[1];
  if (url.searchParams.get('from') === 'layout' && String(id) === (cur ?? '1')) return NextResponse.redirect(new URL('/?error=member', url.origin));
  const res = NextResponse.redirect(new URL(next, url.origin));
  res.cookies.set(LEAGUE_COOKIE, String(id), { path: '/', sameSite: 'lax', secure: true, httpOnly: false, maxAge: 60 * 60 * 24 * 365 });
  return res;
}
