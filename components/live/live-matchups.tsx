'use client';
// Live Matchups: every game you're in this week, one tab each. G-Train shows the live board (test round for now);
// the cup and opt-in comps show the head to head off your saved team.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HRound } from '@/lib/history';
import type { MiniLink } from '@/lib/minis';
import { HistoryBoard } from './history';
import Link from 'next/link';
import { RULES, autoFill, rulesFor } from '@/lib/matchday';
import type { MatchdayData } from '@/lib/matchday-data';
import type { MRound } from '@/lib/mens-round';
import { MensRound } from './mens';
import { Matchup, shortGame } from './matchday';
import { Shell } from './kit';
import { CupLive } from './cup-live';

export function LiveMatchups({ mens, md, rounds, sel, history, minis = [] }: { mens: MRound; md: MatchdayData; rounds: { value: string; label: string; group: string }[]; sel: string; history: HRound | null; minis?: MiniLink[] }) {
  const router = useRouter();
  const [gid, setGid] = useState(md.games[0]?.id ?? '');
  const [pair, setPair] = useState(-1); // G-Train: -1 = your game, otherwise another game this round
  const game = md.games.find((g) => g.id === gid) ?? md.games[0];
  const look = useMemo(() => { const m = new Map([...Object.values(md.others), ...md.squad, ...md.pool].map((p) => [p.id, p])); return (id: number) => m.get(id); }, [md]);
  const tabsEl = (
        <div className="lm-tabs" role="tablist" aria-label="Your games this week">
        {md.games.map((g) => (
          <button key={g.id} role="tab" aria-selected={g.id === game?.id} className={`lm-tab ${g.id === game?.id ? 'on' : ''} ${g.key}`} onClick={() => setGid(g.id)}>
            <b className="lm-tl">{shortGame(g)}</b>
            <b className="lm-ts">{g.key === 'gtrain' ? 'G-Train' : g.key === 'cup' ? 'Cup' : shortGame(g).split(' · ')[0].replace(/ R\d+$/, '')}<i className={md.savedIds.includes(g.id) ? 'ok' : ''} title={md.savedIds.includes(g.id) ? 'Team saved' : 'Team not saved'} /></b>
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
    <Shell compact title={<span className="lm-title"><span className="lm-tt">Live Matchups</span>{history ? <span className="lm-done">Completed</span> : tabsEl}</span>}
      sub={<span className="lm-sub">{history ? <>{history.season} · {history.label} · {md.myName}</> : <>Round {md.round}, {md.season} · {md.myName}</>}</span>} right={rightEl}>
      {history ? <HistoryBoard round={history} />
        : !game ? <section className="rh-card"><span className="rh-dim">You’re not in any games this week.</span></section>
        : game.key === 'gtrain' && game.opp ? (() => {
          const p = pair >= 0 ? game.pairs?.[pair] : undefined;
          const rules = rulesFor('gtrain', md.lineupShape);
          return (
            <div className="lm-gt">
              {!!game.pairs?.length && (
                <div className="mx-matchups lm-fx" role="tablist" aria-label="G-Train games this round">
                  <button type="button" role="tab" aria-selected={!p} className={`mx-mu mx-mu-link ${!p ? 'on' : ''}`} onClick={() => setPair(-1)}>
                    <span className="mx-mu-t"><span className="rh-ellip">{md.myName}</span></span>
                    <span className="mx-mu-t"><span className="rh-ellip">{game.opp.name}</span></span>
                    <span className="mx-mu-p rh-mono"><span>Yours</span><span>R{md.round}</span></span>
                  </button>
                  {game.pairs.map(([a, b], i) => (
                    <button key={a.teamId} type="button" role="tab" aria-selected={pair === i} className={`mx-mu mx-mu-link ${pair === i ? 'on' : ''}`} onClick={() => setPair(i)}>
                      <span className="mx-mu-t"><span className="rh-ellip">{a.name}</span></span>
                      <span className="mx-mu-t"><span className="rh-ellip">{b.name}</span></span>
                      <span className="mx-mu-p rh-mono"><span>{a.saved && b.saved ? 'Both set' : a.saved || b.saved ? 'One set' : 'Not set'}</span><span>R{md.round}</span></span>
                    </button>
                  ))}
                </div>
              )}
              {p ? <CupLive key={`p${pair}`} game={{ ...game, opp: p[1] }} rules={rules} mine={p[0].lineup} myName={p[0].name} look={look} fixtures={md.fixtures} theme="green" />
                : <CupLive key="mine" game={game} rules={rules} mine={md.lineups[game.id] ?? autoFill(rules, md.squad)} myName={md.myName} look={look} fixtures={md.fixtures} theme="green" />}
            </div>
          );
        })()
        : game.key === 'gtrain' ? <MensRound round={mens} myTeamId={md.myTeamId} compact />
        : game.key === 'cup' ? <CupLive game={game} rules={RULES.cup} mine={md.lineups[game.id] ?? autoFill(RULES.cup, md.squad)} myName={md.myName} look={look} fixtures={md.fixtures} />
        : (
          <div className="lm-proj">
            <Matchup game={game} rules={rulesFor(game.key, md.lineupShape)} mine={md.lineups[game.id] ?? autoFill(rulesFor(game.key, md.lineupShape), game.key === 'survivor' ? md.pool : md.squad)} myName={md.myName} myTeamId={md.myTeamId} look={look} />
            <span className="rh-dim" style={{ fontSize: 12 }}>Projected from each side’s saved team (or best guess). Live scores fill in here once 2027 games are being played.</span>
          </div>
        )}
    </Shell>
  );
}
