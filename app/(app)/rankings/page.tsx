import Link from 'next/link';
import { ClubDot, Cup, RankBar, Stars } from '@/components/bits';
import { getLeague } from '@/lib/data';
import { futureScore } from '@/lib/projection';
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

  if (future) {
    const rows = teams.sort((a, b) => a.future.rank - b.future.rank);
    return (
      <div className="wrap">
        <div className="row-between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="eyebrow">Best 18 future scores · scoring and potential, weighted for age</span>
            <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>Future build</h1>
          </div>
          {tabs}
        </div>
        <div className="table-box">
          <table className="squad" style={{ minWidth: 900 }}>
            <thead>
              <tr><th style={{ width: 40 }}>#</th><th>Team</th><th style={{ textAlign: 'right', width: 90 }}>Future score</th><th style={{ width: 70, textAlign: 'center' }}>Core age</th><th>Best young assets</th></tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const scored = a.players
                  .map((p) => ({ p, f: futureScore(p, league.ratings.get(p.id)?.potential ?? null), age: age(p.birth_date) }))
                  .sort((x, y) => y.f - x.f);
                const core = scored.slice(0, 18).filter((x) => x.age != null);
                const coreAge = core.length ? core.reduce((s, x) => s + x.age!, 0) / core.length : null;
                return (
                  <tr key={a.team.id}>
                    <td className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{a.future.rank}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link href={`/clubhouse/${a.team.id}`}>{a.team.name}</Link>
                      <div className="muted" style={{ fontSize: 12 }}>{a.team.coach_name}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{a.future.score.toLocaleString()}</td>
                    <td style={{ textAlign: 'center' }}>{coreAge?.toFixed(1) ?? '–'}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
                        {scored.slice(0, 4).map(({ p, age: ag }) => (
                          <Link key={p.id} href={`/players/${p.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none', fontSize: 13 }}>
                            <ClubDot code={p.afl_club} size={14} />
                            <span style={{ fontWeight: 600 }}>{p.name}</span>
                            <span className="muted">{ag ?? '–'} · {p.average?.toFixed(0) ?? '–'}</span>
                            <Stars value={league.ratings.get(p.id)?.potential ?? null} colour={C.green5} label="Potential" />
                          </Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: '75ch' }}>
          Each player’s future score is 70% his projected 2027 average and 30% his potential stars, multiplied by how many prime years he has left.
          A 21-year-old averaging 90 beats a 26-year-old averaging 115. The younger player has five more years at that level.
          Retired, delisted and long-term injured players score zero.
        </p>
      </div>
    );
  }

  const rows = teams.sort((a, b) => a.projection.rank - b.projection.rank);
  return (
    <div className="wrap">
      <div className="row-between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="eyebrow">Projected 2027 starting 18 after keepers and the redraft</span>
          <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>Power rankings</h1>
        </div>
        {tabs}
      </div>
      <div className="table-box">
        <table className="squad" style={{ minWidth: 960 }}>
          <thead>
            <tr><th style={{ width: 40 }}>#</th><th>Team</th><th>2027 outlook</th><th style={{ textAlign: 'right' }}>2027 proj.</th><th style={{ textAlign: 'right' }}>2026 Best 18</th>
              {LINES.map((l) => <th key={l} style={{ width: 110 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ width: 7, height: 7, background: C[l] }} />{l}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.team.id}>
                <td className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{a.projection.rank}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <Link href={`/clubhouse/${a.team.id}`}>{a.team.name}</Link>
                  <span style={{ marginLeft: 6, display: 'inline-flex', gap: 2, verticalAlign: -4 }}>{a.premierships.map((y) => <Cup key={y} size={14} />)}</span>
                  <div className="muted" style={{ fontSize: 12 }}>{a.team.coach_name}</div>
                </td>
                <td>
                  <span className="pill" style={{ background: STATUS_COLOUR[a.status], color: a.status === 'Strong contender' || a.status === 'Top 4 contender' ? '#fff' : C.ink, padding: '3px 10px' }}>{a.status}</span>
                  {a.team.status_override && a.team.status_override !== a.projectedStatus && <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>Commish call · model: {a.projectedStatus}</div>}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{a.projection.score.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }} className="muted">{Math.round(a.best18).toLocaleString()} <span style={{ fontSize: 11 }}>(#{a.rank})</span></td>
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
        The line bars still show 2026 strength.
      </p>
    </div>
  );
}
