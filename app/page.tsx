import Link from 'next/link';
import { Gate, GateLink } from '@/components/landing/Gate';
import { KeeperMark, KeeperWordmark } from '@/components/KeeperMark';
import { CardFan, type FanData, type HeatGame } from '@/components/landing/CardFan';
import { getMe } from '@/lib/data';
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
    'Ethan Drever tipped to go pick 2 in the AFL draft', '18 keepers a club, the 18th must be a rookie', 'Every keeper on a contract under a $1.25M cap', 'Deadline day: the mid-season window opens clauses and free agency',
  ].filter(Boolean) as string[];
})();

// Keeper market ribbon: market value and change this season (illustrative).
const TAPE: [string, string, string][] = [
  ['HALL', '$93k', '+38'], ['GARCIA', '$66k', '+843'], ['SMITH', '$145k', '+6'], ['DAICOS', '$162k', '+11'], ['WILSON', '$49k', '+250'],
  ['ANDERSON', '$97k', '+4'], ['ENGLISH', '$46k', '-8'], ['RANKINE', '$84k', '+9'], ['WHITFIELD', '$65k', '-14'], ['SHEEZEL', '$128k', '+19'],
];

export default async function Landing({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [me, sp] = await Promise.all([getMe(), searchParams]);
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
      <div className="kl-tape" aria-label="Keeper market"><div className="kl-tape-in">{[...TAPE, ...TAPE].map(([n, v, c], i) => (
        <span key={i}><b>{n}</b>{v}<em className={c.startsWith('-') ? 'dn' : 'up'}>{c.startsWith('-') ? '▼' : '▲'} {c.replace(/^[-+]/, '')}%</em></span>
      ))}</div></div>
      <section className="kl-left">
        <div className="kl-mid">
        <h1 className="kl-hl">The home of your<br /><b>AFL keeper league.</b></h1>
        <ul className="kl-sell">
          <li><b>Own the market</b> buy low, sell high</li>
          <li><b>Contracts &amp; signings</b> sign, extend, match</li>
          <li><b>A real salary cap</b> 17 + 1 under it</li>
          <li><b>Deadline day</b> the mid-season window</li>
          <li><b>Trade anything</b> players, picks, <i className="kl-kt">KT</i></li>
        </ul>
        </div>
        <div className="kl-bottom">
        <p className="kl-slogan">Keep your stars. <b>Build your dynasty.</b></p>
        <div className="kl-form">
          {me ? (
            <Link href="/live" className="kl-enter">
              Enter Matchday
              <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10 H15 M11 6 L15 10 L11 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
          ) : <Gate linkError={sp.error === 'link'} />}
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
