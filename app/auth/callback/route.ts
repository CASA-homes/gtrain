import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// The magic link lands here. Swap the one-time code for a session, then go to the clubhouse.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/clubhouse`);
  }
  return NextResponse.redirect(`${origin}/?error=link`);
}
