import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// The magic link lands here. Swap the one-time code for a session, then go to the clubhouse.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    const next = searchParams.get('next');
    const safe = next && /^\/[a-z0-9/_-]*$/i.test(next) ? next : '/clubhouse';
    if (!error) return NextResponse.redirect(`${origin}${safe}`);
  }
  return NextResponse.redirect(`${origin}/?error=link`);
}
