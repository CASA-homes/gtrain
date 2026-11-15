'use client';
// My Contracts: every contract at a club, filterable by line, status, age, average, length, salary and market value,
// sortable by any column. Actions (clause level, auction, release) appear for the club's own coach and the commish.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AuctionControl, ReleaseButton, TierSelect } from '@/components/contracts/client';
import type { KcSettings, Tier } from '@/lib/contracts';

export type CtStatus = 'final' | 'pending' | 'moving' | 'extended' | 'draft' | 'rookie' | 'contract' | 'claim';
export interface CtRow {
  id: number; playerId: number; name: string; positions: string[]; club: string | null; age: number | null; avg: number | null; games: number;
  salary: number; base: number; rate: number; start: number; end: number; yearsLeft: number; tier: Tier; clause: number | null;
  status: CtStatus; statusLabel: string; homeGrown: boolean; extEnd: number | null; extSalary: number | null;
  onAuction: boolean; dead: number;
}

const money = (k: number) => `$${(Math.round(k) * 1000).toLocaleString('en-AU')}`;
const kt = (n: number) => `${Math.round(n).toLocaleString('en-AU')} KT`;
const LINES = ['DEF', 'MID', 'RUC', 'FWD'] as const;
const STATUS_CHIPS: [CtStatus | 'homegrown' | 'bargain' | 'overpaid', string][] = [
  ['final', 'Final year'], ['pending', 'Pending FA'], ['extended', 'Extended'], ['moving', 'Leaving at season end'], ['claim', 'Clause paid'],
  ['draft', 'Draft deal'], ['rookie', 'Rookie deal'], ['homegrown', 'Home-grown'], ['bargain', 'Bargain'], ['overpaid', 'Overpaid'],
];
const TAG: Record<CtStatus, string> = { final: 'exp', pending: 'exp', moving: 'exp', claim: 'exp', extended: 'high', draft: 'rook', rookie: 'rook', contract: 'std' };

type SortKey = 'name' | 'age' | 'avg' | 'salary' | 'rate' | 'surplus' | 'years' | 'clause';
type Range = [string, string];
const inRange = (v: number | null, [lo, hi]: Range) => {
  if (lo === '' && hi === '') return true;
  if (v == null) return false;
  return (lo === '' || v >= Number(lo)) && (hi === '' || v <= Number(hi));
};

export function ContractsTable({ rows, settings, years, canManage, mine, windowOpen }: {
  rows: CtRow[]; settings: KcSettings; years: number[]; canManage: boolean; mine: boolean; windowOpen: boolean;
}) {
  const [q, setQ] = useState('');
  const [line, setLine] = useState<string | null>(null);
  const [chips, setChips] = useState<Set<string>>(new Set());
  const [age, setAge] = useState<Range>(['', '']);
  const [avg, setAvg] = useState<Range>(['', '']);
  const [len, setLen] = useState<Range>(['', '']);
  const [sal, setSal] = useState<Range>(['', '']);
  const [val, setVal] = useState<Range>(['', '']);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'salary', dir: -1 });
  const [showFilters, setShowFilters] = useState(false);

  const toggle = (k: string) => setChips((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const clear = () => { setQ(''); setLine(null); setChips(new Set()); setAge(['', '']); setAvg(['', '']); setLen(['', '']); setSal(['', '']); setVal(['', '']); };
  const preset = (p: 'young' | 'old' | 'bargains' | 'expiring' | 'stars') => {
    clear();
    if (p === 'young') setAge(['', '24']);
    if (p === 'old') setAge(['30', '']);
    if (p === 'bargains') setChips(new Set(['bargain']));
    if (p === 'expiring') setChips(new Set(['final', 'pending']));
    if (p === 'stars') setAvg(['100', '']);
  };

  const shown = useMemo(() => {
    const out = rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (line && !r.positions.includes(line)) return false;
      if (chips.size) {
        const hit = [...chips].some((c) => c === 'homegrown' ? r.homeGrown : c === 'bargain' ? r.rate - r.salary >= 5 : c === 'overpaid' ? r.salary - r.rate >= 5 : r.status === c);
        if (!hit) return false;
      }
      return inRange(r.age, age) && inRange(r.avg, avg) && inRange(r.yearsLeft, len) && inRange(r.salary, sal) && inRange(r.rate, val);
    });
    const get = (r: CtRow): number | string => {
      switch (sort.key) {
        case 'name': return r.name;
        case 'age': return r.age ?? 0;
        case 'avg': return r.avg ?? 0;
        case 'rate': return r.rate;
        case 'surplus': return r.rate - r.salary;
        case 'years': return r.yearsLeft + (r.extEnd ? r.extEnd - r.end : 0);
        case 'clause': return r.clause ?? -1;
        default: return r.salary;
      }
    };
    return out.sort((a, b) => { const x = get(a), y = get(b); return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir; });
  }, [rows, q, line, chips, age, avg, len, sal, val, sort]);

  const activeFilters = [age, avg, len, sal, val].filter(([a, b]) => a !== '' || b !== '').length + chips.size + (line ? 1 : 0) + (q ? 1 : 0);
  const total = shown.reduce((t, r) => t + r.salary, 0);
  const totalRate = shown.reduce((t, r) => t + r.rate, 0);
  const ages = shown.map((r) => r.age).filter((x): x is number => x != null);
  const avgs = shown.map((r) => r.avg).filter((x): x is number => x != null);

  const th = (k: SortKey, label: string, right?: boolean) => <Th k={k} label={label} right={right} sort={sort} setSort={setSort} />;

  return (
    <div className="kc-ct">
      <div className="kc-ct-bar">
        <input className="kc-search" type="search" placeholder="Search players" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
        <div className="kc-seg" role="group" aria-label="Line">
          <button type="button" aria-pressed={!line} onClick={() => setLine(null)}>All</button>
          {LINES.map((l) => <button key={l} type="button" aria-pressed={line === l} onClick={() => setLine(line === l ? null : l)}>{l}</button>)}
        </div>
        <button type="button" className={`kc-btn small${showFilters ? ' dark' : ''}`} aria-expanded={showFilters} onClick={() => setShowFilters((x) => !x)}>
          Filters{activeFilters ? ` · ${activeFilters}` : ''}
        </button>
        {activeFilters > 0 && <button type="button" className="kc-link" onClick={clear}>Clear</button>}
      </div>

      <div className="kc-presets" role="group" aria-label="Quick filters">
        <span>Quick:</span>
        <button type="button" onClick={() => preset('expiring')}>Expiring</button>
        <button type="button" onClick={() => preset('bargains')}>Bargains</button>
        <button type="button" onClick={() => preset('young')}>24 and under</button>
        <button type="button" onClick={() => preset('old')}>30+</button>
        <button type="button" onClick={() => preset('stars')}>100+ average</button>
      </div>

      {showFilters && (
        <div className="kc-filters">
          <div className="kc-chips" role="group" aria-label="Status">
            {STATUS_CHIPS.map(([k, label]) => <button key={k} type="button" aria-pressed={chips.has(k)} onClick={() => toggle(k)}>{label}</button>)}
          </div>
          <div className="kc-ranges">
            <RangeField label="Age" v={age} set={setAge} />
            <RangeField label="Average" v={avg} set={setAvg} step={0.5} />
            <RangeField label="Years left" v={len} set={setLen} />
            <RangeField label="Salary" unit="$k" v={sal} set={setSal} />
            <RangeField label="Market value" unit="$k" v={val} set={setVal} />
          </div>
        </div>
      )}

      <div className="kc-ct-sum" aria-live="polite">
        <span><b>{shown.length}</b> of {rows.length} players</span>
        <span>Salary <b>{money(total)}</b></span>
        <span>Market value <b>{money(totalRate)}</b></span>
        <span className={totalRate - total >= 0 ? 'kc-up' : 'kc-down'}>{totalRate - total >= 0 ? 'Under market by' : 'Over market by'} <b>{money(Math.abs(totalRate - total))}</b></span>
        {ages.length > 0 && <span>Avg age <b>{(ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1)}</b></span>}
        {avgs.length > 0 && <span>Avg score <b>{(avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(1)}</b></span>}
      </div>

      <div className="kc-table-box">
        <table className="kc-table" style={{ minWidth: canManage ? 1180 : 980 }}>
          <thead><tr>
            {th('name', "Player")}{th('age', "Age", true)}{th('avg', "Avg", true)}{th('salary', "Salary", true)}
            {th('rate', "Market", true)}{th('surplus', "+/− market", true)}{th('years', `${years[0]}–${years[years.length - 1] % 100}`)}
            <th>Clause</th>{th('clause', "Clause KT", true)}<th>Status</th>{canManage && <th><span className="sr-only">Actions</span></th>}
          </tr></thead>
          <tbody>
            {shown.map((r) => {
              const surplus = r.rate - r.salary;
              const locked = r.status === 'pending' || r.status === 'moving' || r.status === 'claim';
              return (
                <tr key={r.id}>
                  <td><Link href={`/players/${r.playerId}`} className="name" style={{ color: 'inherit' }}>{r.name}</Link>
                    <div className="meta">{r.positions.join('/')}{r.club ? ` · ${r.club}` : ''}{r.homeGrown ? ' · home-grown' : ''}</div></td>
                  <td className="r">{r.age ?? '–'}</td>
                  <td className="r">{r.avg?.toFixed(1) ?? '–'}<div className="meta">{r.games}g</div></td>
                  <td className="r" style={{ fontWeight: 700 }}>{money(r.salary)}{r.extSalary != null && <div className="meta">then {money(r.extSalary)}</div>}</td>
                  <td className="r">{money(r.rate)}</td>
                  <td className={`r ${surplus >= 5 ? 'kc-up' : surplus <= -5 ? 'kc-down' : ''}`} style={{ fontWeight: 600 }}>{surplus > 0 ? '+' : surplus < 0 ? '−' : ''}{money(Math.abs(surplus))}</td>
                  <td><span className="kc-pips" role="img" aria-label={`Contracted to ${r.extEnd ?? r.end}`}>
                    {years.map((y) => <i key={y} className={r.end >= y && r.start <= y ? 'on' : r.extEnd && r.extEnd >= y && y > r.end ? 'next' : ''} />)}
                  </span><div className="meta">to {r.extEnd ?? r.end}</div></td>
                  <td>{canManage && !locked && r.status !== 'final' ? <TierSelect contractId={r.id} tier={r.tier} base={r.base} settings={settings} locked={windowOpen} />
                    : <span className={`kc-tag ${r.tier === 'none' ? 'safe' : r.tier === 'high' ? 'high' : 'std'}`}>{r.status === 'final' || r.status === 'pending' || r.status === 'draft' ? 'n/a (final yr)' : r.tier === 'none' ? 'No clause' : r.tier === 'high' ? 'High' : r.tier === 'protected' ? 'Protected' : 'Standard'}</span>}</td>
                  <td className="r">{r.clause == null ? '—' : kt(r.clause)}</td>
                  <td><span className={`kc-tag ${TAG[r.status]}`}>{r.statusLabel}</span></td>
                  {canManage && <td className="r"><span style={{ display: 'inline-flex', gap: 6, alignItems: 'flex-start' }}>
                    {locked ? <span className="meta">Spoken for</span> : <>
                      {r.onAuction ? <Link href="/contracts/market" className="kc-btn small">On auction</Link> : mine && windowOpen ? <AuctionControl contractId={r.id} name={r.name} suggested={Math.round(((r.clause ?? r.rate * 100) * 0.4) / 100) * 100} /> : null}
                      <ReleaseButton contractId={r.id} name={r.name} dead={r.dead} />
                    </>}
                  </span></td>}
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={canManage ? 11 : 10} className="meta" style={{ padding: 20, textAlign: 'center' }}>No players match. <button type="button" className="kc-link" onClick={clear}>Clear filters</button></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ k, label, right, sort, setSort }: { k: SortKey; label: string; right?: boolean; sort: { key: SortKey; dir: 1 | -1 }; setSort: (f: (s: { key: SortKey; dir: 1 | -1 }) => { key: SortKey; dir: 1 | -1 }) => void }) {
  return (
    <th className={right ? 'r' : undefined} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="kc-sort" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : (k === 'name' ? 1 : -1) }))}>
        {label}{sort.key === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
}

function RangeField({ label, v, set, step = 1, unit }: { label: string; v: Range; set: (r: Range) => void; step?: number; unit?: string }) {
  return (
    <fieldset className="kc-range">
      <legend>{label}{unit ? <em> {unit}</em> : null}</legend>
      <input type="number" inputMode="decimal" step={step} placeholder="min" value={v[0]} onChange={(e) => set([e.target.value, v[1]])} aria-label={`${label} minimum`} />
      <span aria-hidden="true">–</span>
      <input type="number" inputMode="decimal" step={step} placeholder="max" value={v[1]} onChange={(e) => set([v[0], e.target.value])} aria-label={`${label} maximum`} />
    </fieldset>
  );
}
