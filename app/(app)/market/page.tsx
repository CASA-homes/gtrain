import Link from 'next/link';
import { ClubDot, Stars } from '@/components/bits';
import { Countdown } from '@/components/Countdown';
import { getLeague, getMe } from '@/lib/data';
import { pickPoints } from '@/lib/picks';
import { C, LINES, type Line } from '@/lib/ratings';
import { createClient } from '@/lib/supabase/server';
import { closeWish, decideTrade, postWish, voteVeto } from './actions';

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ line?: string }> }) {
  const sp = await searchParams;
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  const supabase = await createClient();
  const [{ data: listings }, { data: wishes }, { data: trades }, { data: votes }, { count: openDesks }] = await Promise.all([
    supabase.from('listings').select('id, kind, asking, minimum, open_to, ends_at, status, team_id, player_id, created_at, offers(id, offer, points, team_id, created_at)').in('status', ['open', 'pending']).order('created_at', { ascending: false }),
    supabase.from('wishes').select('*, wish_replies(count)').eq('status', 'open').order('created_at', { ascending: false }).limit(12),
    supabase.from('trades').select('*').order('created_at', { ascending: false }).limit(10),
    supabase.from('trade_votes').select('trade_id, team_id'),
    supabase.from('desks').select('id', { count: 'exact', head: true }).in('status', ['open', 'agreed']),
  ]);
  const team = (id: number) => league.teams.find((t) => t.id === id);
  const player = (id: number) => league.players.find((p) => p.id === id);
  const line = LINES.includes(sp.line as Line) ? (sp.line as Line) : null;
  const all = (listings ?? []).filter((l) => !line || player(l.player_id)?.positions.includes(line));
  const auctions = all.filter((l) => l.kind === 'auction');
  const regular = all.filter((l) => l.kind !== 'auction');
  const pendingTrades = (trades ?? []).filter((t) => t.status === 'proposed');
  const doneTrades = (trades ?? []).filter((t) => t.status === 'approved').slice(0, 5);

  return (
    <div style={{ margin: '-28px -16px 0', background: 'var(--market-bg)', minHeight: '100dvh' }}>
      <div style={{ background: 'var(--forest)', color: 'var(--cream)', padding: '28px max(16px, 2vw) 24px' }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '16px 32px', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <span style={{ font: '400 12px var(--mono)', color: '#a9b5aa' }}>G-Train / Market</span>
            <h1 style={{ font: '600 40px/1 var(--font)', letterSpacing: '-.035em' }}>Market</h1>
            <span style={{ color: '#a9b5aa' }}>No trade deadline. Every trade needs the commish’s tick, and 6 votes vetoes a lopsided one.</span>
          </div>
          <div className="kpis">
            {[['Listings', regular.length], ['Live auctions', auctions.length], ['Trade desks', openDesks ?? 0], ['Wishes', wishes?.length ?? 0], ['Awaiting commish', pendingTrades.length]].map(([l, v]) => (
              <div key={l} className="kpi" style={{ borderColor: '#33443a' }}><span className="eyebrow" style={{ color: '#a9b5aa' }}>{l}</span><b>{v}</b></div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/market/desk" className="btn" style={{ background: 'transparent', color: 'var(--cream)', borderColor: '#4a5d50' }}>Trade desk</Link>
            <Link href="/market/new" className="btn" style={{ background: 'var(--cream)', color: 'var(--forest)', border: 0 }}>List a player</Link>
          </div>
        </div>
      </div>

      <div className="page"><div className="wrap">
        {line && <div className="muted">Showing {line} only · <Link href="/market">show everyone</Link></div>}

        {pendingTrades.length > 0 && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 className="h2" style={{ fontSize: 20 }}>Awaiting approval</h2>
            {pendingTrades.map((t) => {
              const n = (votes ?? []).filter((v) => v.trade_id === t.id).length;
              const voted = (votes ?? []).some((v) => v.trade_id === t.id && v.team_id === me?.team_id);
              return (
                <div key={t.id} className="card" style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                  <span><b>{team(t.team_a)?.name}</b> gives {t.a_gives} · <b>{team(t.team_b)?.name}</b> gives {t.b_gives}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="muted" style={{ fontSize: 12 }}>{n} of 6 veto votes</span>
                    {!voted && me && ![t.team_a, t.team_b].includes(me.team_id) && <form action={voteVeto.bind(null, t.id)}><button className="btn">Vote lopsided</button></form>}
                    {me?.is_commish && <>
                      <form action={decideTrade.bind(null, t.id, false)}><button className="btn">Veto</button></form>
                      <form action={decideTrade.bind(null, t.id, true)}><button className="btn green">Approve</button></form>
                    </>}
                  </span>
                </div>
              );
            })}
          </section>
        )}

        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="row-between"><h2 className="h2" style={{ fontSize: 20, display: 'flex', alignItems: 'center', gap: 10 }}><span className="dot" style={{ background: '#c0392b' }} />Live auctions</h2><span className="muted" style={{ fontSize: 13 }}>Highest bid when the clock hits zero wins, if it meets the reserve.</span></div>
          {auctions.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
              {auctions.map((a) => {
                const p = player(a.player_id);
                const bids = (a.offers ?? []) as { offer: string; points: number | null; team_id: number }[];
                const top = [...bids].sort((x, y) => (y.points ?? 0) - (x.points ?? 0))[0];
                return (
                  <Link key={a.id} href={`/market/${a.id}`} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, color: 'inherit', textDecoration: 'none', borderRadius: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className="mono muted" style={{ fontSize: 11 }}>{p?.positions.join('/')}</span>
                        <span style={{ display: 'flex', gap: 8, alignItems: 'center', font: '600 20px var(--font)' }}>{p?.name} <ClubDot code={p?.afl_club ?? null} /></span>
                        <span className="muted" style={{ fontSize: 12 }}>Seller {team(a.team_id)?.name}</span>
                      </div>
                      {a.ends_at && <Countdown endsAt={a.ends_at} />}
                    </div>
                    <div className="tiles" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                      <div className="tile" style={{ background: 'var(--sunk)' }}><span className="eyebrow">Start</span><span style={{ fontWeight: 600 }}>{a.asking ?? '–'}</span></div>
                      <div className="tile" style={{ background: 'var(--sunk)' }}><span className="eyebrow">Top bid</span><span style={{ fontWeight: 600, color: C.green5 }}>{top?.offer ?? 'None yet'}</span></div>
                      <div className="tile" style={{ background: 'var(--sunk)' }}><span className="eyebrow">Bids</span><span style={{ fontWeight: 600 }}>{bids.length}</span></div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : <div className="card muted" style={{ padding: 16 }}>No auctions running. Start one when you list a player.</div>}
        </section>

        <div className="split">
          <section className="col-main">
            <div className="row-between">
              <h2 className="h2" style={{ fontSize: 20 }}>Listings</h2>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['All', ...LINES] as const).map((l) => (
                  <Link key={l} href={l === 'All' ? '/market' : `/market?line=${l}`} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', textDecoration: 'none', ...(((l === 'All' && !line) || l === line) ? { background: C.ink, color: '#fff' } : { background: '#fff', color: C.ink, border: '1px solid #d6ddd1' }) }}>
                    {l !== 'All' && <span className="dot" style={{ width: 7, height: 7, background: C[l] }} />}{l}
                  </Link>
                ))}
              </div>
            </div>
            <div className="card" style={{ overflow: 'hidden', borderRadius: 16 }}>
              {regular.length ? regular.map((l, i) => {
                const p = player(l.player_id);
                const r = p ? league.ratings.get(p.id) : null;
                return (
                  <Link key={l.id} href={`/market/${l.id}`} style={{ display: 'grid', gridTemplateColumns: '10px minmax(0, 1fr) 110px 90px', gap: 14, alignItems: 'center', padding: '13px 18px', borderTop: i ? '1px solid var(--line)' : 0, color: 'inherit', textDecoration: 'none' }}>
                    <span className="dot" style={{ width: 10, height: 10, background: p ? C[p.positions[0]] : C.muted }} />
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>{p?.name} <ClubDot code={p?.afl_club ?? null} size={16} />{l.status === 'pending' && <span className="pill" style={{ background: C.yellow }}>Deal pending</span>}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{p?.positions.join('/')} · {p?.average?.toFixed(1)} avg · {team(l.team_id)?.name}</span>
                    </div>
                    <span style={{ fontSize: 13 }}><span className="eyebrow">Ask </span>{l.asking ?? 'Open'}</span>
                    <span style={{ fontSize: 13 }} className="muted">{(l.offers ?? []).length} offer{(l.offers ?? []).length === 1 ? '' : 's'}{r ? <><br /><Stars value={r.valueStars} label="Value" /></> : null}</span>
                  </Link>
                );
              }) : <div className="muted" style={{ padding: 16 }}>Nothing listed{line ? ` at ${line}` : ''} yet.</div>}
            </div>
          </section>

          <aside className="col-side">
            <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="row-between"><h2 className="h2" style={{ fontSize: 20 }}>Wish board</h2><span className="muted" style={{ fontSize: 13 }}>What coaches are chasing</span></div>
              {(wishes ?? []).map((w) => (
                <article key={w.id} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="muted" style={{ fontSize: 12 }}><b style={{ color: C.ink }}>{team(w.team_id)?.name}</b></span>
                    <span className="pill" style={{ marginLeft: 'auto', background: w.tag === 'Pick' ? 'var(--forest)' : w.tag === 'Rebuild' ? C.yellow : '#e8eee5', color: w.tag === 'Pick' ? '#fff' : C.ink }}>{w.tag}</span>
                  </div>
                  <span style={{ font: '600 16px var(--font)' }}>{w.want}</span>
                  {w.offering && <span className="muted" style={{ fontSize: 13 }}>Offering: <span style={{ color: C.ink }}>{w.offering}</span></span>}
                  {(me?.team_id === w.team_id || me?.is_commish) && (
                    <form action={closeWish.bind(null, w.id)} style={{ alignSelf: 'flex-end' }}>
                      <button className="btn" style={{ minHeight: 28, padding: '0 10px', fontSize: 12 }}>Remove wish</button>
                    </form>
                  )}
                </article>
              ))}
              <details className="card" style={{ padding: 14 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Post a wish</summary>
                <form action={postWish} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  <label className="eyebrow" htmlFor="want">What are you after?</label>
                  <input id="want" name="want" required className="input" placeholder="A pick in the top 10" />
                  <label className="eyebrow" htmlFor="offering">What can you offer?</label>
                  <input id="offering" name="offering" className="input" placeholder="Two second-rounders" />
                  <label className="eyebrow" htmlFor="tag">Type</label>
                  <select id="tag" name="tag" className="input"><option>Player</option><option>Pick</option><option>Rebuild</option></select>
                  <button className="btn dark" style={{ alignSelf: 'flex-start' }}>Post</button>
                </form>
              </details>
            </section>

            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 className="h2" style={{ fontSize: 20 }}>Pick price guide</h2>
              <div className="card" style={{ padding: '6px 16px' }}>
                {[1, 5, 10, 15, 20, 30, 40].map((n, i) => (
                  <div key={n} style={{ display: 'grid', gridTemplateColumns: '70px minmax(0, 1fr) 60px', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: i ? '1px solid var(--line-soft)' : 0 }}>
                    <span className="mono" style={{ fontSize: 12 }}>Pick {n}</span>
                    <div style={{ height: 8, background: C.empty, borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pickPoints(n) / 30}%`, background: pickPoints(n) >= 2000 ? C.green5 : pickPoints(n) >= 1000 ? C.green4 : pickPoints(n) >= 400 ? C.green3 : C.green2 }} /></div>
                    <span className="mono muted" style={{ fontSize: 12, textAlign: 'right' }}>{pickPoints(n).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ display: 'flex', flexDirection: 'column' }}>
              <h2 className="h2" style={{ fontSize: 20, marginBottom: 6 }}>Done deals</h2>
              {doneTrades.length ? doneTrades.map((t) => (
                <div key={t.id} style={{ padding: '10px 0', borderTop: '1px solid #d6ddd1', fontSize: 13 }}>
                  <b>{team(t.team_a)?.name}</b> ↔ <b>{team(t.team_b)?.name}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{t.a_gives} for {t.b_gives}</div>
                </div>
              )) : <span className="muted" style={{ fontSize: 13 }}>No approved trades yet this offseason.</span>}
            </section>
          </aside>
        </div>
      </div></div>
    </div>
  );
}
