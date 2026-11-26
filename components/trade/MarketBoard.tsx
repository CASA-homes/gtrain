'use client';
// The trademarket board: every player as a stock. Sort by any column (value, weekly/monthly/season move, averages,
// salary, clause), filter by position, age and status, highlight who's available, 20 a page.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ClubDot } from '@/components/bits';
import type { BoardRow, BoardStatus } from '@/lib/market-board';

type Key = 'n' | 'age' | 'a0' | 'a1' | 'sal' | 'v' | 'w' | 'm' | 's' | 'cl' | 'own';
const POS = ['DEF', 'MID', 'RUC', 'FWD'] as const;
const AGES = [['all', 'Any age'], ['u22', 'Under 22'], ['22', '22–25'], ['26', '26–29'], ['30', '30+']] as const;
const SHOW: [string, string][] = [['all', 'All'], ['c', 'Contracted'], ['u', 'Unsigned'], ['f', 'Free agents'], ['p', 'Undrafted'], ['d', 'Draftees']];
const ST_LABEL: Record<BoardStatus, string> = { c: '', u: 'Unsigned', f: 'Free agent', p: 'Undrafted', d: 'Draftee' };

const k$ = (x: number | null) => (x == null ? '—' : `$${x.toLocaleString('en-AU')}k`);
const ktf = (x: number | null) => (x == null ? null : x >= 1000 ? `${(x / 1000).toFixed(1)}k` : `${x}`);
const sc = (x: number) => (x >= 110 ? 'hot' : x >= 90 ? 'good' : x >= 70 ? 'ok' : x >= 50 ? 'low' : 'bad');

function Spark({ v }: { v: number[] }) {
  if (v.length < 2) return <span className="mb-spark" />;
  const lo = Math.min(...v), hi = Math.max(...v);
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * 58 + 1).toFixed(1)},${(19 - ((x - lo) / (hi - lo || 1)) * 16).toFixed(1)}`).join(' ');
  const up = v[v.length - 1] >= v[0];
  return <svg className="mb-spark" viewBox="0 0 60 20" width="60" height="20" aria-hidden="true"><polyline points={pts} fill="none" stroke={up ? '#2e8a55' : '#c2462a'} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}
function Chg({ x }: { x: number | null }) {
  if (x == null) return <span className="mb-mut">—</span>;
  const z = Math.abs(x) < 0.05;
  return <span className={`mb-chg ${z ? '' : x > 0 ? 'up' : 'dn'}`}>{z ? '0.0' : `${x > 0 ? '▲' : '▼'} ${Math.abs(x).toFixed(1)}`}%</span>;
}

export function MarketBoard({ rows, cur, meCode }: { rows: BoardRow[]; cur: number; meCode: string | null }) {
  const [sort, setSort] = useState<{ k: Key; asc: boolean }>({ k: 'v', asc: false });
  const [pos, setPos] = useState<string>('all');
  const [age, setAge] = useState<string>('all');
  const [show, setShow] = useState<string>('all');
  const [hl, setHl] = useState(true);
  const [q, setQ] = useState('');
  const [per, setPer] = useState(20);
  const [page, setPage] = useState(0);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const xs = rows.filter((r) =>
      (pos === 'all' || r.pos.includes(pos)) &&
      (show === 'all' || r.st === show) &&
      (age === 'all' || (r.age != null && (age === 'u22' ? r.age < 22 : age === '22' ? r.age >= 22 && r.age <= 25 : age === '26' ? r.age >= 26 && r.age <= 29 : r.age >= 30))) &&
      (!s || r.n.toLowerCase().includes(s) || (r.own ?? '').toLowerCase() === s));
    const { k, asc } = sort;
    const val = (r: BoardRow) => (k === 'n' ? r.n : k === 'own' ? r.own ?? (r.st === 'f' ? '~FA' : '~~' + r.st) : r[k]);
    // % moves on $5k players are noise: when sorting by a move, players under $10k go to the bottom.
    const pctSort = k === 'w' || k === 'm' || k === 's';
    return xs.sort((a, b) => {
      if (pctSort && (a.v < 10) !== (b.v < 10)) return a.v < 10 ? 1 : -1;
      const x = val(a), y = val(b);
      if (x == null && y == null) return b.v - a.v;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
      return (asc ? c : -c) || b.v - a.v;
    });
  }, [rows, pos, age, show, q, sort]);

  const pages = Math.max(1, Math.ceil(list.length / per));
  const pg = Math.min(page, pages - 1);
  const view = list.slice(pg * per, pg * per + per);
  const reset = () => setPage(0);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.st] = (c[r.st] ?? 0) + 1;
    return c;
  }, [rows]);

  const H = ({ k, children, cls = '', title }: { k: Key; children: React.ReactNode; cls?: string; title?: string }) => {
    const on = sort.k === k;
    return (
      <th className={`${cls}${on ? ' on' : ''}`} aria-sort={on ? (sort.asc ? 'ascending' : 'descending') : 'none'} title={title}>
        <button type="button" onClick={() => { setSort(on ? { k, asc: !sort.asc } : { k, asc: k === 'n' || k === 'age' || k === 'own' }); reset(); }}>
          {children}<span className="mb-ar">{on ? (sort.asc ? '▲' : '▼') : '↕'}</span>
        </button>
      </th>
    );
  };

  return (
    <section className="th-card mb" aria-labelledby="mb-h">
      <div className="mb-top">
        <div>
          <h2 id="mb-h">Player market</h2>
          <p className="mb-mut">Every player priced like a stock. Value is his contract market rate from a rolling six-game average; tap a column to sort.</p>
        </div>
        <label className="mb-search"><span className="sr-only">Search players</span>
          <input type="search" placeholder="Search a player or club code" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} />
        </label>
      </div>

      <div className="mb-filters">
        <div className="mb-seg" role="group" aria-label="Status">
          {SHOW.map(([k, l]) => <button key={k} type="button" className={show === k ? 'on' : ''} onClick={() => { setShow(k); reset(); }}>{l}<em>{counts[k] ?? 0}</em></button>)}
        </div>
        <div className="mb-seg" role="group" aria-label="Position">
          <button type="button" className={pos === 'all' ? 'on' : ''} onClick={() => { setPos('all'); reset(); }}>All</button>
          {POS.map((p) => <button key={p} type="button" className={pos === p ? 'on' : ''} onClick={() => { setPos(p); reset(); }}>{p}</button>)}
        </div>
        <select aria-label="Age" value={age} onChange={(e) => { setAge(e.target.value); reset(); }} className="mb-sel">
          {AGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="mb-tog"><input type="checkbox" checked={hl} onChange={(e) => setHl(e.target.checked)} /><span aria-hidden="true" />Highlight available</label>
      </div>
      {hl && <div className="mb-key"><span><i className="k-f" />Free agent · any club can offer</span><span><i className="k-p" />Undrafted pool</span><span><i className="k-d" />2026 draftee</span></div>}

      <div className="mb-wrap">
        <table className={`mb-tbl${hl ? ' hl' : ''}`}>
          <thead>
            <tr className="mb-grp"><th colSpan={4} /><th colSpan={3} className="g">Form</th><th colSpan={2} className="g">Contract</th><th colSpan={2} className="g">Value</th><th colSpan={3} className="g">Change</th><th /></tr>
            <tr>
              <th className="c-rk">#</th>
              <H k="n" cls="c-pl">Player</H>
              <H k="own" cls="c-own">Owner</H>
              <H k="age" cls="r c-age">Age</H>
              <th className="c-l5">Last 5</th>
              <H k="a1" cls="r c-a1" title={`${cur - 1} season average`}>{`'${String(cur - 1).slice(2)}`} avg</H>
              <H k="a0" cls="r c-a0" title={`${cur} season average`}>{`'${String(cur).slice(2)}`} avg</H>
              <H k="sal" cls="r c-sal" title="Salary he's contracted on">Salary</H>
              <H k="cl" cls="r c-cl" title="Release clause in KT">Clause</H>
              <th className="c-sp" aria-label="Value trend" />
              <H k="v" cls="r c-v" title="Market value now">Now</H>
              <H k="w" cls="r c-w" title="Value move since last round">Week</H>
              <H k="m" cls="r c-m" title="Value move over the last four rounds">Month</H>
              <H k="s" cls="r c-s" title="Value move since the start of the season">Season</H>
              <th className="c-go" aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => {
              const mine = !!meCode && r.own === meCode;
              const under = r.sal != null && r.v > r.sal;
              return (
                <tr key={r.id} className={`st-${r.st}${mine ? ' mine' : ''}`}>
                  <td className="c-rk">{pg * per + i + 1}</td>
                  <td className="c-pl">
                    <Link href={`/players/${r.id}`} className="mb-who">
                      <ClubDot code={r.club} size={18} />
                      <span><b>{r.n}</b><small>{r.pos.join('/')}{r.st !== 'c' ? <em className={`mb-st s-${r.st}`}>{ST_LABEL[r.st]}</em> : r.to ? <> · to {r.to}</> : null}</small></span>
                    </Link>
                  </td>
                  <td className="c-own">{r.own ? <span className={`mb-own${mine ? ' me' : ''}`}>{r.own}</span> : <span className="mb-mut">{r.st === 'f' ? 'FA' : '—'}</span>}</td>
                  <td className="r c-age tn">{r.age ?? '–'}</td>
                  <td className="c-l5"><span className="mb-l5">{r.l5.length ? r.l5.map((x, j) => <i key={j} className={x == null ? 'na' : sc(x)}>{x ?? '·'}</i>) : <span className="mb-mut">No games</span>}</span></td>
                  <td className="r c-a1 tn">{r.a1?.toFixed(1) ?? '—'}</td>
                  <td className="r c-a0 tn"><b>{r.a0?.toFixed(1) ?? '—'}</b>{r.a0 != null && <small>{r.g0}g</small>}</td>
                  <td className="r c-sal tn">{r.sal != null ? <span className={under ? 'mb-bar' : ''} title={under ? 'Worth more than he’s paid' : undefined}>{k$(r.sal)}</span> : <span className="mb-mut">—</span>}</td>
                  <td className="r c-cl tn">{r.cl != null ? <>{ktf(r.cl)}<small> KT</small></> : r.st === 'c' ? <span className="mb-lock" title="No clause: can't be bought">🔒</span> : <span className="mb-mut">—</span>}</td>
                  <td className="c-sp"><Spark v={r.sp} /></td>
                  <td className="r c-v tn"><b>{k$(r.v)}</b></td>
                  <td className="r c-w"><Chg x={r.w} /></td>
                  <td className="r c-m"><Chg x={r.m} /></td>
                  <td className="r c-s"><Chg x={r.s} /></td>
                  <td className="c-go"><Link href={`/players/${r.id}`} aria-label={`Open ${r.n}`}>›</Link></td>
                </tr>
              );
            })}
            {!view.length && <tr><td colSpan={15} className="mb-empty">No players match those filters.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mb-foot">
        <span className="mb-mut">{list.length ? `${pg * per + 1}–${Math.min(list.length, pg * per + per)} of ${list.length}` : '0 players'}</span>
        <div className="mb-pager">
          <button type="button" disabled={pg === 0} onClick={() => setPage(0)} aria-label="First page">«</button>
          <button type="button" disabled={pg === 0} onClick={() => setPage(pg - 1)}>‹ Prev</button>
          <span className="tn">Page {pg + 1} of {pages}</span>
          <button type="button" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>Next ›</button>
        </div>
        <label className="mb-mut">Show <select value={per} onChange={(e) => { setPer(+e.target.value); reset(); }} className="mb-sel sm">{[20, 50, 100].map((n) => <option key={n}>{n}</option>)}</select> a page</label>
      </div>
    </section>
  );
}
