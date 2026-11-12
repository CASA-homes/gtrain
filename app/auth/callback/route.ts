import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// The magic link lands here. Swap the one-time code for a session, pick up any league invites, then make sure the
// league cookie points at a league this person is in (via /auth/league), and go to the clubhouse.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (searchParams.get('next') === '/setup') return NextResponse.redirect(`${origin}/setup`);
      const cur = request.headers.get('cookie')?.match(/(?:^|; )khq_league=(\d+)/)?.[1] ?? '';
      return NextResponse.redirect(`${origin}/auth/league?next=/clubhouse${cur ? `&id=${cur}` : ''}`);
    }
  }
  return NextResponse.redirect(`${origin}/?error=link`);
}
