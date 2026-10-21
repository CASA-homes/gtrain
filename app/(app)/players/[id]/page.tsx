import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AvgChip, Bar20, ClubDot, ScoreChip, Stars } from '@/components/bits';
import { CLUBS } from '@/lib/clubs';
import { getLeague, CURRENT_SEASON } from '@/lib/data';
import { C, form, played, primaryLine } from '@/lib/ratings';

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const league = await getLeague();
  const p = league.players.find((x) => x.id === Number(id));
  if (!p) notFound();
  const r = league.ratings.get(p.id)!;
  const owner = league.teams.find((t) => t.id === p.team_id)!;
  const line = primaryLine(p);
  const xs = played(p.last5);
  const valueRank = [...league.ratings.values()].filter((x) => x.value > r.value).length + 1;
  const f = form(p);

  const profile = [
    ['Average', r.average], ['Ceiling', r.ceiling], ['Floor', r.floor],
    ['Consistency', r.consistency], ['Durability', r.durability], ['Form', r.form],
  ] as const;

  return (
    <div className="wrap">
      <div className="row-between" style={{ alignItems: 'center' }}>
        <span className="mono muted" style={{ fontSize: 12 }}><Link href="/players">Players</Link> / {p.name}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/players?compare=${p.id}`} className="btn">Compare</Link>
          <Link href={`/market?player=${p.id}`} className="btn dark">Make an offer</Link>
        </div>
      </div>

      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center', paddingBottom: 28, borderBottom: '1px solid var(--line)' }}>
        <div style={{ width: 132, height: 132, borderRadius: 24, background: '#e8eee5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12, flex: 'none' }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#9aa79a" strokeWidth="1.4" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
        </div>
        <div style={{ flex: '999 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {p.positions.map((pos) => (
              <span key={pos} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid var(--line)', padding: '3px 10px' }}>
                <span className="dot" style={{ background: C[pos] }} />{pos}
              </span>
            ))}
            {(p.is_keeper || p.is_rookie_keeper) && <span className="pill" style={{ background: C.ink, color: '#fff', padding: '4px 10px' }}>{p.is_rookie_keeper ? 'Rookie keeper' : 'Keeper'}</span>}
            {p.status && <span className="pill" style={{ background: C.redBg, color: C.redFg, padding: '4px 10px' }}>{p.status}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <h1 style={{ font: '600 52px/1 var(--font)', letterSpacing: '-.04em' }}>{p.name}</h1>
            <ClubDot code={p.afl_club} size={40} />
          </div>
          <div className="muted" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px' }}>
            <span>{p.afl_club ? CLUBS[p.afl_club]?.name : 'Club arrives with the stats feed'}</span>
            <span>Owned by <Link href={`/clubhouse/${owner.id}`}>{owner.name}</Link></span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="eyebrow">Value</span>
            <span style={{ font: '600 48px/1 var(--font)', letterSpacing: '-.03em', color: C.green5 }}>{r.value}</span>
            <span className="muted" style={{ fontSize: 12 }}>{valueRank} of {league.players.length} in the league</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="eyebrow">Value stars</span>
            <Stars value={r.valueStars} label="Value" />
            <span className="eyebrow" style={{ marginTop: 6 }}>Potential</span>
            <Stars value={r.potential} colour={C.green5} label="Potential" />
          </div>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 32 }}>
        <section>
          <div className="row-between" style={{ paddingBottom: 8 }}><h2 className="h2">Fantasy profile</h2><span className="mono muted" style={{ fontSize: 11 }}>vs every {line}</span></div>
          {profile.map(([label, v]) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: '130px minmax(0, 1fr) 26px', gap: 12, alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--line)' }}>
              <span>{label}</span>
              <Bar20 value={v} height={14} label={label} />
              <span className="mono" style={{ textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="row-between"><h2 className="h2">Season line</h2><span className="mono muted" style={{ fontSize: 12 }}>{CURRENT_SEASON} · {p.games ?? 0} games</span></div>
          <div className="tiles" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="tile"><span className="eyebrow">Average</span><span style={{ marginTop: 4 }}><AvgChip value={p.average} /></span></div>
            <div className="tile"><span className="eyebrow">Best (last 5)</span><b>{xs.length ? Math.max(...xs) : '–'}</b></div>
            <div className="tile"><span className="eyebrow">Worst (last 5)</span><b>{xs.length ? Math.min(...xs) : '–'}</b></div>
            <div className="tile"><span className="eyebrow">Form</span><b style={{ color: f === 'up' ? C.green5 : f === 'down' ? '#c0392b' : C.ink }}>{f === 'up' ? 'Rising' : f === 'down' ? 'Falling' : f === 'flat' ? 'Steady' : '–'}</b></div>
          </div>
          <div>
            <span className="eyebrow">Last 5 rounds, oldest to newest</span>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[...p.last5].reverse().map((s, i) => <span key={i} style={{ transform: 'scale(1.25)', transformOrigin: 'left center', marginRight: 10 }}><ScoreChip value={s} /></span>)}
            </div>
          </div>
          <div className="card" style={{ padding: 14, fontSize: 13 }} >
            <b style={{ fontWeight: 600 }}>Coming with the stats feed: </b>
            <span className="muted">disposals, kicks, handballs, marks, tackles, hitouts, clearances and where his points come from. Ball-winning and contest ratings switch on once DFS data is connected.</span>
          </div>
        </section>
      </div>
    </div>
  );
}
