import Link from 'next/link';
import { leagueHistory, sameTeam, type Game } from '@/lib/league-history';
import type { Team } from '@/lib/data';

const short = (n: string) => n.replace(/ Fantasy Team$/, '').replace(/ my Neezel$/, '').replace(/’s Murabito’s|'s Murabito's/, '’s');
const roundLabel = (r: string) => (r.startsWith('F') ? `Final ${r.slice(1)}` : `Round ${r}`);

export function LeagueHistory({ teams, myTeamName }: { teams: Team[]; myTeamName: string | null }) {
  const { h2h, records, rivals, careers, order, gf } = leagueHistory();
  const link = (name: string, label = name) => {
    const t = teams.find((x) => sameTeam(x.name, name));
    return t ? <Link href={`/clubhouse/${t.id}`} style={{ color: 'inherit' }}>{label}</Link> : <>{label}</>;
  };
  const mine = (n: string) => !!myTeamName && sameTeam(n, myTeamName);
  const rec = (key: string, title: string, g: Game | undefined, note: (g: Game) => string) => g && (
    <div key={key} className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ font: '600 11px var(--font)', textTransform: 'uppercase', letterSpacing: '.06em' }} className="muted">{title}</span>
      <span style={{ font: '700 20px var(--mono)' }}>{note(g)}</span>
      <span style={{ fontSize: 13 }}>{link(g.team)} <span className="muted">v</span> {link(g.opp)}</span>
      <span className="muted" style={{ fontSize: 12 }}>{roundLabel(g.round)} · {g.for}–{g.against}</span>
    </div>
  );

  return (
    <section id="history" style={{ display: 'flex', flexDirection: 'column', gap: 18, borderTop: '1px solid var(--line)', paddingTop: 22 }}>
      <div>
        <span className="eyebrow">Since 2022 · head-to-head from 2026</span>
        <h2 className="h2" style={{ fontSize: 24 }}>History &amp; rivalries</h2>
      </div>

      <div className="hist-grid">
        {/* All-time table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <h3 className="h2" style={{ fontSize: 17 }}>All-time table</h3>
          <div className="table-box">
            <table className="squad" style={{ fontSize: 13 }}>
              <thead><tr><th style={{ width: 22 }}>#</th><th>Team</th><th style={{ textAlign: 'center' }}>W–L</th><th style={{ textAlign: 'right' }}>Win %</th><th style={{ textAlign: 'center' }}>Flags</th><th style={{ textAlign: 'center' }}>GFs</th><th style={{ textAlign: 'center' }}>Spoons</th></tr></thead>
              <tbody>
                {careers.map((c, i) => (
                  <tr key={c.name} style={mine(c.name) ? { fontWeight: 700 } : undefined}>
                    <td className="mono" style={{ padding: '6px 8px' }}>{i + 1}</td>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{link(c.name)}<div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{c.coach}</div></td>
                    <td className="mono" style={{ textAlign: 'center', padding: '6px 8px' }}>{c.w}–{c.l}</td>
                    <td className="mono" style={{ textAlign: 'right', padding: '6px 8px' }}>{(c.pct * 100).toFixed(0)}%</td>
                    <td style={{ textAlign: 'center', padding: '6px 8px' }}>{c.flags.length || <span className="muted">–</span>}</td>
                    <td style={{ textAlign: 'center', padding: '6px 8px' }}>{c.flags.length + c.runnerUp.length || <span className="muted">–</span>}</td>
                    <td style={{ textAlign: 'center', padding: '6px 8px' }}>{c.spoons.length || <span className="muted">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>Records include finals. 2026 grand final: {link(gf.winner)} {gf.winner_score} d. {link(gf.loser)} {gf.loser_score}.</span>
        </div>

        {/* Rivalries */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <h3 className="h2" style={{ fontSize: 17 }}>Nemesis &amp; bunny, 2026</h3>
          <div className="table-box">
            <table className="squad" style={{ fontSize: 13 }}>
              <thead><tr><th>Team</th><th>Nemesis</th><th>Bunny</th></tr></thead>
              <tbody>
                {order.map((t) => {
                  const r = rivals.find((x) => x.team === t);
                  if (!r) return null;
                  return (
                    <tr key={t} style={mine(t) ? { fontWeight: 700 } : undefined}>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{link(t, short(t))}</td>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{r.nemesis && <>{link(r.nemesis.o, short(r.nemesis.o))} <span className="mono muted">{r.nemesis.w}–{r.nemesis.l}</span></>}</td>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{r.bunny && <>{link(r.bunny.o, short(r.bunny.o))} <span className="mono muted">{r.bunny.w}–{r.bunny.l}</span></>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>Nemesis is the side you have the worst record against, bunny the best. Ties go to points margin.</span>
        </div>
      </div>

      {/* Records */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 className="h2" style={{ fontSize: 17 }}>2026 records</h3>
        <div className="hist-recs">
          {rec('big', 'Biggest win', records.biggestWin, (g) => `+${g.for - g.against}`)}
          {rec('close', 'Closest game', records.closest, (g) => `+${g.for - g.against}`)}
          {rec('high', 'Highest score', records.highest, (g) => `${g.for}`)}
          {rec('low', 'Lowest score', records.lowest, (g) => `${g.for}`)}
          {rec('bl', 'Best losing score', records.bestLoss, (g) => `${g.for}`)}
          {rec('ww', 'Lowest winning score', records.worstWin, (g) => `${g.for}`)}
        </div>
      </div>

      {/* Head to head grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 className="h2" style={{ fontSize: 17 }}>2026 head to head</h3>
        <div className="table-box" style={{ overflowX: 'auto' }}>
          <table className="squad h2h" style={{ fontSize: 12 }}>
            <thead>
              <tr><th style={{ textAlign: 'left' }}>Row v column</th>{order.map((o) => <th key={o} title={o}>{teams.find((x) => sameTeam(x.name, o))?.short_code ?? short(o).slice(0, 3)}</th>)}</tr>
            </thead>
            <tbody>
              {order.map((t) => (
                <tr key={t} style={mine(t) ? { fontWeight: 700 } : undefined}>
                  <td style={{ whiteSpace: 'nowrap', padding: '5px 8px' }}>{link(t, short(t))}</td>
                  {order.map((o) => {
                    if (o === t) return <td key={o} style={{ background: 'var(--line)' }} />;
                    const c = h2h[t]?.[o];
                    if (!c) return <td key={o} className="muted" style={{ textAlign: 'center' }}>–</td>;
                    const bg = c.w > c.l ? 'rgb(46 125 50 / .14)' : c.w < c.l ? 'rgb(198 40 40 / .12)' : 'rgb(0 0 0 / .04)';
                    return <td key={o} className="mono" title={`${t} ${c.for} – ${c.against} ${o}`} style={{ textAlign: 'center', background: bg, padding: '5px 4px' }}>{c.w}–{c.l}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>Includes finals. Keeper doesn’t keep fixtures from 2022–2025, so the head-to-head grows from this season on.</span>
      </div>
    </section>
  );
}
