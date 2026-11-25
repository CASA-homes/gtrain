import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AvgChip, Bar20, ClubDot, ScoreChip, Stars } from '@/components/bits';
import { CLUBS } from '@/lib/clubs';
import { getLeague, CURRENT_SEASON } from '@/lib/data';
import { getRates } from '@/lib/contracts';
import { age, C, form, played } from '@/lib/ratings';
import { scoutingReport } from '@/lib/scouting';
import { photoUrl } from '@/lib/photos';
import { HOLO } from '@/lib/holo';
import { HoloAvatar } from '@/components/HoloAvatar';
import { careerCurve } from '@/lib/careercurve';
import { CareerCurveChart } from '@/components/CareerCurveChart';
import { DraftProfileCard } from '@/components/DraftProfileCard';
import { draftProfileFor } from '@/lib/draft-profiles';
import { PlayerCard } from '@/components/PlayerCard';
import { playerCard } from '@/lib/player-card';
import { DRAFTEES } from '@/lib/draft-history';
import { WatchStar } from '@/components/WatchStar';
import { playerSummary } from '@/lib/player-summary';
import { getWatchlist } from '@/lib/watchlist';
import { PlayerContractRow, PlayerOffer } from '@/components/contracts/PlayerContract';
import { SummaryClamp } from '@/components/SummaryClamp';

export default async function PlayerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params;
  const { view } = await searchParams;
  const [league, watch, rates] = await Promise.all([getLeague(), getWatchlist(), getRates()]);
  const p = league.players.find((x) => x.id === Number(id)) ?? league.freeAgents.find((x) => x.id === Number(id));
  if (!p) notFound();
  const r = league.ratings.get(p.id)!;
  const attrs = league.attrs.get(p.id);
  const owner = league.teams.find((t) => t.id === p.team_id) ?? null;
  const line = r.line;
  const xs = played(p.last5);
  const mv = rates.get(p.id) ?? null;
  const valueRank = league.players.filter((x) => (rates.get(x.id) ?? 0) > (mv ?? 0)).length + 1;
  const f = form(p);
  const a = age(p.birth_date);
  const report = scoutingReport(p, r, attrs);
  const photo = photoUrl(p, 480);
  const b = p.box;
  const cc = careerCurve(p, league.players, (o) => league.ratings.get(o.id)?.line ?? 'MID', r.potential);
  const drafted = DRAFTEES.find((d) => d.id && d.id === p.dfs_id) ?? null;
  const prof = draftProfileFor(drafted?.y ?? p.draft_year, drafted?.n ?? p.full_name ?? p.name);
  const showDraft = view === 'draft';
  const card = playerCard(p, r, league.players, league.ratings);
  const pool26 = [...league.players, ...league.freeAgents].filter((x) => (x.games ?? 0) >= 10 && x.average != null).sort((x, y) => (y.average ?? 0) - (x.average ?? 0));
  const rank26 = pool26.findIndex((x) => x.id === p.id);
  const summary = playerSummary(p, { rank: rank26 >= 0 ? rank26 + 1 : null });
  const LINE_NAME = { DEF: 'defender', MID: 'midfielder', RUC: 'ruck', FWD: 'forward' } as const;

  const profile = [
    ['Average', r.average], ['Ceiling', r.ceiling], ['Floor', r.floor],
    ['Consistency', r.consistency], ['Durability', r.durability], ['Form', r.form],
  ] as const;

  const bio: [string, string][] = [
    ['Age', a != null ? String(a) : '–'],
    ['Height', p.height_cm ? `${p.height_cm}cm` : '–'],
    ['Drafted', p.draft_pick ? `#${p.draft_pick} ’${String(p.draft_year).slice(2)}` : p.draft_year ? `${p.draft_year}` : '–'],
    ['Games', p.career_games != null ? String(p.career_games) : '–'],
    ['Debut', p.debut_year ? String(p.debut_year) : '–'],
  ];

  return (
    <div className="wrap">
      <span className="mono muted" style={{ fontSize: 12 }}><Link href="/players">Players</Link> / {p.name}</span>

      <header className="phx">
        {/* One card: who he is and his numbers on the left, the summary on the right. */}
        <div className="phx-main">
          <div className="phx-who">
            {HOLO[p.name] ? <div className="phx-holo"><HoloAvatar holo={HOLO[p.name]} alt={p.full_name ?? p.name} size={88} /></div> : (
              <div className="phx-photo">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt={p.full_name ?? p.name} />
                ) : (
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#9aa79a" strokeWidth="1.4" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
                )}
              </div>
            )}
            <div className="phx-id">
              <div className="phx-meta">
                {p.positions.map((pos) => <span key={pos} className="phx-pos"><i style={{ background: C[pos] }} />{pos}</span>)}
                <span className="phx-dot">·</span>
                <span className="phx-club"><ClubDot code={p.afl_club} size={12} />{p.afl_club ? CLUBS[p.afl_club]?.name : '–'}</span>
                <span className="phx-dot">·</span>
                {owner ? <Link href={`/clubhouse/${owner.id}`} className="phx-owner">{owner.name}</Link> : <span><b>Free agent</b>{league.ownedPct.get(p.id) ? ` · ${league.ownedPct.get(p.id)} owned` : ''}</span>}
                {(p.is_keeper || p.is_rookie_keeper) && <span className="phx-tag">{p.is_rookie_keeper ? 'Rookie keeper' : 'Keeper'}</span>}
                {p.status && <span className="phx-tag red">{p.status}</span>}
                {p.list_status && <span className="phx-tag">{p.list_status}</span>}
              </div>
              <h1 className="phx-name">{p.full_name ?? p.name}</h1>
              <div className="phx-bio">
                {bio.map(([k, v]) => <span key={k}>{k === 'Age' ? `${v} yrs` : k === 'Height' ? v : k === 'Drafted' ? `Drafted ${v}` : k === 'Games' ? `${v} games` : `Debut ${v}`}</span>)}
                {prof ? (
                  <Link href={showDraft ? `/players/${p.id}` : `/players/${p.id}?view=draft`} aria-pressed={showDraft} className="phx-draft">{showDraft ? 'Back to stats' : 'Draft profile'}</Link>
                ) : null}
              </div>
            </div>
            <div className="phx-acts">
              <WatchStar playerId={p.id} initial={watch.ids.has(p.id)} name={p.full_name ?? p.name} size={20} />
              <PlayerOffer playerId={p.id} ownerTeamId={owner?.id ?? null} name={p.full_name ?? p.name} />
            </div>
          </div>
          <div className="phx-grid">
            <div className="phx-lab">Value</div>
            <div className="phx-cell" title={`Market value: No.${valueRank} of ${league.players.length} in the league`}><b className="phx-lg phx-mv">{mv != null ? `$${mv}k` : '–'}</b><span>Market value · #{valueRank}</span></div>
            <div className="phx-cell"><b className="phx-lg">{p.average != null ? p.average.toFixed(1) : '–'}</b><span>{CURRENT_SEASON} avg · {p.games ?? 0} games</span></div>
            <div className="phx-cell"><Stars value={r.valueStars} label="Current ability" /><span>Ability</span></div>
            <div className="phx-cell"><Stars value={r.potential} colour={C.green5} label="Potential" /><span>Potential</span></div>
            <PlayerContractRow playerId={p.id} ownerTeamId={owner?.id ?? null} />
          </div>
        </div>
        <aside className="phx-side" aria-label="Player summary">
          <span className="phx-eb">Player summary</span>
          <SummaryClamp paras={summary} />
        </aside>
      </header>

      {showDraft && prof ? (
        <section className="card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h2 className="h2">Draft profile · {prof.year}</h2>
            <span className="mono muted" style={{ fontSize: 12 }}>
              {drafted ? `Taken at pick ${drafted.p} by ${drafted.c}` : p.draft_pick ? `Pick ${p.draft_pick}, ${p.draft_year}` : ''}
            </span>
          </div>
          <DraftProfileCard d={prof} />
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="eyebrow">How he’s turned out</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px' }}>
              <span><span className="muted">AFL games </span><b>{p.career_games ?? '–'}</b></span>
              <span><span className="muted">{CURRENT_SEASON} average </span><b>{p.average?.toFixed(1) ?? '–'}</b></span>
              <span><span className="muted">Verdict </span><b>{report.verdict}</b></span>
              <span><span className="muted">Market value </span><b>{mv != null ? `$${mv}k` : '–'}</b></span>
            </div>
            <CareerCurveChart c={cc} lineName={LINE_NAME[line]} name={p.name} />
          </div>
        </section>
      ) : (
        <>
      {card && <PlayerCard {...card} />}
      <details className="card sr-acc">
        <summary className="row-between sr-sum" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2 className="h2">Scouting report</h2>
            <span className="pill" style={{ background: C.ink, color: '#fff', padding: '4px 12px' }}>{report.verdict}</span>
            {report.extra.map((v) => <span key={v} className="pill" style={{ background: v === 'Sell now' ? '#b4532a' : 'transparent', color: v === 'Sell now' ? '#fff' : C.ink, border: v === 'Sell now' ? 'none' : `1px solid ${C.ink}`, padding: '3px 11px' }}>{v}</span>)}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {report.tags.map((t) => <span key={t} className="pill" style={{ background: '#eef3ea', color: C.green5, padding: '3px 10px' }}>{t}</span>)}
          </div>
          <span className="sr-chev" aria-hidden="true">▾</span>
        </summary>
        <div className="sr-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 22 }}>
          {([['Play style', report.style], ['Potential', report.potential], ['Fantasy output', report.fantasy], ...(report.health ? [['Body & ceiling', report.health] as const] : []), ...(report.position ? [['Positional value', report.position] as const] : []), ['Outlook', report.outlook]] as const).map(([h, t]) => (
            <div key={h} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="eyebrow">{h}</span>
              <p style={{ margin: 0, lineHeight: 1.55, maxWidth: '62ch' }}>{t}</p>
            </div>
          ))}
        </div>
      </details>

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
          <p className="muted" style={{ fontSize: 11, margin: '6px 0 0' }}>From every {CURRENT_SEASON} game. Floor and ceiling are the average of his worst and best quarter of games; consistency is how little his scores swing. Games under 50% time on ground count against durability only. Durability looks back three seasons (2026 weighted most), so a big injury year still shows.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 22 }}>
            <div className="row-between"><span className="eyebrow">Career curve</span><span className="mono muted" style={{ fontSize: 11 }}>average by age · to {32}</span></div>
            <CareerCurveChart c={cc} lineName={LINE_NAME[line]} name={p.name} />
          </div>
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
        </section>
      </div>
        </>
      )}
    </div>
  );
}
