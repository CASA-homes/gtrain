'use client';
// A club's contracts as a compact table. One row per player: full name, club and position/age, contract length,
// a market-value trend line (green rising, red falling), market value and salary, and an arrow that opens the full
// contract details and manage actions. Used twice: players under contract, and expiring / free agents (row tint
// shows which: light red = free agent or leaving, light yellow = expiring).
import Link from 'next/link';
import { ClubDot } from '@/components/bits';
import { AuctionControl, ReleaseButton, TierSelect } from '@/components/contracts/client';
import type { KcSettings, Tier } from '@/lib/contracts';

export type CtStatus = 'final' | 'pending' | 'moving' | 'extended' | 'draft' | 'rookie' | 'contract' | 'claim' | 'none';
export interface CtRow {
  id: number; playerId: number; name: string; positions: string[]; club: string | null; age: number | null; avg: number | null; games: number;
  salary: number | null; base: number; rate: number; start: number | null; end: number | null; yearsLeft: number; tier: Tier; clause: number | null;
  status: CtStatus; statusLabel: string; homeGrown: boolean; extEnd: number | null; extSalary: number | null;
  onAuction: boolean; dead: number; trend: number[]; tone?: 'red' | 'amber' | null;
}

const k$ = (k: number) => `$${Math.round(k)}k`;
const kt = (n: number) => `${Math.round(n).toLocaleString('en-AU')} KT`;
const TAG: Record<CtStatus, string> = { final: 'exp', pending: 'exp', moving: 'exp', claim: 'exp', extended: 'high', draft: 'rook', rookie: 'rook', contract: 'std', none: 'exp' };

function Trend({ v }: { v: number[] }) {
  if (v.length < 2) return <span className="ct-trend muted">—</span>;
  const lo = Math.min(...v), hi = Math.max(...v), up = v[v.length - 1] >= v[0];
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * 44 + 1).toFixed(1)},${(20 - ((x - lo) / (hi - lo || 1)) * 17).toFixed(1)}`).join(' ');
  const pct = v[0] > 0 ? Math.round(((v[v.length - 1] - v[0]) / v[0]) * 100) : 0;
  return (
    <span className={`ct-trend ${up ? 'up' : 'dn'}`} title={`Value ${up ? 'up' : 'down'} ${Math.abs(pct)}% this season`}>
      <svg viewBox="0 0 46 22" width="46" height="22" aria-hidden="true"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span className="sr-only">Value {up ? 'up' : 'down'} {Math.abs(pct)}%</span>
    </span>
  );
}

export function ContractsTable({ title, note, rows, settings, years, canManage, mine, windowOpen, empty }: {
  title: string; note?: string; rows: CtRow[]; settings: KcSettings; years: number[]; canManage: boolean; mine: boolean; windowOpen: boolean; empty?: string;
}) {
  const total = rows.reduce((t, r) => t + (r.salary ?? 0), 0);
  return (
    <section className="ct2">
      <header className="ct2-head">
        <div><h3>{title} <span>{rows.length}</span></h3>{note && <p>{note}</p>}</div>
        {total > 0 && <b>{k$(total)}</b>}
      </header>
      <div className="ct2-cols" aria-hidden="true"><span>Player</span><span>Length</span><span>Trend</span><span>Market</span><span>Salary</span><span /></div>
      {rows.length ? (
        <ul>{rows.map((r) => <Row key={r.id} r={r} years={years} settings={settings} canManage={canManage} mine={mine} windowOpen={windowOpen} />)}</ul>
      ) : <p className="ct2-empty">{empty ?? 'Nobody here.'}</p>}
    </section>
  );
}

function Row({ r, years, settings, canManage, mine, windowOpen }: { r: CtRow; years: number[]; settings: KcSettings; canManage: boolean; mine: boolean; windowOpen: boolean }) {
  const surplus = r.salary != null ? r.rate - r.salary : null;
  const locked = r.status === 'pending' || r.status === 'moving' || r.status === 'claim' || r.status === 'none';
  const finalYr = r.status === 'final' || r.status === 'draft' || r.status === 'pending';
  const until = r.extEnd ?? r.end;
  const yrs = until != null ? Math.max(1, until - years[0] + 1) : null;
  return (
    <li className={r.tone ? `tone-${r.tone}` : undefined}>
      <details className="ct2-item">
        <summary className="ct2-row">
          <span className="ct2-who">
            <b>{r.name}</b>
            <span><ClubDot code={r.club} size={13} />{r.positions.join('/')} · {r.age ?? '–'}</span>
          </span>
          <span className="ct2-c">{yrs != null ? `${yrs}y` : '—'}<em>{until ?? 'none'}</em></span>
          <Trend v={r.trend} />
          <span className="ct2-c">{k$(r.rate)}{surplus != null ? <em className={surplus >= 5 ? 'kc-up' : surplus <= -5 ? 'kc-down' : ''}>{surplus > 0 ? '+' : surplus < 0 ? '−' : '±'}{k$(Math.abs(surplus))}</em> : <em>value</em>}</span>
          <span className="ct2-c ct2-sal">{r.salary != null ? k$(r.salary) : '—'}<em>{r.extSalary != null ? `then ${k$(r.extSalary)}` : r.salary == null ? 'unsigned' : ' '}</em></span>
          <span className="ct2-arrow" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 20 20"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          <span className="sr-only">Show contract details for {r.name}</span>
        </summary>
        <div className="ct2-more">
          <div className="ct2-status"><span className={`kc-tag ${TAG[r.status]}`}>{r.statusLabel}</span>{r.homeGrown && <span className="kc-tag high">Home-grown</span>}</div>
          <dl className="ct2-dl">
            <div><dt>Salary</dt><dd>{r.salary != null ? `${k$(r.salary)} a year` : 'Not contracted'}</dd></div>
            <div><dt>Contract</dt><dd>{r.start != null && r.end != null ? `${r.start}–${r.end}` : '—'}{yrs != null && <span className="kc-pips" style={{ marginLeft: 8 }}>{years.map((y) => <i key={y} className={r.end != null && r.start != null && r.end >= y && r.start <= y ? 'on' : r.extEnd && r.extEnd >= y && r.end != null && y > r.end ? 'next' : ''} />)}</span>}</dd></div>
            {r.extSalary != null && <div><dt>Extension</dt><dd>{k$(r.extSalary)} a year to {r.extEnd}</dd></div>}
            <div><dt>Release clause</dt><dd>{r.clause != null ? `${kt(r.clause)} (${r.tier})` : r.salary == null ? '—' : finalYr ? 'None in final year' : r.tier === 'none' ? 'No clause' : '—'}</dd></div>
            <div><dt>Market value</dt><dd>{k$(r.rate)}{surplus != null ? ` · ${surplus >= 0 ? `${k$(surplus)} under` : `${k$(-surplus)} over`} his salary` : ''}</dd></div>
            <div><dt>2026</dt><dd>{r.avg?.toFixed(1) ?? '–'} avg · {r.games} games</dd></div>
            {r.dead > 0 && !locked && <div><dt>Release cost</dt><dd>{k$(r.dead)} dead money</dd></div>}
          </dl>
          <div className="ct2-acts">
            <Link href={`/players/${r.playerId}`} className="kc-btn small">Player profile</Link>
            {canManage && !locked && <>
              {!finalYr && r.salary != null && <TierSelect contractId={r.id} tier={r.tier} base={r.base} settings={settings} locked={windowOpen} />}
              {r.onAuction ? <Link href="/contracts/market" className="kc-btn small">On auction</Link> : mine && windowOpen && !finalYr ? <AuctionControl contractId={r.id} name={r.name} suggested={Math.round(((r.clause ?? r.rate * 100) * 0.4) / 100) * 100} /> : null}
              <ReleaseButton contractId={r.id} name={r.name} dead={r.dead} />
            </>}
          </div>
        </div>
      </details>
    </li>
  );
}
