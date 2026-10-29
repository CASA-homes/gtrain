import Link from 'next/link';
import { DraftTabs } from '@/components/DraftTabs';
import { TeamBadge } from '@/components/bits';
import { getLeague, getMe, type Pick } from '@/lib/data';
import { pickValue } from '@/lib/picks';
import { C } from '@/lib/ratings';
import { GTRAIN_DRAFTS } from '@/lib/gtrain-draft';
import { draftAwards } from '@/lib/draft-awards';
import { Face } from '@/components/TradeHighlights';

const norm = (s: string) => s.toLowerCase().replace(/[’'`]/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();

const ROUND_COLOUR = (r: number) => (r <= 2 ? C.green5 : r <= 4 ? C.green4 : r <= 8 ? C.green3 : r <= 15 ? C.green2 : C.empty);

export default async function DraftPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: y } = await searchParams;
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  const year = y === '2028' ? 2028 : y === '2026' ? 2026 : 2027;
  const team = new Map(league.teams.map((t) => [t.id, t]));
  const list = league.picks.filter((p) => p.year === year);
  // 2028 has no pick numbers yet: order by round, then the provisional order on the Keeper board (insert order).
  const ordered = year === 2027 ? [...list].sort((a, b) => (a.overall ?? 0) - (b.overall ?? 0)) : list;

  const capital = league.teams.map((t) => ({
    t,
    p27: league.picks.filter((p) => p.year === 2027 && p.owner_team_id === t.id),
    p28: league.picks.filter((p) => p.year === 2028 && p.owner_team_id === t.id),
  })).map((x) => ({ ...x, points: x.p27.reduce((s, p) => s + pickValue(p), 0) }))
    .sort((a, b) => (a.t.id === me?.team_id ? -1 : b.t.id === me?.team_id ? 1 : b.points - a.points));
  const capRank = [...capital].sort((a, b) => b.points - a.points).map((x) => x.t.id);

  const chip = (p: Pick, showYear = false) => {
    const via = p.original_team_id !== p.owner_team_id ? team.get(p.original_team_id) : null;
    return (
      <span key={p.id} title={via ? `via ${via.name}` : undefined}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: ROUND_COLOUR(p.round), color: p.round <= 4 ? '#fff' : C.ink, border: via ? `1.5px dashed ${C.ink}` : '1.5px solid transparent' }}>
        {showYear ? `${p.year} ` : ''}{p.overall ? `#${p.overall}` : `R${p.round}`}
        {via && <span style={{ fontWeight: 500, opacity: 0.85 }}>· {via.short_code}</span>}
      </span>
    );
  };

  return (
    <div className="wrap">
      <div className="row-between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="eyebrow">From the Keeper draft board · 16 rounds, round 16 is the keeper/rookie round</span>
          <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>Draft picks</h1>
        </div>
        <DraftTabs active="picks" />
        <div role="tablist" aria-label="Draft year" style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: 'var(--line)', gap: 2 }}>
          {[2026, 2027, 2028].map((yr) => (
            <Link key={yr} href={`/draft?year=${yr}`} role="tab" aria-selected={yr === year}
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', background: yr === year ? '#fff' : 'transparent', color: yr === year ? C.ink : C.muted }}>
              {yr === 2026 ? '2026 results' : `${yr} draft`}
            </Link>
          ))}
        </div>
      </div>

      {year === 2026 ? <Results2026 league={league} myTeam={me?.team_id ?? null} /> : (
      <div className="split" style={{ alignItems: 'flex-start' }}>
        {/* Draft-day order */}
        <section style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row-between">
            <h2 className="h2">{year} draft order</h2>
            <span className="muted" style={{ fontSize: 12 }}>{year === 2028 ? 'Indicative: pick numbers are set in Dec 2027' : 'Indicative: straight order, not a snake'}</span>
          </div>
          <div className="table-box" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
            <table className="squad">
              <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#fff' }}>
                <tr><th style={{ width: 64 }}>Pick</th><th style={{ width: 54 }}>Rd</th><th>Owner</th><th>Via</th></tr>
              </thead>
              {Array.from(new Set(ordered.map((p) => p.round))).map((r) => (
                <tbody key={r}>
                  <tr className="group"><td colSpan={4}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="dot" style={{ background: ROUND_COLOUR(r), boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / .1)' }} />{r === 16 ? 'Round 16 · keeper / rookie round' : `Round ${r}`}
                    </span>
                  </td></tr>
                  {ordered.filter((p) => p.round === r).map((p, i) => {
                    const owner = team.get(p.owner_team_id)!;
                    const via = p.original_team_id !== p.owner_team_id ? team.get(p.original_team_id) : null;
                    const mine = owner.id === me?.team_id;
                    return (
                      <tr key={p.id} style={{ background: mine ? '#eef5ea' : undefined }}>
                        <td className="mono" style={{ fontWeight: 600 }}>{p.overall ?? `${r}.${i + 1}`}</td>
                        <td className="mono muted">R{r}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <Link href={`/clubhouse/${owner.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: mine ? 700 : 600, color: 'inherit', textDecoration: 'none' }}>
                            <TeamBadge code={owner.short_code} logo={owner.logo_url} size={22} />{owner.name}
                          </Link>
                          <div className="muted" style={{ fontSize: 11, marginLeft: 30 }}>{owner.coach_name}</div>
                        </td>
                        <td className="muted" style={{ fontSize: 12 }}>{via ? `via ${via.name}` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        </section>

        {/* Coach panels */}
        <section style={{ flex: '1 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row-between">
            <h2 className="h2">By coach</h2>
            <span className="muted" style={{ fontSize: 12 }}>Dashed outline = acquired by trade</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
            {capital.map(({ t, p27, p28, points }) => (
              <div key={t.id} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, outline: t.id === me?.team_id ? `2px solid ${C.green5}` : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <TeamBadge code={t.short_code} logo={t.logo_url} size={32} />
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <Link href={`/clubhouse/${t.id}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>{t.name}</Link>
                    <span className="muted" style={{ fontSize: 12 }}>{t.coach_name}</span>
                  </div>
                </div>
                <div className="row-between" style={{ fontSize: 12 }}>
                  <span className="muted">2027 draft capital</span>
                  <span><b>{points.toLocaleString()}</b> pts · <span className="muted">#{capRank.indexOf(t.id) + 1} of 10</span></span>
                </div>
                <div>
                  <span className="eyebrow">2027 · {p27.length} picks</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>{p27.map((p) => chip(p))}</div>
                </div>
                <div>
                  <span className="eyebrow">2028 · {p28.length} picks</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>{p28.map((p) => chip(p))}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      )}
    </div>
  );
}

/** Draft-day board for the 2026 G-Train redraft: every selection from pick 1 down, grouped by round. */
function Results2026({ league, myTeam }: { league: Awaited<ReturnType<typeof getLeague>>; myTeam: number | null }) {
  const teamByName = new Map(league.teams.map((t) => [norm(t.name), t]));
  const playerByName = new Map<string, (typeof league.players)[number]>();
  for (const p of league.players) { playerByName.set(norm(p.full_name ?? p.name), p); if (!playerByName.has(norm(p.name))) playerByName.set(norm(p.name), p); }
  const picks = [...GTRAIN_DRAFTS[2026]].sort((a, b) => a.pick - b.pick);
  const rounds = Array.from(new Set(picks.map((p) => Math.ceil(p.pick / 10))));
  const awards = draftAwards([...league.players, ...league.freeAgents], league.ratings);
  return (
    <div className="draft-split">
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
        <h2 className="h2">2026 draft day</h2>
        <span className="muted" style={{ fontSize: 12 }}>21 Feb 2026 · {picks.length} selections · gaps are passed picks</span>
      </div>
      <div className="table-box">
        <table className="squad">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#fff' }}>
            <tr><th style={{ width: 56 }}>Pick</th><th>Player</th><th>Picked by</th><th style={{ width: 70, textAlign: 'right' }}>2026 avg</th></tr>
          </thead>
          {rounds.map((r) => (
            <tbody key={r}>
              <tr className="group"><td colSpan={4}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="dot" style={{ background: ROUND_COLOUR(r), boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / .1)' }} />{r === 16 ? 'Round 16 · keeper / rookie round' : `Round ${r}`}
                </span>
              </td></tr>
              {picks.filter((p) => Math.ceil(p.pick / 10) === r).map((p) => {
                const t = teamByName.get(norm(p.team));
                const pl = playerByName.get(norm(p.name));
                const mine = t != null && t.id === myTeam;
                return (
                  <tr key={p.pick} style={{ background: mine ? '#eef5ea' : undefined }}>
                    <td className="mono" style={{ fontWeight: 600 }}>{p.pick}</td>
                    <td>
                      {pl ? <Link href={`/players/${pl.id}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>{p.name}</Link> : <span style={{ fontWeight: 600 }}>{p.name}</span>}
                      {pl?.afl_club && <div className="muted" style={{ fontSize: 11 }}>{pl.afl_club}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {t ? (
                        <Link href={`/clubhouse/${t.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: mine ? 700 : 500, color: 'inherit', textDecoration: 'none' }}>
                          <TeamBadge code={t.short_code} logo={t.logo_url} size={20} /><span className="draft-team">{t.name}</span>
                        </Link>
                      ) : p.team}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>{pl?.average != null && (pl.games ?? 0) > 0 ? Math.round(pl.average) : <span className="muted">–</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </section>
    <aside style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div className="row-between" style={{ gap: 6 }}>
        <h2 className="h2">Draft day, one season on</h2>
      </div>
      <span className="muted" style={{ fontSize: 12, marginTop: -4 }}>Judged on 2026 output, age and long-term rating.</span>
      <div className="award-scroll">
      {awards.map((a) => {
        const t = teamByName.get(norm(a.team));
        const mine = t && t.id === myTeam;
        return (
          <div key={a.key} className="card" style={{ flexShrink: 0, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, ...(mine ? { borderColor: 'var(--ink)' } : {}) }}>
            <span style={{ font: '600 11px var(--font)', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted, #777)' }}>{a.title}</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Face p={a.player} label={a.player.name} size={44} />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Link href={`/players/${a.player.id}`} style={{ font: '700 15px var(--font)', color: 'inherit', textDecoration: 'none' }}>{a.player.full_name ?? a.player.name}</Link>
                <span className="muted" style={{ fontSize: 12 }}>G-Train pick {a.pick} · {t ? <Link href={`/clubhouse/${t.id}`} style={{ color: 'inherit' }}>{a.team}</Link> : a.team}</span>
                <span className="mono" style={{ fontSize: 12 }}>{a.line}</span>
              </div>
            </div>
            <span style={{ fontSize: 13, lineHeight: 1.4 }}>{a.why}</span>
          </div>
        );
      })}
      </div>
    </aside>
    </div>
  );
}
