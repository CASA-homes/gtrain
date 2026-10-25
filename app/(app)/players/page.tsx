import Link from 'next/link';
import { AvgChip, Bar20, ClubDot, FormArrow, PosDots, Stars } from '@/components/bits';
import { getLeague, getMe, FREE_AGENTS_UPDATED } from '@/lib/data';
import { age, C, form, LINES, type Line, type PlayerRow } from '@/lib/ratings';
import { ATTRS } from '@/lib/scouting';
import { CLUBS } from '@/lib/clubs';

type SP = { q?: string; line?: string; team?: string; sort?: string; f1?: string; m1?: string; f2?: string; m2?: string; agemin?: string; agemax?: string; avgmax?: string; mine?: string;
  own?: string; club?: string; status?: string; period?: string };

const INJURED = ['SHORT', 'LONG', 'SEASON', 'TEST', 'INJ'];
const PERIODS = [['season', 'Season average'], ['l10', 'Last 10 games'], ['l5', 'Last 5 games'], ['l3', 'Last 3 games'], ['l1', 'Last game']] as const;
const STATUS_LABEL: Record<string, string> = { SHORT: 'Short-term injury', LONG: 'Long-term injury', SEASON: 'Season-ending injury', OUT: 'Out of the side', SUSP: 'Suspended', DEL: 'Delisted', RET: 'Retired' };

/** Every stat you can sort or filter on. 1–20 bars unless noted. */
const PROFILE = [
  ['average', 'Average'], ['ceiling', 'Ceiling'], ['floor', 'Floor'], ['consistency', 'Consistency'], ['durability', 'Durability'], ['form', 'Form'],
] as const;
const STATS: { key: string; label: string; group: 'Rating' | 'Fantasy profile' | 'Game attributes' }[] = [
  { key: 'avg', label: 'Average (chosen period)', group: 'Rating' },
  { key: 'value', label: 'Value (0–100)', group: 'Rating' },
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
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  const q = (sp.q ?? '').toLowerCase();
  const line = LINES.includes(sp.line as Line) ? (sp.line as Line) : null;
  const team = sp.team ? Number(sp.team) : null;
  const sort = STATS.some((s) => s.key === sp.sort) ? sp.sort! : sp.own === 'free' ? 'avg' : 'value';
  const num = (x?: string) => (x != null && x !== '' && !Number.isNaN(Number(x)) ? Number(x) : null);
  const filters = ([[sp.f1, num(sp.m1)], [sp.f2, num(sp.m2)]] as const)
    .filter((f): f is [string, number] => !!f[0] && STATS.some((s) => s.key === f[0]) && f[1] != null);
  const ageMin = num(sp.agemin), ageMax = num(sp.agemax), avgMax = num(sp.avgmax);

  const stat = (p: PlayerRow, key: string): number | null => {
    const r = league.ratings.get(p.id)!;
    if (key === 'value') return r.value;
    if (key === 'avg') return periodAvg(p);
    if (key === 'potential') return r.potential;
    if (key === 'age') return age(p.birth_date);
    if (key.startsWith('a_')) return league.attrs.get(p.id)?.find((x) => x.key === key.slice(2))?.value ?? null;
    return (r as unknown as Record<string, number>)[key] ?? null;
  };

  const own = sp.own === 'free' ? 'free' : sp.own === 'all' ? 'all' : 'owned';
  const club = sp.club && CLUBS[sp.club] ? sp.club : null;
  const status = sp.status === 'playing' || sp.status === 'injured' ? sp.status : null;
  const period = PERIODS.some(([k]) => k === sp.period) ? sp.period! : 'season';
  // Average over the chosen window: the season, or the last N games he actually played.
  const periodAvg = (p: PlayerRow): number | null => {
    if (period === 'season') return p.average;
    const n = Number(period.slice(1));
    const xs = (p.games_log ?? []).map((g) => g[1]).filter((x): x is number => x != null);
    const last = xs.slice(-n);
    return last.length ? Math.round((last.reduce((t, x) => t + x, 0) / last.length) * 10) / 10 : null;
  };
  const pool = own === 'owned' ? league.players : own === 'free' ? league.freeAgents : [...league.players, ...league.freeAgents];
  const rows = pool
    .filter((p) => (!q || p.name.toLowerCase().includes(q) || (p.full_name ?? '').toLowerCase().includes(q))
      && (!line || p.positions.includes(line))
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
      return (y ?? -1) - (x ?? -1) || (league.ratings.get(b.id)!.value - league.ratings.get(a.id)!.value);
    });

  // Extra columns: the sort stat and any filtered stats, as bars.
  const extra = [...new Set([sort, ...filters.map((f) => f[0])])].filter((k) => k !== 'value' && k !== 'potential' && k !== 'age' && k !== 'avg');
  const active = (preset: Record<string, string>) => Object.entries(preset).every(([k, v]) => sp[k as keyof SP] === v);
  const presetHref = (preset: Record<string, string>) => `/players?${new URLSearchParams({ ...(own !== 'owned' ? { own } : {}), ...(line ? { line } : {}), ...preset }).toString()}`;
  const ownHref = (o: string) => `/players?${new URLSearchParams({ ...(o !== 'owned' ? { own: o } : {}), ...(sp.q ? { q: sp.q } : {}), ...(line ? { line } : {}), ...(club ? { club } : {}), ...(status ? { status } : {}), ...(period !== 'season' ? { period } : {}) }).toString()}`;
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
      <div className="row-between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="eyebrow">{own === 'owned' ? 'On a G-Train list' : own === 'free' ? `Nobody owns them · from Keeper, ${FREE_AGENTS_UPDATED.split('-').reverse().join('/')}` : 'Every player'} · {rows.length} shown</span>
          <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>Players</h1>
        </div>
      </div>

      <div className="own-toggle" role="tablist" aria-label="Ownership">
        {([['owned', 'Owned', league.players.length], ['free', 'Not owned', league.freeAgents.length]] as const).map(([k, lab, n]) => (
          <Link key={k} href={ownHref(k)} role="tab" aria-selected={own === k} className={own === k ? 'on' : undefined}>
            {lab}<span>{n}</span>
          </Link>
        ))}
        <Link href={ownHref('all')} role="tab" aria-selected={own === 'all'} className={`all${own === 'all' ? ' on' : ''}`}>All</Link>
      </div>

      <form className="card players-filter" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {own !== 'owned' && <input type="hidden" name="own" value={own} />}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input name="q" defaultValue={sp.q} placeholder="Search a player" className="input" style={{ flex: 1, minWidth: 0 }} aria-label="Search a player" />
          <button type="submit" className="btn dark">Go</button>
        </div>
        <details open={activeFilters > 0 || undefined}>
          <summary className="btn" style={{ listStyle: 'none', cursor: 'pointer', width: 'fit-content' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M6 12h12M10 18h4" /></svg>
            Filters{activeFilters ? ` · ${activeFilters}` : ''}
          </summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end', marginTop: 12 }}>
            {sel('line', 'Position', sp.line ?? '', <><option value="">All positions</option>{LINES.map((l) => <option key={l}>{l}</option>)}</>)}
            {sel('club', 'AFL club', club ?? '', <><option value="">All clubs</option>{Object.entries(CLUBS).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([k, c]) => <option key={k} value={k}>{c.name}</option>)}</>)}
            {sel('status', 'Status', status ?? '', <><option value="">All statuses</option><option value="playing">Playing</option><option value="injured">Injured</option></>)}
            {sel('period', 'Stats from', period, <>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</>)}
            {own !== 'free' && sel('team', 'G-Train team', sp.team ?? '', <><option value="">All teams</option>{league.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</>)}
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
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>Bars are 1–20 against every rostered player on the same line, free agents included on the same scale. Potential is stars out of 5; value is 0–100.</p>

      <div className="table-box">
        <table className="squad" style={{ minWidth: 760 + extra.length * 150 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th><th style={{ width: 90 }}>Pos</th><th style={{ width: 26 }}><span className="sr-only">AFL club</span></th><th>Player</th><th>{own === 'free' ? 'Owned' : 'Owner'}</th>
              <th style={{ width: 44, textAlign: 'center' }}>Age</th><th style={{ width: 60, textAlign: 'center' }} title={periodLabel}>{period === 'season' ? 'Avg' : PERIODS.find(([k]) => k === period)![1].replace(' games', '').replace('Last ', 'L').replace('Last game', 'L1')}</th><th style={{ width: 50, textAlign: 'center' }}>Form</th><th style={{ width: 50, textAlign: 'center' }}>Apps</th>
              {extra.map((k) => <th key={k} style={{ width: 150 }}>{label(k)}</th>)}
              <th style={{ width: 60, textAlign: 'center' }}>Value</th><th style={{ width: 110 }}>Current ability</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const r = league.ratings.get(p.id)!;
              const owner = league.teams.find((t) => t.id === p.team_id);
              return (
                <tr key={p.id}>
                  <td className="mono muted">{i + 1}</td>
                  <td><PosDots positions={p.positions} /></td>
                  <td><ClubDot code={p.afl_club} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Link href={`/players/${p.id}`}>{p.name}</Link>{(p.is_keeper || p.is_rookie_keeper) && <span className="keeper-tag">K</span>}
                    {p.status && <span className="pill" title={STATUS_LABEL[p.status] ?? p.status} style={{ marginLeft: 6, background: '#f3c2b9', color: '#7a1d12' }}>{p.status}</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {owner ? <Link href={`/clubhouse/${owner.id}`} style={{ fontWeight: 400, color: C.muted }}>{owner.name}</Link>
                      : <span className="pill" style={{ background: '#e6f0e1', color: C.green5, fontSize: 11 }}>Free agent{own === 'free' && league.ownedPct.get(p.id) ? ` · ${league.ownedPct.get(p.id)}` : ''}</span>}
                  </td>
                  <td style={{ textAlign: 'center' }} className="mono">{age(p.birth_date) ?? '–'}</td>
                  <td style={{ textAlign: 'center' }}><AvgChip value={periodAvg(p)} /></td>
                  <td style={{ textAlign: 'center' }}><FormArrow form={form(p)} /></td>
                  <td style={{ textAlign: 'center' }}>{p.games ?? '–'}</td>
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
                  <td style={{ textAlign: 'center' }} className="mono">{r.value}</td>
                  <td><Stars value={r.valueStars} label="Current ability" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="muted">No players match those filters. Try lowering a minimum or clearing a filter.</p>}
    </div>
  );
}
