'use client';
// A club's contracts as a compact list, split into: leaving / free agency, coming out of contract, under contract.
// Every row shows contract value and length. Line filter and a sort; manage actions tuck into each row.
import Link from 'next/link';
import { useMemo } from 'react';
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
const GROUPS: { key: string; title: string; note: string; tone: 'red' | 'amber' | 'green'; has: (r: CtRow) => boolean }[] = [
  { key: 'out', title: 'Leaving or heading to free agency', note: 'Pending free agents, players agreed to move at season end, and clauses waiting on you.', tone: 'red', has: (r) => r.status === 'pending' || r.status === 'moving' || r.status === 'claim' },
  { key: 'final', title: 'Coming out of contract', note: 'Final year, draftees included. Extend before mid-season week or rivals can bid on them.', tone: 'amber', has: (r) => r.status === 'final' || r.status === 'draft' },
  { key: 'in', title: 'Under contract', note: 'Signed beyond this season, including extensions.', tone: 'green', has: () => true },
];
const TAG: Record<CtStatus, string> = { final: 'exp', pending: 'exp', moving: 'exp', claim: 'exp', extended: 'high', draft: 'rook', rookie: 'rook', contract: 'std' };

export function ContractsTable({ rows, settings, years, canManage, mine, windowOpen }: {
  rows: CtRow[]; settings: KcSettings; years: number[]; canManage: boolean; mine: boolean; windowOpen: boolean;
}) {
  const groups = useMemo(() => {
    const pool = [...rows].sort((a, b) => b.salary - a.salary);
    const used = new Set<number>();
    return GROUPS.map((g) => {
      const list = pool.filter((r) => !used.has(r.id) && g.has(r));
      list.forEach((r) => used.add(r.id));
      return { ...g, list };
    });
  }, [rows]);

  const total = rows.reduce((t, r) => t + r.salary, 0);
  const totalRate = rows.reduce((t, r) => t + r.rate, 0);

  return (
    <div className="ct">
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
          <div className="ct-head" aria-hidden="true"><span>Player</span><span>Length</span><span>Clause</span><span>Market</span><span>Salary</span></div>
          <ul>
            {g.list.map((r) => <Row key={r.id} r={r} years={years} settings={settings} canManage={canManage} mine={mine} windowOpen={windowOpen} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

const ktShort = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`);

function Row({ r, years, settings, canManage, mine, windowOpen }: { r: CtRow; years: number[]; settings: KcSettings; canManage: boolean; mine: boolean; windowOpen: boolean }) {
  const surplus = r.rate - r.salary;
  const locked = r.status === 'pending' || r.status === 'moving' || r.status === 'claim';
  const finalYr = r.status === 'final' || r.status === 'draft' || r.status === 'pending';
  const until = r.extEnd ?? r.end;
  const yrs = Math.max(1, until - years[0] + 1);
  const showTag = r.status !== 'contract';
  return (
    <li>
      <details className="ct-item">
        <summary className="ct-line">
          <span className="ct-who">
            <b>{r.name}</b>
            <span>{r.positions.join('/')} · {r.age ?? '–'}y · {r.avg?.toFixed(1) ?? '–'}</span>
            {showTag && <i className={`ct-flag ${TAG[r.status]}`}>{r.statusLabel}</i>}
          </span>
          <span className="ct-c ct-len">{yrs}y<em>{until}</em></span>
          <span className="ct-c">{r.clause != null ? ktShort(r.clause) : <span className="muted">{finalYr ? '—' : r.tier === 'none' ? 'None' : '—'}</span>}<em>{r.clause != null ? 'KT' : r.tier === 'high' ? 'high' : ''}</em></span>
          <span className={`ct-c ${surplus >= 5 ? 'kc-up' : surplus <= -5 ? 'kc-down' : ''}`}>{k$(r.rate)}<em>{surplus > 0 ? '+' : surplus < 0 ? '−' : '±'}{k$(Math.abs(surplus))}</em></span>
          <span className="ct-c ct-sal">{k$(r.salary)}<em>{r.extSalary != null ? `then ${k$(r.extSalary)}` : r.homeGrown ? 'HG' : '\u00a0'}</em></span>
        </summary>
        <div className="ct-more">
          <div className="ct-more-row">
            <span className="kc-pips" role="img" aria-label={`Contracted to ${until}`}>
              {years.map((y) => <i key={y} className={r.end >= y && r.start <= y ? 'on' : r.extEnd && r.extEnd >= y && y > r.end ? 'next' : ''} />)}
            </span>
            <span>{r.club ?? ''}{r.homeGrown ? ' · home-grown' : ''} · clause {r.tier === 'none' ? 'off' : r.tier}{r.clause != null ? ` (${kt(r.clause)})` : finalYr ? ' (none in final year)' : ''}</span>
            <Link href={`/players/${r.playerId}`} className="kc-link">Profile →</Link>
          </div>
          {canManage && !locked && (
            <div className="ct-acts">
              {!finalYr && <TierSelect contractId={r.id} tier={r.tier} base={r.base} settings={settings} locked={windowOpen} />}
              {r.onAuction ? <Link href="/contracts/market" className="kc-btn small">On auction</Link> : mine && windowOpen && !finalYr ? <AuctionControl contractId={r.id} name={r.name} suggested={Math.round(((r.clause ?? r.rate * 100) * 0.4) / 100) * 100} /> : null}
              <ReleaseButton contractId={r.id} name={r.name} dead={r.dead} />
            </div>
          )}
        </div>
      </details>
    </li>
  );
}
