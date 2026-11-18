import Link from 'next/link';
import { KeeperMark, KeeperWordmark } from '@/components/KeeperMark';
import { JoinFlow } from '@/components/JoinFlow';
import { createClient } from '@/lib/supabase/server';
import '@/components/landing/landing.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Join a league · Keeper HQ' };

type Lookup = { league_id: number; name: string; clubs: { id: number; name: string; short_code: string; coach: string | null; open: boolean }[] } | null;

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const [{ data: lk }, { data: claims }] = await Promise.all([supabase.rpc('join_lookup', { p_code: code }), supabase.auth.getClaims()]);
  const league = lk as Lookup;
  const signedIn = !!claims?.claims?.sub;
  let status: 'member' | 'pending' | null = null;
  if (signedIn && league) {
    // members is readable league-wide, so filtering by league alone returned every coach and maybeSingle() errored
    const { data: mine } = await supabase.rpc('my_leagues');
    if (((mine ?? []) as { id: number }[]).some((l) => l.id === league.league_id)) status = 'member';
    else {
      const { data: req } = await supabase.from('join_requests').select('status').eq('league_id', league.league_id).eq('user_id', claims!.claims.sub).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (req?.status === 'pending') status = 'pending';
      if (req?.status === 'approved') status = 'member';
    }
  }
  return (
    <main className="kl jn-page">
      <header className="kl-ribbon">
        <Link href="/" className="kl-lock"><KeeperMark size={36} /><KeeperWordmark /></Link>
      </header>
      <section className="jn-body">
        {league
          ? <JoinFlow code={code.toUpperCase()} league={league.name} clubs={league.clubs} signedIn={signedIn} status={status} />
          : <div className="lg"><h1 style={{ margin: 0 }}>That invite code doesn’t work</h1><p className="lg-note">Check the link with your commish. Codes can be reset, so ask for a fresh one.</p><Link href="/" className="lg-alt">Go to Keeper HQ</Link></div>}
      </section>
    </main>
  );
}
