import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClubLogoEditor } from '@/components/ClubLogoEditor';
import { ClubhouseSplit } from '@/components/ClubhouseSplit';
import { StatusOverride } from './StatusOverride';
import { TEAM_NOTES } from '@/lib/team-notes';
import { Bar20, ClubDot, Cup, RankBar, StepBar, TeamBadge } from '@/components/bits';
import type { SquadPlayer } from '@/components/SquadTable';
import { getLeague, getMe, CURRENT_SEASON } from '@/lib/data';
import {
  AGE_PHASES, agePhase, age, C, form, LINES, played, STATUSES, type Line, type PlayerRow, type Slot,
} from '@/lib/ratings';
import { createClient } from '@/lib/supabase/server';
import { coreAge, strengthByYear, windowFor } from '@/lib/window';
import { draftOutlook, squadSummary } from '@/lib/verdict';
import { VerdictTabs } from '@/components/VerdictTabs';
import { WindowChart } from '@/components/WindowChart';
import { ClubGames } from '@/components/ClubGames';
import { clubGames, nameKey } from '@/lib/club-games';
import { StadiumArt } from '@/components/StadiumArt';

const LINE_NAMES: Record<Line, string> = { DEF: 'Defence', MID: 'Midfield', RUC: 'Ruck', FWD: 'Forward' };
const ordinal = (n: number) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] ?? 'th');

/** Age, change on last year's average, and the general direction of a player's average (-2 falling fast … +2 rising fast). */
function trendOf(p: PlayerRow): { age: number | null; prevAvg: number | null; delta: number | null; trend: -2 | -1 | 0 | 1 | 2 | null } {
  const seasons = (p.hist ?? []).filter((h) => h[1] >= 5 && h[0] < CURRENT_SEASON).map((h) => [h[0], h[2]] as [number, number]);
  if (p.average != null && (p.games ?? 0) >= 3) seasons.push([CURRENT_SEASON, p.average]);
  seasons.sort((x, y) => x[0] - y[0]);
  const prev = (p.hist ?? []).find((h) => h[0] === CURRENT_SEASON - 1 && h[1] >= 5);
  const prevAvg = prev ? prev[2] : null;
  const delta = prevAvg != null && p.average != null ? p.average - prevAvg : null;
  // Points a season over the last three seasons; with only one season, the last five against the season average.
  let slope: number | null = null;
  const recent = seasons.slice(-3);
  if (recent.length >= 2) {
    const n = recent.length, mx = recent.reduce((t, r) => t + r[0], 0) / n, my = recent.reduce((t, r) => t + r[1], 0) / n;
    const num = recent.reduce((t, r) => t + (r[0] - mx) * (r[1] - my), 0), den = recent.reduce((t, r) => t + (r[0] - mx) ** 2, 0);
    slope = den ? num / den : null;
  } else if (p.average != null) {
    const l5 = played(p.last5);
    if (l5.length >= 3) slope = (l5.reduce((t, x) => t + x, 0) / l5.length - p.average) / 2;
  }
  const trend = slope == null ? null : slope >= 6 ? 2 : slope >= 2 ? 1 : slope > -2 ? 0 : slope > -6 ? -1 : -2;
  return { age: age(p.birth_date), prevAvg, delta, trend };
}

export default async function Clubhouse({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  const a = league.byTeam.get(Number(id));
  if (!a) notFound();
  const isMine = me?.team_id === a.team.id;
  const gq = await (await createClient()).from('club_games').select('season, player_name, games').eq('team_id', a.team.id);
  const gamesReady = !gq.error;
  const games = clubGames(a.team.name, gq.data ?? []);

  const supabase = await createClient();
  const { data: listings } = await supabase
    .from('listings').select('id, kind, asking, status, ends_at, players(name, positions), offers(count)')
    .eq('team_id', a.team.id).in('status', ['open', 'pending']).order('created_at', { ascending: false });

  // Which slot each player is in: the coach's saved lineup, or the auto-picked Best 22.
  const slotOf = new Map<number, Slot | null>();
  const posOf = new Map<number, number>();
  for (const l of LINES) a.lineup.lines[l].forEach((p, i) => { slotOf.set(p.id, l); posOf.set(p.id, a.lineupSaved ? (p.lineup_pos ?? i) : i); });
  a.lineup.bench.forEach((p, i) => { slotOf.set(p.id, 'BENCH'); posOf.set(p.id, a.lineupSaved ? (p.lineup_pos ?? i) : i); });
  const rows: SquadPlayer[] = a.players.map((p: PlayerRow) => {
    const r = league.ratings.get(p.id)!;
    return {
      id: p.id, name: p.name, positions: p.positions, afl_club: p.afl_club, average: p.average, last5: p.last5,
      games: p.games, tons: played(p.last5).filter((s) => s >= 100).length, form: form(p),
      valueStars: r.valueStars, potential: r.potential, is_keeper: p.is_keeper || p.is_rookie_keeper, status: p.status,
      slot: slotOf.get(p.id) ?? null, pos: posOf.get(p.id) ?? null, photo_path: p.photo_path, dfs_id: p.dfs_id,
      ...trendOf(p),
    };
  });

  // Last season from the real ladder
  const lad = league.ladder.find((l) => l.season === CURRENT_SEASON && l.team_id === a.team.id);
  const season = league.seasons.find((s) => s.year === CURRENT_SEASON);
  const finish = season?.premier_id === a.team.id ? 'Premiers' : season?.runner_up_id === a.team.id ? 'Runners-up' : lad ? ordinal(lad.rank) : '–';
  const topPlayer = [...a.players].sort((x, y) => (y.average ?? 0) - (x.average ?? 0))[0];

  // Premiership window: past finishes, the 2027 simulation, then list strength on the age curve to 2030.
  const teamIds = [...league.byTeam.keys()];
  const lists = new Map([...league.byTeam].map(([k, t]) => [k, t.projection]));
  const strength = strengthByYear(teamIds, league.players, league.ratings, lists);
  const windowOf = (id: number) => {
    const t = league.byTeam.get(id)!;
    const lt = league.ladder.find((l) => l.season === CURRENT_SEASON && l.team_id === id);
    return windowFor({
      teamId: id, teamName: t.team.name, teamIds, premierYears: t.premierships,
      rank2026: lt?.rank ?? null, rank2027: t.projection.rank, futureRank: t.future.rank, coreAge: coreAge(id, league.players), strength,
    });
  };
  const windowPts = windowOf(a.team.id);

  // Verdict tabs: squad summary and a mock of the 2027 redraft guided by every club's 2027 window phase.
  const summary = squadSummary(a.players, league.ratings);
  const phases = new Map(teamIds.map((id) => [id, (id === a.team.id ? windowPts : windowOf(id)).find((p) => p.year === CURRENT_SEASON + 1)?.phase ?? 'Mid table']));
  const kept = new Set([...lists.values()].flatMap((l) => l.keepers));
  const outlook = draftOutlook(a.team.id,
    league.picks.filter((p) => p.year === CURRENT_SEASON + 1 && p.overall != null).map((p) => ({ overall: p.overall!, round: p.round, owner_team_id: p.owner_team_id })),
    phases, league.players.filter((p) => !kept.has(p.id) && !p.list_status));
  const note = TEAM_NOTES[a.team.name];


  // Keepers and age profile
  const keepers = a.players.filter((p) => p.is_keeper || p.is_rookie_keeper);
  const keeperAges = keepers.map((p) => age(p.birth_date)).filter((x): x is number => x != null);
  const avgAge = keeperAges.length ? keeperAges.reduce((s, x) => s + x, 0) / keeperAges.length : null;

  // Needs: weakest lines, plus players losing form
  const needs = LINES.filter((l) => a.lineStrength[l].rank >= 6).map((l) => ({
    line: l, title: `${LINE_NAMES[l]} depth`, why: `${LINE_NAMES[l]} ranks ${ordinal(a.lineStrength[l].rank)} of 10 on Best 22 averages.`,
  }));

  // Cut candidates: the lowest-value players outside the Best 22
  const cuts = [...a.lineup.extended].sort((x, y) => league.ratings.get(x.id)!.value - league.ratings.get(y.id)!.value).slice(0, 4);

  return (
    <div className="wrap">
      <header className="club-head">
        {season?.premier_id === a.team.id && (
          <div className="club-head-band">
            <svg width="13" height="14" viewBox="0 0 26 28" aria-hidden="true"><path d="M7 2 H19 V9 C19 13 16.5 16 13 16 C9.5 16 7 13 7 9 Z" fill="currentColor" /><rect x="11.5" y="16" width="3" height="5" fill="currentColor" /><rect x="7.5" y="21" width="11" height="4" rx="1" fill="currentColor" /></svg>
            {CURRENT_SEASON} PREMIERS
          </div>
        )}
        <StadiumArt className="club-head-art" />
        <div className="club-head-body">
          <div className="club-head-id">
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 'none' }}>
              <TeamBadge code={a.team.short_code} logo={a.team.logo_url} />
              {(isMine || me?.is_commish) && <ClubLogoEditor teamId={a.team.id} hasLogo={!!a.team.logo_url} />}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px 12px', flexWrap: 'wrap' }}>
                <h1 className="club-head-name">{a.team.name}</h1>
                {a.premierships.length > 0 && (
                  <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                    {a.premierships.map((y) => <span key={y} className="flag-chip"><Cup size={11} /> {y}</span>)}
                  </span>
                )}
              </div>
              <span className="muted">Coach {a.team.coach_name}{isMine ? ' · your club' : ''}</span>
            </div>
          </div>
          <div className="club-head-kpis">
            <div className="kpi"><span className="eyebrow">Power rank</span><b>#{a.rank}</b></div>
            <div className="kpi"><span className="eyebrow">Best 18 avg</span><b>{Math.round(a.best18).toLocaleString()}</b></div>
            <div className="kpi"><span className="eyebrow">Keepers</span><b>{keepers.length} / 18</b></div>
            <div className="kpi"><span className="eyebrow">Squad</span><b>{a.players.length} / 33</b></div>
          </div>
          {(isMine || me?.is_commish) && <Link href={`/clubhouse/${a.team.id}/keepers`} className="btn dark club-head-cta">{isMine ? 'Set keepers' : `Set ${a.team.short_code} keepers`}</Link>}
        </div>
      </header>

      <ClubhouseSplit players={rows} teamId={a.team.id} editable={isMine} saved={a.lineupSaved}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <VerdictTabs panels={[
            <div key="v" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {note ? <>
                <span title={note.headline} style={{ font: '600 17px/1.2 var(--font)', letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note.headline}</span>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#dfe5dc' }}>{note.body}</p>
              </> : <p style={{ margin: 0, fontSize: 14, color: '#dfe5dc' }}>No verdict written for this club yet.</p>}
            </div>,
            <div key="s" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {summary.length ? summary.map((x) => (
                <div key={x.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ font: '500 10px var(--mono)', letterSpacing: '.06em', textTransform: 'uppercase', color: '#b9c4b6' }}>{x.label}</span>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#dfe5dc' }}>
                    {x.label === 'Best young players' ? x.text : <><b style={{ color: '#f4f2ea' }}>{x.name}</b>: {x.text}</>}
                  </p>
                </div>
              )) : <p style={{ margin: 0, fontSize: 14, color: '#dfe5dc' }}>Not enough 2026 games to summarise yet.</p>}
            </div>,
            <div key="d" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ font: '600 15px/1.3 var(--font)' }}>{outlook.phase} for 2027</span>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: '#dfe5dc' }}>{outlook.strategy}</p>
              {outlook.lines.length ? outlook.lines.map((l) => (
                <div key={l.pick} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr)', gap: 10, alignItems: 'baseline' }}>
                  <b className="mono" style={{ color: '#d4a62a' }}>#{l.pick}</b>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#dfe5dc' }}>
                    {l.call === 'rookie'
                      ? <>Likely <b style={{ color: '#f4f2ea' }}>{l.rookie}</b>{l.rookieType ? `, ${l.rookieType}` : ''} from the 2026 national draft{l.vet ? <>, or a win-now option like {l.vet} (about {l.vetProj} projected)</> : null}.</>
                      : <>Win-now: <b style={{ color: '#f4f2ea' }}>{l.vet}</b> (about {l.vetProj} projected in 2027){l.rookie ? <>, or the best rookie left, likely {l.rookie}</> : null}.</>}
                  </p>
                </div>
              )) : <p style={{ margin: 0, fontSize: 14, color: '#dfe5dc' }}>No numbered 2027 picks yet.</p>}
              {outlook.later.length > 0 && <span style={{ fontSize: 12, color: '#b9c4b6' }}>Later picks: {outlook.later.map((x) => `#${x}`).join(', ')}. Depth and rookie-list fliers.</span>}
              <span style={{ fontSize: 11, color: '#8d978e' }}>A mock of the redraft: rebuilding clubs take the best rookie left, contenders the best player left on 2027 projections.</span>
            </div>,
          ]} />

          <div className="card" style={{ padding: '10px 14px 6px', display: 'flex', flexDirection: 'column', gap: 4, background: C.ink, color: '#f4f2ea', border: 0 }}>
            <span className="eyebrow" style={{ color: '#b9c4b6' }}>Premiership window</span>
            <WindowChart points={windowPts} />
          </div>

          <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="row-between">
              <span className="eyebrow">2027 outlook</span>
              <span className="muted" style={{ fontSize: 12 }}>Projected #{a.projection.rank} of 10 after keepers and the redraft</span>
            </div>
            <span style={{ font: '600 24px var(--font)', letterSpacing: '-.02em', color: STATUSES.indexOf(a.status) === 0 ? C.green5 : C.ink }}>{a.status}</span>
            <StepBar steps={STATUSES.map((s) => ({ name: s }))} active={STATUSES.indexOf(a.status)} colours={[C.green5, C.green4, C.green2, C.yellow]} />
            {me?.is_commish && <StatusOverride teamId={a.team.id} value={a.team.status_override} />}
          </div>

          <div className="row-between"><h2 className="h2">Last season</h2><span className="mono muted" style={{ fontSize: 12 }}>{CURRENT_SEASON}</span></div>
          <div className="tiles" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div className="tile"><span className="eyebrow">Finish</span><b>{finish}</b><span className="muted" style={{ fontSize: 12 }}>{lad ? `${ordinal(lad.rank)} on the ladder` : ''}</span></div>
            <div className="tile"><span className="eyebrow">Record</span><b>{lad ? `${lad.wins}–${lad.losses}` : '–'}</b><span className="muted" style={{ fontSize: 12 }}>{lad?.draws ? `${lad.draws} draws` : 'no draws'}</span></div>
            <div className="tile"><span className="eyebrow">Points for</span><b>{lad?.pts_for.toLocaleString() ?? '–'}</b><span className="muted" style={{ fontSize: 12 }}>{lad ? `${Math.round(lad.pts_for / 21).toLocaleString()} a round` : ''}</span></div>
            <div className="tile"><span className="eyebrow">Points against</span><b>{lad?.pts_against.toLocaleString() ?? '–'}</b><span className="muted" style={{ fontSize: 12 }}>{lad ? `${Math.round(lad.pts_against / 21).toLocaleString()} a round` : ''}</span></div>
            <div className="tile"><span className="eyebrow">Best player</span><b>{topPlayer?.name ?? '–'}</b><span className="muted" style={{ fontSize: 12 }}>{topPlayer?.average?.toFixed(1)} avg</span></div>
            <div className="tile"><span className="eyebrow">Grand final</span><b>{season?.premier_id === a.team.id ? `${season.gf_winner_score}–${season.gf_loser_score}` : season?.runner_up_id === a.team.id ? `${season.gf_loser_score}–${season.gf_winner_score}` : '–'}</b><span className="muted" style={{ fontSize: 12 }}>{season?.premier_id === a.team.id ? 'won the flag' : season?.runner_up_id === a.team.id ? 'lost the decider' : 'missed it'}</span></div>
          </div>

          <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="row-between">
              <span className="eyebrow">Keeper age profile</span>
              <span className="muted" style={{ fontSize: 12 }}>{keepers.length} keepers{avgAge != null ? ` · avg ${avgAge.toFixed(1)}` : ''}</span>
            </div>
            {avgAge != null ? (
              <>
                <span style={{ font: '600 24px var(--font)', letterSpacing: '-.02em' }}>{AGE_PHASES[agePhase(avgAge)].name}</span>
                <StepBar steps={AGE_PHASES.map((p) => ({ name: p.name, sub: p.range }))} active={agePhase(avgAge)} colours={[C.green2, C.green4, C.green5, C.green3, C.yellow]} />
              </>
            ) : (
              <span className="muted" style={{ fontSize: 13 }}>
                {keepers.length ? 'Player ages arrive with the first stats feed.' : 'No keepers set for 2027 yet.'}
                {(isMine || me?.is_commish) && <> <Link href={`/clubhouse/${a.team.id}/keepers`}>Set keepers</Link></>}
              </span>
            )}
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="h2">Line strength</h2>
          {LINES.map((l) => (
            <div key={l} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) 72px', gap: 10, alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 11px var(--mono)' }}><span className="dot" style={{ width: 7, height: 7, background: C[l] }} />{l}</span>
              <RankBar rank={a.lineStrength[l].rank} label={`${l} line strength`} />
              <span className="muted" style={{ textAlign: 'right', fontSize: 12 }}>{ordinal(a.lineStrength[l].rank)} of 10</span>
            </div>
          ))}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 className="h2" style={{ marginBottom: 6 }}>Needs</h2>
          {needs.length ? needs.map((n) => (
            <div key={n.line} style={{ display: 'grid', gridTemplateColumns: '10px minmax(0, 1fr) auto', gap: 12, padding: '11px 0', borderTop: '1px solid var(--line)' }}>
              <span className="dot" style={{ width: 10, height: 10, marginTop: 5, background: C[n.line] }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}><b style={{ fontWeight: 600 }}>{n.title}</b><span className="muted" style={{ fontSize: 13 }}>{n.why}</span></div>
              <Link href={`/market?line=${n.line}`} style={{ fontSize: 13 }}>Find on market</Link>
            </div>
          )) : <span className="muted" style={{ fontSize: 13, padding: '8px 0', borderTop: '1px solid var(--line)' }}>Every line ranks top 5. No glaring holes.</span>}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row-between">
            <h2 className="h2">Trade list</h2>
            {isMine && <Link href="/market/new" className="btn dark">List a player</Link>}
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            {listings?.length ? listings.map((l, i) => {
              const p = l.players as unknown as { name: string; positions: Line[] };
              const offers = (l.offers as unknown as { count: number }[])[0]?.count ?? 0;
              return (
                <Link key={l.id} href={`/market/${l.id}`} style={{ display: 'grid', gridTemplateColumns: '10px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '11px 14px', borderTop: i ? '1px solid var(--line)' : 0, color: 'inherit', textDecoration: 'none' }}>
                  <span className="dot" style={{ width: 10, height: 10, background: C[p.positions[0]] }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}><b style={{ fontWeight: 600 }}>{p.name}</b><span className="muted" style={{ fontSize: 12 }}>{l.kind === 'auction' ? 'Auction' : 'Listed'}{l.asking ? ` · ask ${l.asking}` : ''}</span></div>
                  <span className="pill" style={{ background: offers ? C.green5 : C.empty, color: offers ? '#fff' : C.ink }}>{offers} offer{offers === 1 ? '' : 's'}</span>
                </Link>
              );
            }) : <div className="muted" style={{ padding: '12px 14px', fontSize: 13 }}>Nobody listed yet.</div>}
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row-between"><h2 className="h2">Cut candidates</h2><span className="muted" style={{ fontSize: 12 }}>Lowest value outside the starting 22</span></div>
          <div className="card" style={{ overflow: 'hidden' }}>
            {cuts.map((p, i) => {
              const v = league.ratings.get(p.id)!.value;
              return (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) 96px', gap: 12, alignItems: 'center', padding: '11px 14px', borderTop: i ? '1px solid var(--line)' : 0 }}>
                  <ClubDot code={p.afl_club} size={16} />
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <Link href={`/players/${p.id}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>{p.name}</Link>
                    <span className="muted" style={{ fontSize: 12 }}>{p.positions.join('/')} · {p.games ?? 0} games · {p.average?.toFixed(1) ?? '–'} avg</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                    <div style={{ width: '100%' }}><Bar20 value={Math.max(1, Math.round(v / 5))} height={8} label="Value" /></div>
                    <span className="mono muted" style={{ fontSize: 11 }}>value {v}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <ClubGames rows={games} teamId={a.team.id} editable={isMine || !!me?.is_commish} tableReady={gamesReady}
          current={a.players.map((p) => nameKey(p.full_name ?? p.name))}
          links={Object.fromEntries([...league.freeAgents, ...league.players].flatMap((p) => { const v = { id: p.id, afl_club: p.afl_club, photo_path: p.photo_path, dfs_id: p.dfs_id }; return [[nameKey(p.name), v], [nameKey(p.full_name ?? p.name), v]]; }))} />
      </ClubhouseSplit>
    </div>
  );
}
