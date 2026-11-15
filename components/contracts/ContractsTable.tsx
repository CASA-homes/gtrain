'use client';
// A club's contracts as a compact list, split into: leaving / free agency, coming out of contract, under contract.
// Every row shows contract value and length. Line filter and a sort; manage actions tuck into each row.
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

const k$ = (k: number) => `$${Math.round(k)}k`;
const kt = (n: number) => `${Math.round(n).toLocaleString('en-AU')} KT`;
const LINES = ['DEF', 'MID', 'RUC', 'FWD'] as const;
type SortKey = 'salary' | 'avg' | 'age' | 'end' | 'value';
const SORTS: [SortKey, string][] = [['salary', 'Salary'], ['avg', 'Average'], ['end', 'Contract end'], ['value', 'Value vs market'], ['age', 'Age']];

const GROUPS: { key: string; title: string; note: string; tone: 'red' | 'amber' | 'green'; has: (r: CtRow) => boolean }[] = [
  { key: 'out', title: 'Leaving or heading to free agency', note: 'Pending free agents, players agreed to move at season end, and clauses waiting on you.', tone: 'red', has: (r) => r.status === 'pending' || r.status === 'moving' || r.status === 'claim' },
  { key: 'final', title: 'Coming out of contract', note: 'Final year, draftees included. Extend before mid-season week or rivals can bid on them.', tone: 'amber', has: (r) => r.status === 'final' || r.status === 'draft' },
  { key: 'in', title: 'Under contract', note: 'Signed beyond this season, including extensions.', tone: 'green', has: () => true },
];
const TAG: Record<CtStatus, string> = { final: 'exp', pending: 'exp', moving: 'exp', claim: 'exp', extended: 'high', draft: 'rook', rookie: 'rook', contract: 'std' };

export function ContractsTable({ rows, settings, years, canManage, mine, windowOpen }: {
  rows: CtRow[]; settings: KcSettings; years: number[]; canManage: boolean; mine: boolean; windowOpen: boolean;
}) {
  const [line, setLine] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('salary');

  const groups = useMemo(() => {
    const val = (r: CtRow) => {
      switch (sort) {
        case 'avg': return -(r.avg ?? 0);
        case 'age': return r.age ?? 99;
        case 'end': return (r.extEnd ?? r.end) * 1000 - r.salary;
        case 'value': return -(r.rate - r.salary);
        default: return -r.salary;
      }
    };
    const pool = rows.filter((r) => !line || r.positions.includes(line)).sort((a, b) => val(a) - val(b));
    const used = new Set<number>();
    return GROUPS.map((g) => {
      const list = pool.filter((r) => !used.has(r.id) && g.has(r));
      list.forEach((r) => used.add(r.id));
      return { ...g, list };
    });
  }, [rows, line, sort]);

  const total = rows.reduce((t, r) => t + r.salary, 0);
  const totalRate = rows.reduce((t, r) => t + r.rate, 0);

  return (
    <div className="ct">
      <div className="ct-bar">
        <div className="kc-seg" role="group" aria-label="Line">
          <button type="button" aria-pressed={!line} onClick={() => setLine(null)}>All</button>
          {LINES.map((l) => <button key={l} type="button" aria-pressed={line === l} onClick={() => setLine(line === l ? null : l)}>{l}</button>)}
        </div>
        <label className="ct-sort">Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
      </div>

      <div className="ct-sum">
        <span><b>{rows.length}</b> contracts</span>
        <span><b>{k$(total)}</b> salary</span>
        <span className={totalRate >= total ? 'kc-up' : 'kc-down'}><b>{totalRate >= total ? '+' : '−'}{k$(Math.abs(totalRate - total))}</b> vs market</span>
      </div>

      {groups.map((g) => g.list.length > 0 && (
        <section key={g.key} className={`ct-group ${g.tone}`} aria-labelledby={`ctg-${g.key}`}>
          <header>
            <h3 id={`ctg-${g.key}`}>{g.title} <span>{g.list.length}</span></h3>
            <p>{g.note}</p>
          </header>
          <div className="ct-head" aria-hidden="true"><span>Player</span><span>Age</span><span>Avg</span><span>Salary</span><span>Contract</span><span>Market</span><span>Clause</span><span>Status</span><span /></div>
          <ul>
            {g.list.map((r) => <Row key={r.id} r={r} years={years} settings={settings} canManage={canManage} mine={mine} windowOpen={windowOpen} />)}
          </ul>
        </section>
      ))}
      {groups.every((g) => g.list.length === 0) && <p className="kc-sub">No {line} players on contract.</p>}
    </div>
  );
}

function Row({ r, years, settings, canManage, mine, windowOpen }: { r: CtRow; years: number[]; settings: KcSettings; canManage: boolean; mine: boolean; windowOpen: boolean }) {
  const surplus = r.rate - r.salary;
  const locked = r.status === 'pending' || r.status === 'moving' || r.status === 'claim';
  const finalYr = r.status === 'final' || r.status === 'draft' || r.status === 'pending';
  const until = r.extEnd ?? r.end;
  const yrs = Math.max(1, until - years[0] + 1);
  const clauseText = r.clause != null ? kt(r.clause) : finalYr ? 'None' : r.tier === 'none' ? 'No clause' : r.tier === 'protected' ? 'Protected' : '—';
  return (
    <li className="ct-row">
      <div className="ct-who">
        <Link href={`/players/${r.playerId}`}>{r.name}</Link>
        <span>{r.positions.join('/')}{r.club ? ` · ${r.club}` : ''}{r.homeGrown ? ' · home-grown' : ''}</span>
      </div>
      <div className="ct-meta ct-m1">
        <span className="ct-age"><em>Age</em>{r.age ?? '–'}</span>
        <span className="ct-avg"><em>Avg</em>{r.avg?.toFixed(1) ?? '–'}</span>
      </div>
      <div className="ct-sal"><b>{k$(r.salary)}</b>{r.extSalary != null && <span>then {k$(r.extSalary)}</span>}</div>
      <div className="ct-len">
        <span className="kc-pips" role="img" aria-label={`Contracted to ${until}`}>
          {years.map((y) => <i key={y} className={r.end >= y && r.start <= y ? 'on' : r.extEnd && r.extEnd >= y && y > r.end ? 'next' : ''} />)}
        </span>
        <span>to {until} · {yrs} yr{yrs === 1 ? '' : 's'}</span>
      </div>
      <div className="ct-meta ct-m2">
        <span className="ct-mkt"><em>Market</em>{k$(r.rate)} <span className={surplus >= 5 ? 'kc-up' : surplus <= -5 ? 'kc-down' : 'muted'}>({surplus > 0 ? '+' : surplus < 0 ? '−' : '±'}{k$(Math.abs(surplus))})</span></span>
        <span className="ct-cl"><em>Clause</em>{clauseText}</span>
      </div>
      <div className="ct-st"><span className={`kc-tag ${TAG[r.status]}`}>{r.statusLabel}</span></div>
      {canManage && !locked ? (
        <details className="ct-manage">
          <summary aria-label={`Manage ${r.name}`}>Manage</summary>
          <div>
            {!finalYr && <TierSelect contractId={r.id} tier={r.tier} base={r.base} settings={settings} locked={windowOpen} />}
            {r.onAuction ? <Link href="/contracts/market" className="kc-btn small">On auction</Link> : mine && windowOpen && !finalYr ? <AuctionControl contractId={r.id} name={r.name} suggested={Math.round(((r.clause ?? r.rate * 100) * 0.4) / 100) * 100} /> : null}
            <ReleaseButton contractId={r.id} name={r.name} dead={r.dead} />
          </div>
        </details>
      ) : <span className="ct-noman" />}
    </li>
  );
}
