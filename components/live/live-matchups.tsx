'use client';
// Live Matchups: every game you're in this week, one tab each. G-Train shows the live board (test round for now);
// the cup and opt-in comps show the head to head off your saved team.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HRound } from '@/lib/history';
import type { MiniLink } from '@/lib/minis';
import { HistoryBoard } from './history';
import Link from 'next/link';
import { RULES, autoFill } from '@/lib/matchday';
import type { MatchdayData } from '@/lib/matchday-data';
import type { MRound } from '@/lib/mens-round';
import { MensRound } from './mens';
import { Matchup, shortGame } from './matchday';
import { Shell } from './kit';
import { CupLive } from './cup-live';

export function LiveMatchups({ mens, md, rounds, sel, history, minis = [] }: { mens: MRound; md: MatchdayData; rounds: { value: string; label: string; group: string }[]; sel: string; history: HRound | null; minis?: MiniLink[] }) {
  const router = useRouter();
  const [gid, setGid] = useState(md.games[0]?.id ?? '');
  const game = md.games.find((g) => g.id === gid) ?? md.games[0];
  const look = useMemo(() => { const m = new Map([...Object.values(md.others), ...md.squad, ...md.pool].map((p) => [p.id, p])); return (id: number) => m.get(id); }, [md]);
  const tabsEl = (
        <div className="lm-tabs" role="tablist" aria-label="Your games this week">
        {md.games.map((g) => (
          <button key={g.id} role="tab" aria-selected={g.id === game?.id} className={`lm-tab ${g.id === game?.id ? 'on' : ''} ${g.key}`} onClick={() => setGid(g.id)}>
            <b>{shortGame(g)}</b>
            <span>{md.savedIds.includes(g.id) ? 'Team saved' : 'Team not saved'}</span>
          </button>
        ))}
        {minis.map((m) => (
          <Link key={m.id} href={`/live/g/${m.id}`} className="lm-tab mini"><b>Mini · {m.name}</b><span>{m.sub} · {m.status === 'drafting' ? 'drafting' : 'open game →'}</span></Link>
        ))}
      </div>
  );
  const roundSel = (
    <select className="rh-select lm-round" id="lm-round" aria-label="Round" value={sel} onChange={(e) => router.push(`/live/matchups?r=${e.target.value}`)}>
      {[...new Set(rounds.map((r) => r.group))].map((g) => <optgroup key={g} label={g}>{rounds.filter((r) => r.group === g).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</optgroup>)}
    </select>
  );
  const rightEl = <div className="lm-right">{roundSel}{!history && <Link href="/live" className="lm-set">Set teams in Squad Selector →</Link>}</div>;
  return (
    <Shell compact title={<span className="lm-title">Live Matchups{history ? <span className="lm-done">Completed</span> : tabsEl}</span>}
      sub={history ? <>{history.season} · {history.label} · {md.myName}</> : <>Round {md.round}, {md.season} · {md.myName}</>} right={rightEl}>
      {history ? <HistoryBoard round={history} />
        : !game ? <section className="rh-card"><span className="rh-dim">You’re not in any games this week.</span></section>
        : game.key === 'gtrain' ? <MensRound round={mens} myTeamId={md.myTeamId} compact />
        : game.key === 'cup' ? <CupLive game={game} rules={RULES.cup} mine={md.lineups[game.id] ?? autoFill(RULES.cup, md.squad)} myName={md.myName} look={look} fixtures={md.fixtures} />
        : (
          <div className="lm-proj">
            <Matchup game={game} rules={RULES[game.key]} mine={md.lineups[game.id] ?? autoFill(RULES[game.key], game.key === 'survivor' ? md.pool : md.squad)} myName={md.myName} myTeamId={md.myTeamId} look={look} />
            <span className="rh-dim" style={{ fontSize: 12 }}>Projected from each side’s saved team (or best guess). Live scores fill in here once 2027 games are being played.</span>
          </div>
        )}
    </Shell>
  );
}
