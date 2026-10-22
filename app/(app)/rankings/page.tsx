import Link from 'next/link';
import { ClubDot, Cup, RankBar, Stars } from '@/components/bits';
import { getLeague } from '@/lib/data';
import { FUTURE_MAX_AGE, futureScore } from '@/lib/projection';
import { age, C, LINES } from '@/lib/ratings';

const STATUS_COLOUR = { 'Strong contender': C.green5, 'Top 4 contender': C.green4, 'Mid-table': C.green2, Rebuilding: C.yellow } as const;

export default async function RankingsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const future = view === 'future';
  const league = await getLeague();
  const teams = [...league.byTeam.values()];

  const tabs = (
    <div role="tablist" aria-label="Ranking view" style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: 'var(--line)', gap: 2 }}>
      {([['Power rankings', '/rankings', !future], ['Future build', '/rankings?view=future', future]] as const).map(([label, href, on]) => (
        <Link key={href} href={href} role="tab" aria-selected={on}
          style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', background: on ? '#fff' : 'transparent', color: on ? C.ink : C.muted, boxShadow: on ? '0 1px 2px rgb(0 0 0 / .08)' : 'none' }}>
          {label}
        </Link>
      ))}
    </div>
  );

  const lineHead = LINES.map((l) => (
    <th key={l} style={{ width: 110 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ width: 7, height: 7, background: C[l] }} />{l}</span></th>
  ));
  const teamCell = (a: (typeof teams)[number]) => (
    <td style={{ whiteSpace: 'nowrap' }}>
      <Link href={`/clubhouse/${a.team.id}`}>{a.team.name}</Link>
      <span style={{ marginLeft: 6, display: 'inline-flex', gap: 2, verticalAlign: -4 }}>{a.premierships.map((y) => <Cup key={y} size={14} />)}</span>
      <div className="muted" style={{ fontSize: 12 }}>{a.team.coach_name}</div>
    </td>
  );

  if (future) {
    const rows = teams.sort((a, b) => a.future.rank - b.future.rank);
    return (
      <div className="wrap">
        <div className="row-between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="eyebrow">Each team’s best six players aged 24 or under</span>
            <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>Future build</h1>
          </div>
          {tabs}
        </div>
        <div className="table-box">
          <table className="squad" style={{ minWidth: 960 }}>
            <thead>
              <tr><th style={{ width: 40 }}>#</th><th>Team</th><th>Best young assets</th><th style={{ textAlign: 'right', width: 80 }}>Avg age</th><th style={{ width: 120 }}>Avg potential</th>{lineHead}</tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const top = a.players.filter((p) => (age(p.birth_date) ?? 99) <= FUTURE_MAX_AGE)
                  .map((p) => ({ p, f: futureScore(p, league.ratings.get(p.id)?.potential ?? null, league.ratings.get(p.id)?.lineBonus ?? 0, league.ratings.get(p.id)?.lineEdge ?? 0) }))
                  .sort((x, y) => y.f - x.f).slice(0, 3);
                return (
                  <tr key={a.team.id}>
                    <td className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{a.future.rank}</td>
                    {teamCell(a)}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {top.map(({ p }) => (
                          <Link key={p.id} href={`/players/${p.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none', fontSize: 12, whiteSpace: 'nowrap' }}>
                            <ClubDot code={p.afl_club} size={12} /><span style={{ fontWeight: 600 }}>{p.name}</span>
                            <span className="muted">{age(p.birth_date) ?? '–'}y · {p.average?.toFixed(0) ?? '–'}</span>
                          </Link>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{a.future.avgAge?.toFixed(1) ?? '–'}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Stars value={a.future.avgPotential != null ? Math.round(a.future.avgPotential * 2) / 2 : null} colour={C.green5} label="Average potential" />
                        <span className="mono muted" style={{ fontSize: 10 }}>{a.future.avgPotential?.toFixed(2) ?? '–'} / 5</span>
                      </div>
                    </td>
                    {LINES.map((l) => (
                      <td key={l}>
                        <RankBar rank={a.future.lines[l]} height={8} label={`${l} future strength`} />
                        <span className="mono muted" style={{ fontSize: 10 }}>{a.future.lines[l]} of 10</span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: '75ch' }}>
          Only players aged 24 or under count, and each team is ranked on its best six of them, so quality beats quantity. A player’s future score is his projected peak (2027 projection plus some growth, scaled by potential) times how many prime years he has left, so youngsters already scoring rate ahead of raw ones.
          Avg age and avg potential are across that best six. The line bars rank each line’s future strength against the league, with the ruck at half weight.
        </p>
      </div>
    );
  }

  // Ordered by where each team finished in 2026: premiers, runners-up, then the ladder.
  const season = league.seasons.find((x) => x.year === 2026);
  const ladderRank = (id: number) => league.ladder.find((l) => l.season === 2026 && l.team_id === id)?.rank ?? 99;
  const finishOrder = (id: number) => (id === season?.premier_id ? 0 : id === season?.runner_up_id ? 1 : 1 + ladderRank(id));
  const rows = teams.sort((a, b) => finishOrder(a.team.id) - finishOrder(b.team.id));
  const ord = (n: number) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
  const finishLabel = (id: number) => (id === season?.premier_id ? 'Premiers' : id === season?.runner_up_id ? 'Runners-up' : `${ord(ladderRank(id))} on ladder`);
  return (
    <div className="wrap">
      <div className="row-between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="eyebrow">In 2026 finishing order, with each team’s 2027 outlook</span>
          <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>Power rankings</h1>
        </div>
        {tabs}
      </div>
      <div className="table-box">
        <table className="squad" style={{ minWidth: 980 }}>
          <thead>
            <tr><th style={{ width: 40 }}>#</th><th>Team</th><th>2026 finish</th><th>2027 outlook</th><th style={{ textAlign: 'right' }}>2027 proj.</th><th style={{ textAlign: 'right' }}>2026 Best 18</th>{lineHead}</tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={a.team.id}>
                <td className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{i + 1}</td>
                {teamCell(a)}
                <td style={{ whiteSpace: 'nowrap' }}>{finishLabel(a.team.id)}</td>
                <td>
                  <span className="pill" style={{ background: STATUS_COLOUR[a.status], color: a.status === 'Strong contender' || a.status === 'Top 4 contender' ? '#fff' : C.ink, padding: '3px 10px' }}>{a.status}</span>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{a.projection.score.toLocaleString()} <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>#{a.projection.rank}</span></td>
                <td style={{ textAlign: 'right' }} className="muted">{Math.round(a.best18).toLocaleString()} <span style={{ fontSize: 11 }}>#{a.rank}</span></td>
                {LINES.map((l) => (
                  <td key={l}>
                    <RankBar rank={a.lineStrength[l].rank} height={8} label={`${l} strength`} />
                    <span className="mono muted" style={{ fontSize: 10 }}>{a.lineStrength[l].rank} of 10</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: '75ch' }}>
        The 2027 projection ages every player a year, adds known trades and role changes, and zeroes anyone retired, delisted or out injured.
        Each team then keeps 17 plus a rookie (real keepers where they’ve been set), and the 2027 draft is simulated in the actual pick order.
        The ruck counts at half weight. The line bars show 2026 strength.
      </p>
    </div>
  );
}
