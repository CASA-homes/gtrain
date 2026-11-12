import Link from 'next/link';
import { Gate, GateLink } from '@/components/landing/Gate';
import { KeeperMark, KeeperWordmark } from '@/components/KeeperMark';
import { CardFan, type FanData, type HeatGame } from '@/components/landing/CardFan';
import { getMe } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { AFL_LANDING_2026 } from '@/lib/afl-landing-2026';
import LEAGUE from '@/data/league.json';
import GAMES from '@/lib/player-games.json';
import CRYSTAL from '@/lib/crystal-ball.json';
import PROFILES from '@/lib/draft-profiles-2026.json';
import '@/components/landing/landing.css';

export const dynamic = 'force-dynamic';

const ANDERSON = 'CD_I1009199';

function fanData(): FanData {
  const g = (GAMES as unknown as { players: Record<string, { g: (string | number | null)[][] }> }).players[ANDERSON]?.g ?? [];
  const games: HeatGame[] = g.map((x) => ({ round: Number(x[0]), opp: String(x[1] ?? ''), score: Number(x[3]), tog: x[4] == null ? null : Number(x[4]), heat: (x[14] as string | null) ?? null }));
  const reg = games.filter((x) => x.round <= 24);
  const pros = (CRYSTAL as unknown as { prospects: { name: string; boards: Record<string, number>; height: number; traits: string[]; flags: string[]; chance: number }[] }).prospects.find((p) => p.name === 'Ethan Drever');
  const prof = (PROFILES as unknown as { name: string; games?: { max: number; seasons: { label: string; avg: number }[] } }[]).find((p) => p.name === 'Ethan Drever');
  const land = AFL_LANDING_2026['Ethan Drever'];
  return {
    anderson: { avg: reg.length ? reg.reduce((a, x) => a + x.score, 0) / reg.length : 0, playerNo: ANDERSON.replace('CD_I', ''), games },
    honours: LEAGUE.honour_roll.map((h) => ({ year: h.year, premier: h.premier, spoon: h.spoon ?? null, medal: h.medal ?? null })),
    drever: {
      height: pros?.height ?? 188, avg: prof?.games?.seasons[0]?.avg ?? 108.6, best: prof?.games?.max ?? 148,
      boards: [['Twomey', pros?.boards.tw ?? 4], ['Rookie Me', pros?.boards.rm ?? 7], ['Zero Hanger', pros?.boards.zh ?? 3]],
      traits: ['Contested / inside', 'Athleticism', 'Speed'], flag: 'Kicking', chance: pros?.chance ?? 62,
      landing: land ? `proj. pick ${land.pick}${land.club ? `, ${land.club}` : ''}` : 'top-5 prospect',
    },
  };
}

const WIRE = (() => {
  const [last] = LEAGUE.honour_roll;
  return [
    `${last.year} premiers: ${last.premier}`, `${last.year} runners-up: ${last.runner_up}`, last.medal ? `${last.year} league medal: ${last.medal}` : null,
    `Wooden spoon ${last.year}: ${last.spoon}`, 'Knockout Cup winners take a round 2 pick into next year’s draft', 'Future picks tradeable through 2028',
    'Ethan Drever tipped to go pick 2 in the AFL draft', '18 keepers a club, the 18th must be a rookie',
  ].filter(Boolean) as string[];
})();

export default async function Landing({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [me, sp] = await Promise.all([getMe(), searchParams]);
  // Signed in but in no league yet (just signed up): Start your league goes straight to setup.
  const signedIn = !me && !!(await (await createClient()).auth.getClaims()).data?.claims?.sub;
  return (
    <main className="kl">
      <header className="kl-ribbon">
        <div className="kl-lock"><KeeperMark size={36} /><KeeperWordmark /></div>
        <span className="kl-eyebrow">The all-in-one AFL keeper league platform</span>
        <nav className="kl-nav">
          {me ? <Link href="/live" className="kl-btn sm">Enter Matchday</Link> : (
            <><GateLink to="login" className="kl-link strong">Log in</GateLink><GateLink to="start" className="kl-btn sm">Start a league</GateLink></>
          )}
        </nav>
      </header>
      <section className="kl-left">
        <div className="kl-mid">
        <h1 className="kl-hl">The home of your<br /><b>AFL keeper league.</b></h1>
        <ul className="kl-sell">
          <li><b>Custom everything</b> your rules, lists, scoring and comps</li>
          <li><b>Pick trading</b> future and mid-season picks</li>
          <li><b>Cup competitions</b> with draft-pick prizes</li>
          <li><b>Deep rookie research</b> boards, junior data, star chance</li>
          <li><b>History and records</b> every flag, spoon and medal</li>
        </ul>
        </div>
        <div className="kl-bottom">
        <p className="kl-slogan">Keep your stars. <b>Build your dynasty.</b></p>
        <div className="kl-form">
          {me ? (
            <>
            <Link href="/live" className="kl-enter">
              Enter Matchday
              <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10 H15 M11 6 L15 10 L11 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
            <p className="kl-note"><Link href="/setup" className="kl-link">Start another league</Link></p>
            </>
          ) : <Gate linkError={sp.error === 'link'} signedIn={signedIn} />}
        </div>
        </div>
      </section>
      <section className="kl-right">
        <CardFan data={fanData()} />
      </section>
      <div className="kl-wire" aria-hidden="true"><b>League wire</b><div className="kl-tk">{[...WIRE, ...WIRE].map((n, i) => <span key={i}>{n}</span>)}</div></div>
    </main>
  );
}
