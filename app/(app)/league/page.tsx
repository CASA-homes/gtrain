import Link from 'next/link';
import { Chat } from '@/components/Chat';
import { Cup } from '@/components/bits';
import { getLeague, getMe, CURRENT_SEASON } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { postNews, rsvp } from './actions';

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
          <div className="kpi" style={{ borderColor: '#333b35' }}><span className="eyebrow" style={{ color: '#b9c0b8' }}>Grand final</span><b>{latest?.gf_winner_score}–{latest?.gf_loser_score}</b></div>
          <div className="kpi" style={{ borderColor: '#333b35' }}><span className="eyebrow" style={{ color: '#b9c0b8' }}>League medal</span><b>{latest?.medal ?? '–'}</b></div>
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

      <div className="split">
        <div className="col-main">
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="row-between"><h2 className="h2" style={{ fontSize: 20 }}>{CURRENT_SEASON} final ladder</h2><span className="muted" style={{ fontSize: 13 }}>Tiebreak on points scored</span></div>
            <div className="table-box">
              <table className="squad">
                <thead><tr><th style={{ width: 40 }}>#</th><th>Team</th><th>Coach</th><th style={{ textAlign: 'center' }}>W–L</th><th style={{ textAlign: 'right' }}>For</th><th style={{ textAlign: 'right' }}>Against</th></tr></thead>
                <tbody>
                  {ladder.map((l) => {
                    const t = league.teams.find((x) => x.id === l.team_id)!;
                    return (
                      <tr key={l.team_id}>
                        <td className="mono">{l.rank}</td>
                        <td style={{ whiteSpace: 'nowrap' }}><Link href={`/clubhouse/${t.id}`}>{t.name}</Link>{latest?.premier_id === t.id && <span style={{ marginLeft: 6, verticalAlign: -4 }}><Cup size={16} /></span>}</td>
                        <td className="muted">{t.coach_name}</td>
                        <td style={{ textAlign: 'center' }}>{l.wins}–{l.losses}</td>
                        <td style={{ textAlign: 'right' }}>{l.pts_for.toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }} className="muted">{l.pts_against.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 className="h2" style={{ fontSize: 20 }}>Chat</h2>
            {me && <Chat initial={(chat ?? []).reverse()} teams={league.teams} myTeamId={me.team_id} />}
          </section>
        </div>

        <aside className="col-side">
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 className="h2" style={{ fontSize: 20 }}>Honour roll</h2>
            <div className="table-box">
              <table className="squad">
                <thead><tr><th>Year</th><th>Premier</th><th>Runner-up</th><th>Spoon</th></tr></thead>
                <tbody>
                  {league.seasons.map((s) => (
                    <tr key={s.year}>
                      <td className="mono">{s.year}</td>
                      <td style={{ fontWeight: 600 }}>{name(s.premier_id)}</td>
                      <td className="muted">{name(s.runner_up_id)}</td>
                      <td className="muted">{name(s.spoon_id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 className="h2" style={{ fontSize: 20, marginBottom: 6 }}>Flags</h2>
            {flags.map(({ t, years }) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                <Link href={`/clubhouse/${t.id}`} style={{ color: 'inherit', fontWeight: 500, textDecoration: 'none' }}>{t.name}</Link>
                <span style={{ display: 'inline-flex', gap: 4 }}>{years.map((y) => <Cup key={y} size={18} year={y} />)}</span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
