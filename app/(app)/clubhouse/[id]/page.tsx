import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClubhouseSplit } from '@/components/ClubhouseSplit';
import { Bar20, ClubDot, Cup, StepBar, TeamBadge } from '@/components/bits';
import type { SquadBlock, SquadPlayer } from '@/components/SquadTable';
import { getLeague, getMe, CURRENT_SEASON } from '@/lib/data';
import {
  AGE_PHASES, agePhase, age, C, form, LINES, played, STATUSES, type Line, type PlayerRow,
} from '@/lib/ratings';
import { createClient } from '@/lib/supabase/server';

const LINE_NAMES: Record<Line, string> = { DEF: 'Defence', MID: 'Midfield', RUC: 'Ruck', FWD: 'Forward' };
const ordinal = (n: number) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] ?? 'th');

export default async function Clubhouse({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  const a = league.byTeam.get(Number(id));
  if (!a) notFound();
  const isMine = me?.team_id === a.team.id;

  const supabase = await createClient();
  const { data: listings } = await supabase
    .from('listings').select('id, kind, asking, status, ends_at, players(name, positions), offers(count)')
    .eq('team_id', a.team.id).in('status', ['open', 'pending']).order('created_at', { ascending: false });

  const toRow = (p: PlayerRow): SquadPlayer => {
    const r = league.ratings.get(p.id)!;
    return {
      id: p.id, name: p.name, positions: p.positions, afl_club: p.afl_club, average: p.average, last5: p.last5,
      games: p.games, tons: played(p.last5).filter((s) => s >= 100).length, form: form(p),
      valueStars: r.valueStars, potential: r.potential, is_keeper: p.is_keeper || p.is_rookie_keeper, status: p.status,
    };
  };
  const blocks: SquadBlock[] = [
    {
      title: 'Best 22', sub: '5 DEF · 7 MID · 1 RUC · 5 FWD · 4 bench, picked on 2026 average',
      groups: [
        ...LINES.map((l) => ({ name: LINE_NAMES[l], colour: C[l], players: a.best.lines[l].map(toRow) })),
        { name: 'Bench', colour: C.muted, players: a.best.bench.map(toRow) },
      ],
    },
    { title: 'Extended squad', sub: `${a.best.extended.length} not in the Best 22`, groups: [{ name: 'Not selected', colour: C.muted, players: a.best.extended.map(toRow) }] },
  ];

  // Last season from the real ladder
  const lad = league.ladder.find((l) => l.season === CURRENT_SEASON && l.team_id === a.team.id);
  const season = league.seasons.find((s) => s.year === CURRENT_SEASON);
  const finish = season?.premier_id === a.team.id ? 'Premiers' : season?.runner_up_id === a.team.id ? 'Runners-up' : lad ? ordinal(lad.rank) : '–';
  const topPlayer = [...a.players].sort((x, y) => (y.average ?? 0) - (x.average ?? 0))[0];

  // Keepers and age profile
  const keepers = a.players.filter((p) => p.is_keeper || p.is_rookie_keeper);
  const keeperAges = keepers.map((p) => age(p.birth_date)).filter((x): x is number => x != null);
  const avgAge = keeperAges.length ? keeperAges.reduce((s, x) => s + x, 0) / keeperAges.length : null;

  // Needs: weakest lines, plus players losing form
  const needs = LINES.filter((l) => a.lineStrength[l].rank >= 6).map((l) => ({
    line: l, title: `${LINE_NAMES[l]} depth`, why: `${LINE_NAMES[l]} ranks ${ordinal(a.lineStrength[l].rank)} of 10 on Best 22 averages.`,
  }));

  // Cut candidates: the lowest-value players outside the Best 22
  const cuts = [...a.best.extended].sort((x, y) => league.ratings.get(x.id)!.value - league.ratings.get(y.id)!.value).slice(0, 4);

  return (
    <div className="wrap">
      <header className="ribbon">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <TeamBadge code={a.team.short_code} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1 style={{ font: '600 34px/1.05 var(--font)', letterSpacing: '-.03em' }}>{a.team.name}</h1>
              <span style={{ display: 'inline-flex', gap: 2 }}>{a.premierships.map((y) => <Cup key={y} year={y} />)}</span>
            </div>
            <span className="muted">Coach {a.team.coach_name}{isMine ? ' · your club' : ''}</span>
          </div>
        </div>
        <div className="kpis">
          <div className="kpi"><span className="eyebrow">Power rank</span><b>#{a.rank}</b></div>
          <div className="kpi"><span className="eyebrow">Best 18 avg</span><b>{Math.round(a.best18).toLocaleString()}</b></div>
          <div className="kpi"><span className="eyebrow">Keepers</span><b>{keepers.length} / 18</b></div>
          <div className="kpi"><span className="eyebrow">Squad</span><b>{a.players.length} / 33</b></div>
        </div>
        {isMine && <Link href={`/clubhouse/${a.team.id}/keepers`} className="btn dark">Set keepers</Link>}
      </header>

      <ClubhouseSplit blocks={blocks}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            <div className="row-between"><span className="eyebrow">Current status</span><span className="muted" style={{ fontSize: 12 }}>#{a.rank} of 10 on Best 18</span></div>
            <span style={{ font: '600 24px var(--font)', letterSpacing: '-.02em', color: a.rank <= 2 ? C.green5 : C.ink }}>{a.status}</span>
            <StepBar steps={STATUSES.map((s) => ({ name: s }))} active={STATUSES.indexOf(a.status)} colours={[C.green5, C.green4, C.green2, C.yellow]} />
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
                {isMine && <> <Link href={`/clubhouse/${a.team.id}/keepers`}>Set keepers</Link></>}
              </span>
            )}
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="h2">Line strength</h2>
          {LINES.map((l) => (
            <div key={l} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) 72px', gap: 10, alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 11px var(--mono)' }}><span className="dot" style={{ width: 7, height: 7, background: C[l] }} />{l}</span>
              <Bar20 value={a.lineStrength[l].score} label={`${l} line strength`} />
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
          <div className="row-between"><h2 className="h2">Cut candidates</h2><span className="muted" style={{ fontSize: 12 }}>Lowest value outside the Best 22</span></div>
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
      </ClubhouseSplit>
    </div>
  );
}
