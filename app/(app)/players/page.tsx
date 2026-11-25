import { getWatchlist } from '@/lib/watchlist';
import Link from 'next/link';
import { AvgChip, Bar20, ClubDot, FormArrow, PosDots, Stars } from '@/components/bits';
import { getLeague, getMe, FREE_AGENTS_UPDATED } from '@/lib/data';
import { getRates, valueTrend } from '@/lib/contracts';
import { age, C, form, LINES, type Line, type PlayerRow } from '@/lib/ratings';
import { ATTRS } from '@/lib/scouting';
import { CLUBS } from '@/lib/clubs';
import { positions2025 } from '@/lib/positions-2025';
import { AskPlayers } from '@/components/AskPlayers';

type SP = { q?: string; line?: string; team?: string; sort?: string; f1?: string; m1?: string; f2?: string; m2?: string; agemin?: string; agemax?: string; avgmax?: string; mine?: string;
  own?: string; club?: string; status?: string; period?: string; yr?: string; n?: string };

/** Rows drawn per page load: the full list was 790 rows and a 5 MB page. "Show more" adds another batch. */
const PAGE = 100;

const INJURED = ['SHORT', 'LONG', 'SEASON', 'TEST', 'INJ'];
const PERIODS = [['season', 'Season average'], ['l10', 'Last 10 games'], ['l5', 'Last 5 games'], ['l3', 'Last 3 games'], ['l1', 'Last game']] as const;
const STATUS_LABEL: Record<string, string> = { SHORT: 'Short-term injury', LONG: 'Long-term injury', SEASON: 'Season-ending injury', OUT: 'Out of the side', SUSP: 'Suspended', DEL: 'Delisted', RET: 'Retired' };

/** Every stat you can sort or filter on. 1–20 bars unless noted. */
const PROFILE = [
  ['average', 'Average'], ['ceiling', 'Ceiling'], ['floor', 'Floor'], ['consistency', 'Consistency'], ['durability', 'Durability'], ['form', 'Form'],
] as const;
const STATS: { key: string; label: string; group: 'Rating' | 'Fantasy profile' | 'Game attributes' }[] = [
  { key: 'avg', label: 'Average (chosen period)', group: 'Rating' },
  { key: 'last', label: 'Last score', group: 'Rating' },
  { key: 'value', label: 'Market value ($k)', group: 'Rating' },
  { key: 'growth', label: 'Value growth on the year (%)', group: 'Rating' },
  { key: 'potential', label: 'Potential stars', group: 'Rating' },
  { key: 'age', label: 'Age (youngest first)', group: 'Rating' },
  ...PROFILE.map(([key, label]) => ({ key, label, group: 'Fantasy profile' as const })),
  ...ATTRS.map((a) => ({ key: `a_${a.key}`, label: a.label, group: 'Game attributes' as const })),
];
const label = (k: string) => STATS.find((s) => s.key === k)?.label ?? k;

const PRESETS: { name: string; hint: string; q: Record<string, string> }[] = [
  { name: 'Safe floor', hint: 'Floor 14+, consistency 12+', q: { sort: 'floor', f1: 'floor', m1: '14', f2: 'consistency', m2: '12' } },
  { name: 'Ceiling chasers', hint: 'Ceiling 15+: players who win you a week', q: { sort: 'ceiling', f1: 'ceiling', m1: '15' } },
  { name: 'Iron men', hint: 'Durability 17+', q: { sort: 'durability', f1: 'durability', m1: '17', f2: 'average', m2: '10' } },
  { name: 'Buy-low', hint: 'Big ceiling, average under 85', q: { sort: 'ceiling', f1: 'ceiling', m1: '13', avgmax: '85' } },
  { name: 'Young risers', hint: '23 and under, form trending up', q: { sort: 'average', agemax: '23', f1: 'form', m1: '16' } },
  { name: 'Kick-in takers', hint: 'Kick-ins 14+', q: { sort: 'a_ki', f1: 'a_ki', m1: '14' } },
];

export default async function PlayersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [league, me, watch, rates] = await Promise.all([getLeague(), getMe(), getWatchlist(), getRates()]);
  const q = (sp.q ?? '').toLowerCase();
  const line = LINES.includes(sp.line as Line) ? (sp.line as Line) : null;
  const team = sp.team ? Number(sp.team) : null;
  const sort = STATS.some((s) => s.key === sp.sort) ? sp.sort! : sp.own === 'free' ? 'avg' : 'value';
  const num = (x?: string) => (x != null && x !== '' && !Number.isNaN(Number(x)) ? Number(x) : null);
  const filters = ([[sp.f1, num(sp.m1)], [sp.f2, num(sp.m2)]] as const)
    .filter((f): f is [string, number] => !!f[0] && STATS.some((s) => s.key === f[0]) && f[1] != null);
  const ageMin = num(sp.agemin), ageMax = num(sp.agemax), avgMax = num(sp.avgmax);

  // Market value growth on the year: today's value against where he started the season.
  const growthCache = new Map<number, number | null>();
  const growth = (p: PlayerRow): number | null => {
    if (growthCache.has(p.id)) return growthCache.get(p.id)!;
    const now = rates.get(p.id); const t = valueTrend(p, 999); const start = t[0];
    const g = now != null && start && start > 6 ? Math.round(((now - start) / start) * 100) : null;
    growthCache.set(p.id, g); return g;
  };
  const stat = (p: PlayerRow, key: string): number | null => {
    const r = league.ratings.get(p.id)!;
    if (key === 'value') return rates.get(p.id) ?? null;
    if (key === 'growth') return growth(p);
    if (key === 'avg') return periodAvg(p);
    if (key === 'potential') return r.potential;
    if (key === 'last') return lastScore(p);
    if (key === 'age') return age(p.birth_date);
    if (key.startsWith('a_')) return league.attrs.get(p.id)?.find((x) => x.key === key.slice(2))?.value ?? null;
    return (r as unknown as Record<string, number>)[key] ?? null;
  };

  const own = sp.own === 'free' ? 'free' : sp.own === 'owned' ? 'owned' : sp.own === 'watch' ? 'watch' : 'all';   // default: every player
  const club = sp.club && CLUBS[sp.club] ? sp.club : null;
  const status = sp.status === 'playing' || sp.status === 'injured' ? sp.status : null;
  const period = PERIODS.some(([k]) => k === sp.period) ? sp.period! : 'season';
  // Season toggle: 2025 swaps the average and games played for last year's numbers (positions stay current).
  const y25 = sp.yr === '2025';
  // 2027: the 2026 draft class (national then rookie draft), in pick order.
  const y27 = sp.yr === '2027';
  const yearSel = y27 ? '2027' : y25 ? '2025' : '2026';
  const h25 = (p: PlayerRow) => (p.hist ?? []).find((h) => h[0] === 2025) ?? null;
  // 2025 mode uses the positions Champion Data set for 2025 (falls back to current for players who weren't listed).
  const posOf = (p: PlayerRow): Line[] => (y25 ? positions2025(p.full_name, p.afl_club) ?? p.positions : p.positions);
  // Average over the chosen window: the season, or the last N games he actually played.
  const periodAvg = (p: PlayerRow): number | null => {
    if (y25) { const h = h25(p); return h && h[1] > 0 ? Math.round(h[2] * 10) / 10 : null; }
    if (period === 'season') return p.average;
    const n = Number(period.slice(1));
    const xs = (p.games_log ?? []).map((g) => g[1]).filter((x): x is number => x != null);
    const last = xs.slice(-n);
    return last.length ? Math.round((last.reduce((t, x) => t + x, 0) / last.length) * 10) / 10 : null;
  };
  const lastScore = (p: PlayerRow): number | null => {
    if (y25) return null;
    const xs = (p.games_log ?? []).map((g) => g[1]).filter((x): x is number => x != null);
    return xs.length ? xs[xs.length - 1] : null;
  };
  const pool = own === 'owned' ? league.players : own === 'free' ? league.freeAgents
    : own === 'watch' ? [...league.players, ...league.freeAgents].filter((p) => watch.ids.has(p.id)) : [...league.players, ...league.freeAgents];
  const rows = pool
    .filter((p) => (!q || p.name.toLowerCase().includes(q) || (p.full_name ?? '').toLowerCase().includes(q))
      && (!line || posOf(p).includes(line))
      && (!team || own === 'free' || p.team_id === team)
      && (!club || p.afl_club === club)
      && (!status || (status === 'injured' ? INJURED.includes(p.status ?? '') : !INJURED.includes(p.status ?? '') && p.status !== 'SUSP'))
      && (sp.mine !== 'not' || p.team_id !== me?.team_id))
    .filter((p) => {
      const a = age(p.birth_date);
      if (ageMin != null && (a == null || a < ageMin)) return false;
      if (ageMax != null && (a == null || a > ageMax)) return false;
      if (avgMax != null && (p.average ?? 0) > avgMax) return false;
      return filters.every(([k, min]) => (stat(p, k) ?? -1) >= min);
    })
    .sort((a, b) => {
      const x = stat(a, sort), y = stat(b, sort);
      if (sort === 'age') return (x ?? 99) - (y ?? 99);
      if (sort === 'growth') return (y ?? -9999) - (x ?? -9999) || ((rates.get(b.id) ?? 0) - (rates.get(a.id) ?? 0));
      return (y ?? -1) - (x ?? -1) || ((rates.get(b.id) ?? 0) - (rates.get(a.id) ?? 0));
    });

  // 2027 tab: the draft class in pick order, filtered by the same ownership toggle, search, position, club and age.
  const byId = new Map([...league.players, ...league.freeAgents].map((p) => [p.id, p]));
  const classAll = league.draftClass.map((d) => ({ d: d.pick, p: byId.get(d.id)! })).filter((x) => x.p);
  const inOwn = (p: PlayerRow) => own === 'owned' ? p.team_id > 0 : own === 'free' ? p.team_id === 0 : own === 'watch' ? watch.ids.has(p.id) : true;
  const classRows = classAll.filter(({ p }) => inOwn(p)
    && (!q || p.name.toLowerCase().includes(q) || (p.full_name ?? '').toLowerCase().includes(q))
    && (!line || p.positions.includes(line)) && (!club || p.afl_club === club)
    && (!team || own === 'free' || p.team_id === team) && (sp.mine !== 'not' || p.team_id !== me?.team_id)
    && (ageMin == null || (age(p.birth_date) ?? 0) >= ageMin) && (ageMax == null || (age(p.birth_date) ?? 99) <= ageMax));
  const classCount = (o: string) => classAll.filter(({ p }) => o === 'owned' ? p.team_id > 0 : o === 'free' ? p.team_id === 0 : watch.ids.has(p.id)).length;

  const limit = Math.max(PAGE, Math.min(2000, Number(sp.n) || PAGE));
  const shown = rows.slice(0, limit);
  const moreHref = (n: number) => {
    const u = new URLSearchParams();
    for (const [key, v] of Object.entries(sp)) if (v != null && v !== '' && key !== 'n') u.set(key, String(v));
    u.set('n', String(n));
    return `/players?${u.toString()}`;
  };

  // Extra columns: the sort stat and any filtered stats, as bars.
  const extra = [...new Set([sort, ...filters.map((f) => f[0])])].filter((k) => k !== 'value' && k !== 'growth' && k !== 'potential' && k !== 'age' && k !== 'avg' && k !== 'last');
  // Clickable column headers: same filters, new sort.
  const sortHref = (k: string) => {
    const u = new URLSearchParams();
    for (const [key, v] of Object.entries(sp)) if (v != null && v !== '' && key !== 'sort' && key !== 'n') u.set(key, String(v));
    u.set('sort', k);
    return `/players?${u.toString()}`;
  };
  const SortTh = ({ k, children, title, style }: { k: string; children: React.ReactNode; title?: string; style?: React.CSSProperties }) => (
    <th style={style} title={title ?? `Sort by ${label(k).toLowerCase()}`} aria-sort={sort === k ? 'descending' : undefined}>
      <Link href={sortHref(k)} scroll={false} className={`th-sort${sort === k ? ' on' : ''}`}>{children}{sort === k ? ' ↓' : ''}</Link>
    </th>
  );
  const active = (preset: Record<string, string>) => Object.entries(preset).every(([k, v]) => sp[k as keyof SP] === v);
  const presetHref = (preset: Record<string, string>) => `/players?${new URLSearchParams({ ...(own !== 'all' ? { own } : {}), ...(y25 ? { yr: '2025' } : {}), ...(line ? { line } : {}), ...preset }).toString()}`;
  const ownHref = (o: string) => `/players?${new URLSearchParams({ ...(o !== 'all' ? { own: o } : {}), ...(sp.q ? { q: sp.q } : {}), ...(line ? { line } : {}), ...(club ? { club } : {}), ...(status ? { status } : {}), ...(period !== 'season' ? { period } : {}), ...(y25 || y27 ? { yr: yearSel } : {}) }).toString()}`;
  const activeFilters = [line, club, status, team && own !== 'free' ? 'team' : null, sp.mine, period !== 'season' ? period : null, sp.agemin, sp.agemax, sp.avgmax, ...filters.map((f) => f[0])].filter(Boolean).length;
  const periodLabel = PERIODS.find(([k]) => k === period)![1];
  const groups = ['Rating', 'Fantasy profile', 'Game attributes'] as const;
  const statOptions = (withBlank: boolean) => (
    <>
      {withBlank && <option value="">No filter</option>}
      {groups.map((g) => <optgroup key={g} label={g}>{STATS.filter((s) => s.group === g && (!withBlank || s.key !== 'age')).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</optgroup>)}
    </>
  );

  const sel = (name: string, lab: string, value: string, opts: React.ReactNode) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="eyebrow">{lab}</span>
      <select name={name} defaultValue={value} className="input">{opts}</select></label>
  );

  return (
    <div className="wrap">
      <div className="row-between pl-head" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          {y27 ? <span className="eyebrow pl-eyebrow">2026 draft class · {own === 'owned' ? 'drafted into the league' : own === 'free' ? 'not owned yet' : own === 'watch' ? 'on your watchlist' : 'every pick'} · {classRows.length} shown</span> : <span className="eyebrow pl-eyebrow">{own === 'owned' ? 'On a league list' : own === 'watch' ? `Your watchlist · only you see this${watch.synced ? '' : ' · saved on this device'}` : own === 'free' ? `Nobody owns them · from Keeper, ${FREE_AGENTS_UPDATED.split('-').reverse().join('/')}` : 'Every player'} · {rows.length}{rows.length > shown.length ? `, showing ${shown.length}` : ' shown'}</span>}
          <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}><span className="d-txt">Players</span><span className="m-txt">Player Search</span></h1>
        </div>
        <Link href="/players/rather" className="btn dark pl-rather-btn">Who’d you rather? · player values →</Link>
        <div className="pl-sq">
          <Link href="/players/rather" className="pl-sq-btn" aria-label="Who’d you rather?">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></svg>
            <span>Rather</span>
          </Link>
          <Link href="/players/rather?view=board" className="pl-sq-btn" aria-label="Player value board">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
            <span>Values</span>
          </Link>
        </div>
      </div>

      <AskPlayers />

      <form className="card players-filter" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {own !== 'all' && <input type="hidden" name="own" value={own} />}
        {(y25 || y27) && <input type="hidden" name="yr" value={yearSel} />}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input name="q" defaultValue={sp.q} placeholder="Search a player" className="input" style={{ flex: 1, minWidth: 0 }} aria-label="Search a player" />
          <span className="own-toggle own-year pf-year-m" role="tablist" aria-label="Season">
              {(['2027', '2026', '2025'] as const).map((y) => {
                const u = new URLSearchParams();
                for (const [key, v] of Object.entries(sp)) if (v != null && v !== '' && key !== 'yr' && key !== 'period' && key !== 'n') u.set(key, String(v));
                if (y !== '2026') u.set('yr', y);
                const on = y === yearSel;
                return <Link key={y} href={`/players?${u.toString()}`} role="tab" aria-selected={on} className={on ? 'on' : undefined} title={y === '2027' ? 'The 2026 draft class' : undefined}>{y}</Link>;
              })}
          </span>
          <button type="submit" className="btn dark pf-go">Go</button>
        </div>
        <details open={activeFilters > 0 || undefined}>
          <summary className="pf-row">
            <span className="btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M6 12h12M10 18h4" /></svg>
              <span className="pf-lab">Filters</span>{activeFilters ? <span className="pf-n">{activeFilters}</span> : null}
            </span>
            <span className="own-toggle own-year pf-year-d" role="tablist" aria-label="Season">
              {(['2027', '2026', '2025'] as const).map((y) => {
                const u = new URLSearchParams();
                for (const [key, v] of Object.entries(sp)) if (v != null && v !== '' && key !== 'yr' && key !== 'period' && key !== 'n') u.set(key, String(v));
                if (y !== '2026') u.set('yr', y);
                const on = y === yearSel;
                return <Link key={y} href={`/players?${u.toString()}`} role="tab" aria-selected={on} className={on ? 'on' : undefined} title={y === '2027' ? 'The 2026 draft class' : undefined}>{y}</Link>;
              })}
            </span>
            <span className="own-toggle own-main" role="tablist" aria-label="Ownership">
              {([['all', 'All', y27 ? classAll.length : null], ['owned', 'Owned', y27 ? classCount('owned') : league.players.length], ['free', 'Not owned', y27 ? classCount('free') : league.freeAgents.length], ['watch', 'Watchlist', y27 ? classCount('watch') : watch.ids.size]] as const).map(([k, lab, n]) => (
                <Link key={k} href={ownHref(k)} role="tab" aria-selected={own === k} className={own === k ? 'on' : undefined}>
                  {lab}{n != null && <span>{n}</span>}
                </Link>
              ))}
            </span>
          </summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end', marginTop: 12 }}>
            {sel('line', 'Position', sp.line ?? '', <><option value="">All positions</option>{LINES.map((l) => <option key={l}>{l}</option>)}</>)}
            {sel('club', 'AFL club', club ?? '', <><option value="">All clubs</option>{Object.entries(CLUBS).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([k, c]) => <option key={k} value={k}>{c.name}</option>)}</>)}
            {sel('status', 'Status', status ?? '', <><option value="">All statuses</option><option value="playing">Playing</option><option value="injured">Injured</option></>)}
            {!y25 && sel('period', 'Stats from', period, <>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</>)}
            {own !== 'free' && sel('team', 'League team', sp.team ?? '', <><option value="">All teams</option>{league.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</>)}
            {own !== 'free' && sel('mine', 'My list', sp.mine ?? '', <><option value="">Include mine</option><option value="not">Not on my list</option></>)}
            {sel('sort', 'Sort by', sort, statOptions(false))}
            <div style={{ display: 'flex', gap: 6 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}><span className="eyebrow">Age from</span>
                <input name="agemin" type="number" min={17} max={40} defaultValue={sp.agemin} className="input" /></label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}><span className="eyebrow">to</span>
                <input name="agemax" type="number" min={17} max={40} defaultValue={sp.agemax} className="input" /></label>
            </div>
            {([['f1', 'm1'], ['f2', 'm2']] as const).map(([f, m], i) => (
              <div key={f} style={{ display: 'flex', gap: 6 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 2, minWidth: 0 }}><span className="eyebrow">Filter {i + 1}</span>
                  <select name={f} defaultValue={sp[f] ?? ''} className="input">{statOptions(true)}</select></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}><span className="eyebrow">At least</span>
                  <input name={m} type="number" min={0} max={100} step="0.5" defaultValue={sp[m]} placeholder="12" className="input" /></label>
              </div>
            ))}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="eyebrow">Average at most</span>
              <input name="avgmax" type="number" min={0} max={150} defaultValue={sp.avgmax} className="input" /></label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="submit" className="btn dark" style={{ justifyContent: 'center', flex: 1 }}>Apply</button>
              <Link href={ownHref(own)} className="btn" style={{ justifyContent: 'center' }}>Reset</Link>
            </div>
          </div>
          <nav aria-label="Quick filters" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {PRESETS.map((pr) => (
              <Link key={pr.name} href={presetHref(pr.q)} title={pr.hint} className="btn" aria-current={active(pr.q) ? 'true' : undefined}
                style={{ fontSize: 12, minHeight: 30, ...(active(pr.q) ? { background: C.ink, color: '#fff', borderColor: C.ink } : {}) }}>{pr.name}</Link>
            ))}
          </nav>
        </details>
      </form>
      {y25 && <p style={{ margin: 0, fontSize: 13, background: '#fbf3dc', color: '#7a5a12', borderRadius: 10, padding: '8px 12px' }}>Showing <b>2025</b> averages, games played and AFL Fantasy positions. Owners, ratings and value are still current (2026).</p>}
      {y27 && <p style={{ margin: 0, fontSize: 13, background: '#e8f0fb', color: '#2c4a72', borderRadius: 10, padding: '8px 12px' }}>The <b>2026 AFL draft class</b>: {league.draftClass.filter((d) => d.pick.kind === 'national').length} National Draft picks and {league.draftClass.filter((d) => d.pick.kind === 'rookie').length} Rookie Draft picks, in order. They’re free agents in the keeper league until a coach drafts them, and they show in All, Not owned and your watchlist on the 2026 tab too. No AFL games yet, so there’s no average or value; potential comes from draft position and age. Positions are the clubs’ descriptions until AFL Fantasy sets 2027 positions.</p>}
      <p className="muted pl-note" style={{ margin: 0, fontSize: 12 }}>Bars are 1–20 against every rostered player on the same line, free agents included on the same scale. Potential is stars out of 5; value is 0–100.</p>

      {y27 ? (
        <div className="table-box">
          <table className="squad" style={{ minWidth: 920 }}>
            <thead>
              <tr>
                <th style={{ width: 70 }}>Pick</th><th style={{ width: 70 }}>Pos</th><th style={{ width: 26 }}><span className="sr-only">AFL club</span></th><th>Player</th><th>Owner</th>
                <th style={{ width: 44, textAlign: 'center' }}>Age</th><th style={{ width: 60, textAlign: 'center' }}>Height</th><th>Drafted from</th><th>Note</th><th style={{ width: 110 }}>Potential</th>
              </tr>
            </thead>
            <tbody>
              {classRows.map(({ d, p }) => {
                const owner = league.teams.find((t) => t.id === p.team_id);
                const r = league.ratings.get(p.id);
                return (
                  <tr key={`${d.kind}${d.pick}`}>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>{d.kind === 'rookie' ? <span title="Rookie Draft pick">R{d.pick}</span> : <b>{d.pick}</b>}</td>
                    <td><PosDots positions={p.positions} /></td>
                    <td><ClubDot code={p.afl_club} name={p.name} size={20} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link href={`/players/${p.id}`}>{p.full_name ?? p.name}</Link>{watch.ids.has(p.id) && <span title="On your watchlist" aria-label="On your watchlist" style={{ color: '#e2b100', marginLeft: 4 }}>★</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {owner ? <Link href={`/clubhouse/${owner.id}`} style={{ fontWeight: 400, color: C.muted }}>{owner.name}</Link>
                        : <span className="pill" style={{ background: '#e6f0e1', color: C.green5, fontSize: 11 }}>Free agent</span>}
                    </td>
                    <td style={{ textAlign: 'center' }} className="mono">{age(p.birth_date) ?? '–'}</td>
                    <td style={{ textAlign: 'center' }} className="mono">{p.height_cm ? `${Math.round(p.height_cm)}` : '–'}</td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{d.from}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{d.note ?? ''}</td>
                    <td>{r ? <Stars value={r.potential} colour={C.green5} label="Potential" /> : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!classRows.length && <p className="muted" style={{ padding: 12 }}>{own === 'watch' ? 'None of the draft class is on your watchlist yet. Star a player on his profile to add him.' : 'No draftees match those filters.'}</p>}
        </div>
      ) : (<>
      {own === 'watch' && rows.length === 0 && (
          <div className="card muted" style={{ padding: 16 }}>Your watchlist is empty. Tap the grey star above a player’s name on his profile to add him.</div>
        )}
        <div className="table-box">
        <table className="squad" style={{ minWidth: 920 + extra.length * 150 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th><th style={{ width: 90 }}>Pos</th><th style={{ width: 26 }}><span className="sr-only">AFL club</span></th><th>Player</th><th>{own === 'free' ? 'Owned' : 'Owner'}</th>
              <th style={{ width: 44, textAlign: 'center' }}>Age</th><SortTh k="avg" title={`${periodLabel} · sort`} style={{ width: 60, textAlign: 'center' }}>{y25 ? "'25 Avg" : period === 'season' ? 'Avg' : PERIODS.find(([k]) => k === period)![1].replace(' games', '').replace('Last ', 'L').replace('Last game', 'L1')}</SortTh><SortTh k="last" style={{ width: 54, textAlign: 'center' }}>Last</SortTh><th style={{ width: 50, textAlign: 'center' }}>Form</th><th style={{ width: 50, textAlign: 'center' }}>{y25 ? "'25 Apps" : 'Apps'}</th>
              {extra.map((k) => <th key={k} style={{ width: 150 }}>{label(k)}</th>)}
              <SortTh k="value" style={{ width: 70, textAlign: 'right' }}>Market</SortTh><SortTh k="growth" title="Market value change on the year" style={{ width: 66, textAlign: 'center' }}>+/− yr</SortTh><th style={{ width: 110 }}>Ability</th><SortTh k="potential" style={{ width: 110 }}>Potential</SortTh>
            </tr>
          </thead>
          <tbody>
            {shown.map((p, i) => {
              const r = league.ratings.get(p.id)!;
              const owner = league.teams.find((t) => t.id === p.team_id);
              return (
                <tr key={p.id}>
                  <td className="mono muted">{i + 1}</td>
                  <td><PosDots positions={posOf(p)} /></td>
                  <td><ClubDot code={p.afl_club} name={p.name} size={20} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Link href={`/players/${p.id}`}>{p.name}</Link>{(p.is_keeper || p.is_rookie_keeper) && <span className="keeper-tag">K</span>}{watch.ids.has(p.id) && <span title="On your watchlist" aria-label="On your watchlist" style={{ color: '#e2b100', marginLeft: 4 }}>★</span>}
                    {p.status && <span className="pill" title={STATUS_LABEL[p.status] ?? p.status} style={{ marginLeft: 6, background: '#f3c2b9', color: '#7a1d12' }}>{p.status}</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {owner ? <Link href={`/clubhouse/${owner.id}`} style={{ fontWeight: 400, color: C.muted }}>{owner.name}</Link>
                      : <span className="pill" style={{ background: '#e6f0e1', color: C.green5, fontSize: 11 }}>Free agent{own === 'free' && league.ownedPct.get(p.id) ? ` · ${league.ownedPct.get(p.id)}` : ''}</span>}
                  </td>
                  <td style={{ textAlign: 'center' }} className="mono">{age(p.birth_date) ?? '–'}</td>
                  <td style={{ textAlign: 'center' }}><AvgChip value={periodAvg(p)} /></td>
                  <td style={{ textAlign: 'center' }} className="mono">{lastScore(p) ?? '–'}</td>
                  <td style={{ textAlign: 'center' }}><FormArrow form={form(p)} /></td>
                  <td style={{ textAlign: 'center' }}>{y25 ? (h25(p)?.[1] || '–') : (p.games ?? '–')}</td>
                  {extra.map((k) => {
                    const v = stat(p, k);
                    return (
                      <td key={k}>
                        <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 22px', gap: 8, alignItems: 'center' }}>
                          {v != null ? <Bar20 value={v} height={9} label={label(k)} /> : <span className="muted">–</span>}
                          <span className="mono" style={{ textAlign: 'right', fontSize: 12 }}>{v ?? ''}</span>
                        </span>
                      </td>
                    );
                  })}
                  <td style={{ textAlign: 'right', fontWeight: 600 }} className="mono">{rates.has(p.id) ? `$${rates.get(p.id)}k` : '–'}</td>
                  <td style={{ textAlign: 'center' }}>{(() => { const g = growth(p); if (g == null) return <span className="muted">–</span>;
                    const k = Math.max(-1, Math.min(1, g / 40)); const hue = 60 + k * 70; // red (−40%) → amber (0) → green (+40%)
                    return <span className="pl-grow mono" style={{ background: `hsl(${hue} 62% ${92 - Math.abs(k) * 14}%)`, color: `hsl(${hue} 70% ${30 - Math.abs(k) * 8}%)` }} title={`${g >= 0 ? '+' : ''}${g}% on the year`}>{g > 0 ? '+' : g < 0 ? '−' : ''}{Math.abs(g)}%</span>; })()}</td>
                  <td><Stars value={r.valueStars} label="Current ability" /></td>
                  <td><Stars value={r.potential} colour={C.green5} label="Potential" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && (
        <nav aria-label="More players" style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 13 }}>Showing {shown.length} of {rows.length}</span>
          <Link href={moreHref(limit + PAGE)} scroll={false} className="btn dark">Show {Math.min(PAGE, rows.length - shown.length)} more</Link>
          {rows.length - shown.length > PAGE && <Link href={moreHref(rows.length)} scroll={false} className="btn">Show all</Link>}
        </nav>
      )}
      {!rows.length && <p className="muted">No players match those filters. Try lowering a minimum or clearing a filter.</p>}
      </>)}
    </div>
  );
}
