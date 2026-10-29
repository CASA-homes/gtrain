import Link from 'next/link';
import { Chat } from '@/components/Chat';
import { Cup } from '@/components/bits';
import { AllTeamField } from '@/components/AllTeamField';
import { Face, TradeHighlights } from '@/components/TradeHighlights';
import { TRADES_2026 } from '@/lib/trades-2026';
import { PLAYER_NEWS } from '@/lib/player-news';
import { best22, LINES } from '@/lib/ratings';
import { getLeague, getMe, CURRENT_SEASON } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { postNews, rsvp } from './actions';
import { LeagueHistory } from '@/components/LeagueHistory';

export default async function LeaguePage() {
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  const supabase = await createClient();
  const [{ data: news }, { data: chat }, { data: rsvps }] = await Promise.all([
    supabase.from('news').select('*').order('happens_at', { ascending: true, nullsFirst: false }).limit(8),
    supabase.from('chat_messages').select('id, team_id, body, pinned, created_at').order('created_at', { ascending: false }).limit(60),
    supabase.from('rsvps').select('news_id, answer, user_id'),
  ]);
  const name = (id: number) => league.teams.find((t) => t.id === id)?.name ?? '–';
  const latest = league.seasons[0];
  const flags = league.teams
    .map((t) => ({ t, years: league.seasons.filter((s) => s.premier_id === t.id).map((s) => s.year).sort() }))
    .filter((x) => x.years.length)
    .sort((a, b) => b.years.length - a.years.length);
  const ladder = league.ladder.filter((l) => l.season === CURRENT_SEASON);

  // All-G-Train team: best 2026 averages per line (min. 10 games), 5/7/1/5 + 4 bench.
  const allTeam = best22(league.players.filter((p) => (p.games ?? 0) >= 10 && p.average != null));
  const allTeamByCoach = Object.entries(
    [...LINES.flatMap((l) => allTeam.lines[l]), ...allTeam.bench].reduce<Record<string, number>>((acc, p) => { const n = name(p.team_id); acc[n] = (acc[n] ?? 0) + 1; return acc; }, {}),
  ).sort((x, y) => y[1] - x[1]);

  return (
    <div className="wrap">
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 32px', alignItems: 'center', justifyContent: 'space-between', padding: '22px 24px', background: 'var(--ink)', color: 'var(--cream)', borderRadius: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ font: '500 12px var(--mono)', letterSpacing: '.14em', textTransform: 'uppercase', color: '#9ccb84' }}>G-Train Fantasy Keeper</span>
          <h1 style={{ font: '900 52px/.95 var(--display)', textTransform: 'uppercase' }}>The League</h1>
          <span style={{ color: '#b9c0b8' }}>10 coaches · est. 2022 · {league.seasons.length} seasons</span>
        </div>
        <div className="kpis">
          <div className="kpi" style={{ borderColor: '#333b35' }}><span className="eyebrow" style={{ color: '#b9c0b8' }}>{latest?.year} premiers</span><b>{latest ? name(latest.premier_id) : '–'}</b></div>
          <div className="kpi" style={{ borderColor: '#333b35' }}><span className="eyebrow" style={{ color: '#b9c0b8' }}>{latest?.year} wooden spoon</span><b>{latest?.spoon_id ? name(latest.spoon_id) : '–'}</b></div>
          <nav className="kpi league-links" style={{ borderColor: '#333b35' }} aria-label="League">
            <Link href="/league/settings">League settings <span aria-hidden>→</span></Link>
            <Link href="#history">League history <span aria-hidden>→</span></Link>
            <Link href="/league/bets">League bets <span aria-hidden>→</span></Link>
          </nav>
        </div>
      </header>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="h2" style={{ fontSize: 20 }}>News board</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {(news ?? []).map((n, i) => {
            const d = n.happens_at ? new Date(n.happens_at) : null;
            const going = (rsvps ?? []).filter((r) => r.news_id === n.id && r.answer === 'yes').length;
            const mine = (rsvps ?? []).find((r) => r.news_id === n.id && r.user_id === me?.user_id)?.answer;
            const hero = i === 0;
            return (
              <article key={n.id} style={{ display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'space-between', borderRadius: 16, padding: 18, ...(hero ? { background: 'var(--g5)', color: 'var(--cream)' } : { background: '#fff', border: '1px solid var(--line)' }) }}>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ flex: 'none', width: 64, padding: '8px 0', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', ...(hero ? { background: 'var(--cream)', color: 'var(--ink)' } : { background: 'var(--ink)', color: 'var(--cream)' }) }}>
                    <span style={{ font: '500 11px var(--mono)', textTransform: 'uppercase' }}>{d ? d.toLocaleString('en-AU', { month: 'short' }) : 'TBC'}</span>
                    <span style={{ font: '900 32px/1 var(--display)' }}>{d ? d.getDate() : '?'}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <span style={{ font: '500 10px var(--mono)', letterSpacing: '.08em', textTransform: 'uppercase', color: hero ? '#cfe6c2' : 'var(--g5)' }}>{n.kind}</span>
                    <span style={{ font: '600 17px var(--font)' }}>{n.title}</span>
                    <span style={{ fontSize: 13, color: hero ? '#d5ddd3' : 'var(--muted)' }}>{[n.location, n.details].filter(Boolean).join(' · ')}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: hero ? '#d5ddd3' : 'var(--muted)' }}>{going} going</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['yes', 'maybe', 'no'] as const).map((ans) => (
                      <form key={ans} action={rsvp.bind(null, n.id, ans)}>
                        <button type="submit" className="btn" aria-pressed={mine === ans} style={mine === ans ? { background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' } : undefined}>
                          {ans === 'yes' ? 'In' : ans === 'maybe' ? 'Maybe' : 'Out'}
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
          {!news?.length && <div className="card muted" style={{ padding: 18 }}>Nothing posted yet. The commish posts draft day, deadlines and catch-ups here.</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="eyebrow">Player news</span>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6, scrollSnapType: 'x mandatory' }}>
            {PLAYER_NEWS.map((n) => {
              const p = league.players.find((x) => x.name === n.player) ?? null;
              return (
                <article key={n.player} className="card" style={{ flex: '0 0 260px', scrollSnapAlign: 'start', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Face p={p} label={n.player} size={44} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span style={{ font: '500 10px var(--mono)', letterSpacing: '.08em', textTransform: 'uppercase', color: n.tag === 'Off-field' || n.tag === 'Injury' ? '#b4532a' : 'var(--g5)' }}>{n.tag}</span>
                      <span style={{ font: '600 14px/1.2 var(--font)' }}>{p ? <Link href={`/players/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{n.title}</Link> : n.title}</span>
                      {p && <span className="muted" style={{ fontSize: 11 }}>{name(p.team_id)}</span>}
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--muted)' }}>{n.body}</p>
                </article>
              );
            })}
          </div>
        </div>
        {me?.is_commish && (
          <details className="card" style={{ padding: 14 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Post news</summary>
            <form action={postNews} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="eyebrow">Type</span>
                <select name="kind" className="input">{['Draft day', 'Deadline', 'Catch-up', 'Market', 'News'].map((k) => <option key={k}>{k}</option>)}</select></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="eyebrow">Title</span><input name="title" required className="input" /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="eyebrow">When</span><input name="happens_at" type="datetime-local" className="input" /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="eyebrow">Where</span><input name="location" className="input" /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}><span className="eyebrow">Details</span><input name="details" className="input" /></label>
              <button type="submit" className="btn dark" style={{ justifySelf: 'start' }}>Post</button>
            </form>
          </details>
        )}
      </section>

      <div className="split" style={{ gap: 22 }}>
        {/* Left: condensed ladder, honour roll, flags */}
        <div style={{ flex: '1 1 280px', minWidth: 0, maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 className="h2" style={{ fontSize: 18 }}>{CURRENT_SEASON} final ladder</h2>
            <div className="table-box">
              <table className="squad" style={{ fontSize: 13 }}>
                <thead><tr><th style={{ width: 26 }}>#</th><th>Team</th><th style={{ textAlign: 'center', width: 48 }}>W–L</th><th style={{ textAlign: 'right', width: 56 }}>For</th></tr></thead>
                <tbody>
                  {ladder.map((l) => {
                    const t = league.teams.find((x) => x.id === l.team_id)!;
                    return (
                      <tr key={l.team_id}>
                        <td className="mono" style={{ padding: '6px 8px' }}>{l.rank}</td>
                        <td style={{ whiteSpace: 'nowrap', padding: '6px 8px' }}>
                          <Link href={`/clubhouse/${t.id}`}>{t.name}</Link>
                          {latest?.premier_id === t.id && <span style={{ marginLeft: 4, verticalAlign: -3 }}><Cup size={13} /></span>}
                        </td>
                        <td style={{ textAlign: 'center', padding: '6px 8px' }}>{l.wins}–{l.losses}</td>
                        <td style={{ textAlign: 'right', padding: '6px 8px' }} className="mono">{(l.pts_for / 1000).toFixed(1)}k</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 className="h2" style={{ fontSize: 18 }}>Honour roll</h2>
            <div className="table-box">
              <table className="squad" style={{ fontSize: 13 }}>
                <thead><tr><th>Year</th><th>Premier</th><th>Runner-up</th><th>Spoon</th></tr></thead>
                <tbody>
                  {league.seasons.map((s) => (
                    <tr key={s.year}>
                      <td className="mono" style={{ padding: '6px 8px' }}>{s.year}</td>
                      <td style={{ fontWeight: 600, padding: '6px 8px' }}>{name(s.premier_id)}</td>
                      <td className="muted" style={{ padding: '6px 8px' }}>{name(s.runner_up_id)}</td>
                      <td className="muted" style={{ padding: '6px 8px' }}>{name(s.spoon_id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 className="h2" style={{ fontSize: 18, marginBottom: 6 }}>Flags</h2>
            {flags.map(({ t, years }) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--line)', fontSize: 14 }}>
                <Link href={`/clubhouse/${t.id}`} style={{ color: 'inherit', fontWeight: 500, textDecoration: 'none' }}>{t.name}</Link>
                <span style={{ display: 'inline-flex', gap: 4 }}>{years.map((y) => <Cup key={y} size={16} year={y} />)}</span>
              </div>
            ))}
          </section>
        </div>

        {/* Middle: trade highlights, then chat */}
        <div style={{ flex: '999 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <span className="eyebrow">{TRADES_2026.length} trades this season · newest first</span>
              <h2 className="h2" style={{ fontSize: 22 }}>Trade highlights {CURRENT_SEASON}</h2>
            </div>
            <TradeHighlights trades={TRADES_2026} players={league.players} teams={league.teams} />
          </section>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 className="h2" style={{ fontSize: 20 }}>Chat</h2>
            {me && <Chat initial={(chat ?? []).reverse()} teams={league.teams} myTeamId={me.team_id} readOnly={!!me.is_guest} />}
          </section>
        </div>

        {/* Right: the All-G-Train team */}
        <div style={{ flex: '1 1 340px', minWidth: 0, maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="row-between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 6 }}>
              <div>
                <span className="eyebrow">Best average on each line · min. 10 games</span>
                <h2 className="h2" style={{ fontSize: 22 }}>All-G-Train team {CURRENT_SEASON}</h2>
              </div>
              <span className="muted" style={{ fontSize: 13 }}>
                18 on the ground total <b style={{ color: 'var(--ink)' }}>{Math.round(LINES.flatMap((l) => allTeam.lines[l]).reduce((s2, p) => s2 + (p.average ?? 0), 0)).toLocaleString()}</b>
              </span>
            </div>
            <AllTeamField lines={allTeam.lines} bench={allTeam.bench} ownerOf={(p) => name(p.team_id)} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12 }} className="muted">
              {allTeamByCoach.map(([t, n]) => <span key={t}><b style={{ color: 'var(--ink)' }}>{n}</b> {t}</span>)}
            </div>
          </section>
        </div>
      </div>
      <div id="history" style={{ scrollMarginTop: 72 }} />
      <LeagueHistory teams={league.teams} myTeamName={league.teams.find((t) => t.id === me?.team_id)?.name ?? null} />
    </div>
  );
}
