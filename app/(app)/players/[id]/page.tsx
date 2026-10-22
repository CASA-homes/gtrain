import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AvgChip, Bar20, ClubDot, ScoreChip, Stars } from '@/components/bits';
import { CLUBS } from '@/lib/clubs';
import { getLeague, CURRENT_SEASON } from '@/lib/data';
import { age, C, form, played, primaryLine } from '@/lib/ratings';
import { scoutingReport } from '@/lib/scouting';

/** Commish-supplied photo first, then the AFL headshot DFS points to. */
function photoUrl(p: { photo_path: string | null; dfs_id: string | null }) {
  if (p.photo_path) return p.photo_path;
  if (p.dfs_id) return `https://s.afl.com.au/staticfile/AFL%20Tenant/AFL/Players/ChampIDImages/AFL/2026014/${p.dfs_id.replace('CD_I', '')}.png`;
  return null;
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const league = await getLeague();
  const p = league.players.find((x) => x.id === Number(id));
  if (!p) notFound();
  const r = league.ratings.get(p.id)!;
  const attrs = league.attrs.get(p.id);
  const owner = league.teams.find((t) => t.id === p.team_id)!;
  const line = primaryLine(p);
  const xs = played(p.last5);
  const valueRank = [...league.ratings.values()].filter((x) => x.value > r.value).length + 1;
  const f = form(p);
  const a = age(p.birth_date);
  const report = scoutingReport(p, r, attrs);
  const photo = photoUrl(p);
  const b = p.box;

  const profile = [
    ['Average', r.average], ['Ceiling', r.ceiling], ['Floor', r.floor],
    ['Consistency', r.consistency], ['Durability', r.durability], ['Form', r.form],
  ] as const;

  const bio: [string, string][] = [
    ['Age', a != null ? String(a) : '–'],
    ['Height', p.height_cm ? `${p.height_cm} cm` : '–'],
    ['Drafted', p.draft_pick ? `#${p.draft_pick}, ${p.draft_year}` : p.draft_year ? `${p.draft_year}` : '–'],
    ['AFL games', p.career_games != null ? String(p.career_games) : '–'],
    ['Debut', p.debut_year ? String(p.debut_year) : '–'],
  ];

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
        <div style={{ width: 168, height: 168, borderRadius: 24, background: '#e8eee5', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', flex: 'none' }}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={p.full_name ?? p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
          ) : (
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#9aa79a" strokeWidth="1.4" aria-hidden="true" style={{ alignSelf: 'center' }}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
          )}
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
            {p.list_status && <span className="pill" style={{ background: C.ink, color: '#fff', padding: '4px 10px' }}>{p.list_status}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <h1 style={{ font: '600 52px/1 var(--font)', letterSpacing: '-.04em' }}>{p.full_name ?? p.name}</h1>
            <ClubDot code={p.afl_club} size={40} />
          </div>
          <div className="muted" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px' }}>
            <span>{p.afl_club ? CLUBS[p.afl_club]?.name : '–'}</span>
            <span>Owned by <Link href={`/clubhouse/${owner.id}`}>{owner.name}</Link></span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 22px', marginTop: 4 }}>
            {bio.map(([k, v]) => (
              <span key={k} style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="eyebrow">{k}</span><b style={{ fontWeight: 600 }}>{v}</b>
              </span>
            ))}
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

      <section className="card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2 className="h2">Scouting report</h2>
            <span className="pill" style={{ background: C.ink, color: '#fff', padding: '4px 12px' }}>{report.verdict}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {report.tags.map((t) => <span key={t} className="pill" style={{ background: '#eef3ea', color: C.green5, padding: '3px 10px' }}>{t}</span>)}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 22 }}>
          {([['Play style', report.style], ['Potential', report.potential], ['Fantasy output', report.fantasy], ['Outlook', report.outlook]] as const).map(([h, t]) => (
            <div key={h} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="eyebrow">{h}</span>
              <p style={{ margin: 0, lineHeight: 1.55, maxWidth: '62ch' }}>{t}</p>
            </div>
          ))}
        </div>
      </section>

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

        <section>
          <div className="row-between" style={{ paddingBottom: 8 }}><h2 className="h2">Game attributes</h2><span className="mono muted" style={{ fontSize: 11 }}>{CURRENT_SEASON} · vs the league</span></div>
          {attrs ? attrs.map((x) => (
            <div key={x.key} style={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr) 26px', gap: 12, alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--line)' }}>
              <span style={{ display: 'flex', flexDirection: 'column' }}>{x.label}<span className="muted" style={{ fontSize: 11 }}>{x.raw}</span></span>
              <Bar20 value={x.value} height={12} label={x.label} />
              <span className="mono" style={{ textAlign: 'right' }}>{x.value}</span>
            </div>
          )) : <p className="muted" style={{ fontSize: 13 }}>No AFL games in {CURRENT_SEASON}, so there’s nothing to grade yet.</p>}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="row-between"><h2 className="h2">Season line</h2><span className="mono muted" style={{ fontSize: 12 }}>{CURRENT_SEASON} · {p.games ?? 0} games</span></div>
          <div className="tiles" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="tile"><span className="eyebrow">Average</span><span style={{ marginTop: 4 }}><AvgChip value={p.average} /></span></div>
            <div className="tile"><span className="eyebrow">Best</span><b>{b?.mx ?? (xs.length ? Math.max(...xs) : '–')}</b></div>
            <div className="tile"><span className="eyebrow">Pts / min</span><b>{b?.ppm ? b.ppm.toFixed(2) : '–'}</b></div>
            <div className="tile"><span className="eyebrow">Form</span><b style={{ color: f === 'up' ? C.green5 : f === 'down' ? '#c0392b' : C.ink }}>{f === 'up' ? 'Rising' : f === 'down' ? 'Falling' : f === 'flat' ? 'Steady' : '–'}</b></div>
          </div>
          {b && (
            <div className="tiles" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
              {([['Kicks', b.k], ['Handballs', b.h], ['Marks', b.m], ['Tackles', b.t], ['Hitouts', b.ho], ['Clearances', b.cl], ['Cont. poss.', b.cp], ['Goals', b.g], ['TOG %', b.tog], ['CBA %', b.cba]] as const).map(([k, v]) => (
                <div key={k} className="tile"><span className="eyebrow">{k}</span><b>{v == null ? '–' : Number.isInteger(v) ? v : v.toFixed(1)}</b></div>
              ))}
            </div>
          )}
          <div>
            <span className="eyebrow">Last 5 rounds, oldest to newest</span>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[...p.last5].reverse().map((s, i) => <span key={i} style={{ transform: 'scale(1.25)', transformOrigin: 'left center', marginRight: 10 }}><ScoreChip value={s} /></span>)}
            </div>
          </div>
          {p.hist && p.hist.length > 0 && (
            <div>
              <span className="eyebrow">Career, AFL Fantasy average by season</span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 90, marginTop: 10 }}>
                {p.hist.slice(-10).map(([y, g, avg]) => (
                  <div key={y} title={`${y}: ${avg} from ${g} games`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    <span className="mono" style={{ fontSize: 10 }}>{Math.round(avg)}</span>
                    <div style={{ width: '100%', maxWidth: 34, height: Math.max(3, (avg / 130) * 60), borderRadius: 4, background: avg >= 100 ? C.green5 : avg >= 90 ? C.green4 : avg >= 80 ? C.green3 : avg >= 70 ? C.green2 : C.yellow }} />
                    <span className="mono muted" style={{ fontSize: 10 }}>’{String(y).slice(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
