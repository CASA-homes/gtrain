'use client';
// The trademarket board: every player as a stock. Sort by any column (value, weekly/monthly/season move, averages), filter by position, age and status, highlight who's available, 20 a page.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ClubDot } from '@/components/bits';
import type { BoardRow, BoardStatus } from '@/lib/market-board';
import type { ShareRules } from '@/lib/shares';
import { ShareSheet, type ShareTarget } from '@/components/trade/ShareSheet';

type Key = 'n' | 'age' | 'a0' | 'a1' | 'v' | 'w' | 'm' | 's' | 'own';
const POS = ['DEF', 'MID', 'RUC', 'FWD'] as const;
const AGES = [['all', 'Any age'], ['u22', 'Under 22'], ['22', '22–25'], ['26', '26–29'], ['30', '30+']] as const;
const SHOW: [string, string, string][] = [['all', 'All', 'Every player'], ['buy', 'Buyable', 'Shares open and some left'], ['prot', 'Protected', 'Under the games needed before his shares open'], ['mine', 'My shares', 'Players you own shares in']];
const ST_LABEL: Record<BoardStatus, string> = { c: '', u: 'Unsigned', f: 'Free agent', p: 'Undrafted', d: 'Draftee' };

const k$ = (x: number | null) => (x == null ? '—' : `$${x.toLocaleString('en-AU')}k`);
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

export interface BoardShares { rules: ShareRules; bank: number; heldCost: number; canTrade: boolean }

export function MarketBoard({ rows, cur, meCode, shares }: { rows: BoardRow[]; cur: number; meCode: string | null; shares: BoardShares }) {
  const R = shares.rules;
  const prot = (r: BoardRow) => r.cg < R.lockGames;
  const buyable = (r: BoardRow) => r.db && !prot(r) && r.sold < R.supply;
  const [sheet, setSheet] = useState<{ mode: 'buy' | 'sell'; t: ShareTarget } | null>(null);
  const open = (r: BoardRow, mode: 'buy' | 'sell') => setSheet({ mode, t: {
    id: r.id, name: r.n, sub: `${r.pos.join('/')}${r.age != null ? ` · ${r.age}` : ''}${r.own ? ` · ${r.own}` : ''} · ${r.cg} games`,
    price: r.v, sold: r.sold, mine: r.mine, myCost: r.myCost, games: r.cg, season: r.s,
  } });
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
      (show === 'all' || (show === 'buy' ? buyable(r) : show === 'prot' ? prot(r) : r.mine > 0)) &&
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, pos, age, show, q, sort]);

  const pages = Math.max(1, Math.ceil(list.length / per));
  const pg = Math.min(page, pages - 1);
  const view = list.slice(pg * per, pg * per + per);
  const reset = () => setPage(0);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, buy: 0, prot: 0, mine: 0 };
    for (const r of rows) { if (buyable(r)) c.buy++; if (prot(r)) c.prot++; if (r.mine > 0) c.mine++; }
    return c;
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <p className="mb-mut">Every player priced like a stock. Value comes from where his last-30-game average ranks, so the best player is always the most expensive and it rewards sustained form, not a hot streak. Tap a column to sort.</p>
        </div>
        <label className="mb-search"><span className="sr-only">Search players</span>
          <input type="search" placeholder="Search a player or club code" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} />
        </label>
      </div>

      <div className="mb-filters">
        <div className="mb-seg" role="group" aria-label="Shares">
          {SHOW.filter(([k]) => k !== 'mine' || counts.mine > 0).map(([k, l, tip]) => <button key={k} type="button" title={k === 'prot' ? `Under ${R.lockGames} games: shares open once he's played ${R.lockGames}` : tip} className={show === k ? 'on' : ''} onClick={() => { setShow(k); reset(); }}>{l}<em>{counts[k] ?? 0}</em></button>)}
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
            <tr className="mb-grp"><th colSpan={3} /><th colSpan={3} className="g">Form</th><th colSpan={2} className="g">Value</th><th colSpan={3} className="g">Change</th><th /><th /></tr>
            <tr>
              <th className="c-rk">#</th>
              <H k="n" cls="c-pl">Player</H>
              <H k="age" cls="r c-age">Age</H>
              <th className="c-l5">Last 5</th>
              <H k="a1" cls="r c-a1" title={`${cur - 1} season average`}>{`'${String(cur - 1).slice(2)}`} avg</H>
              <H k="a0" cls="r c-a0" title={`${cur} season average`}>{`'${String(cur).slice(2)}`} avg</H>
              <th className="c-sp" aria-label="Value trend" />
              <H k="v" cls="r c-v" title="Market value now">Now</H>
              <H k="w" cls="r c-w" title="Value move since last round">Week</H>
              <H k="m" cls="r c-m" title="Value move over the last four rounds">Month</H>
              <H k="s" cls="r c-s" title="Value move since the start of the season">Season</H>
              <th className="c-sh" title={`${R.supply} shares a player, max ${R.maxClub} per club`}>Shares</th>
              <th className="c-go" aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => {
              const mine = !!meCode && r.own === meCode;
              return (
                <tr key={r.id} className={`st-${r.st}${mine ? ' mine' : ''}`}>
                  <td className="c-rk">{pg * per + i + 1}</td>
                  <td className="c-pl">
                    <Link href={`/players/${r.id}`} className="mb-who">
                      <ClubDot code={r.club} size={18} />
                      <span><b>{r.n}</b><small>{r.pos.join('/')}{r.st !== 'c' ? <em className={`mb-st s-${r.st}`}>{ST_LABEL[r.st]}</em> : r.to ? <> · to {r.to}</> : null}{prot(r) && <em className="mb-st s-x">Protected</em>}</small></span>
                    </Link>
                  </td>
                  <td className="r c-age tn">{r.age ?? '–'}</td>
                  <td className="c-l5"><span className="mb-l5">{r.l5.length ? r.l5.map((x, j) => <i key={j} className={x == null ? 'na' : sc(x)}>{x ?? '·'}</i>) : <span className="mb-mut">No games</span>}</span></td>
                  <td className="r c-a1 tn">{r.a1?.toFixed(1) ?? '—'}</td>
                  <td className="r c-a0 tn"><b>{r.a0?.toFixed(1) ?? '—'}</b>{r.a0 != null && <small>{r.g0}g</small>}</td>
                  <td className="c-sp"><Spark v={r.sp} /></td>
                  <td className="r c-v tn"><b>{k$(r.v)}</b></td>
                  <td className="r c-w"><Chg x={r.w} /></td>
                  <td className="r c-m"><Chg x={r.m} /></td>
                  <td className="r c-s"><Chg x={r.s} /></td>
                  <td className="c-sh">{r.mine > 0 && shares.canTrade
                    ? <button type="button" className="mb-sh mine" onClick={() => open(r, 'sell')} title={`You own ${r.mine}. Sell or check your return.`}>You {r.mine} · Sell</button>
                    : prot(r) ? <span className="mb-sh-lock" title={`Protected: ${r.cg} of ${R.lockGames} games`}>🔒 {r.cg}/{R.lockGames}</span>
                    : !r.db ? <span className="mb-sh-out">—</span>
                    : r.sold >= R.supply ? <span className="mb-sh-out">Sold out</span>
                    : shares.canTrade && R.open ? <button type="button" className="mb-sh" onClick={() => open(r, 'buy')}>{R.supply - r.sold} left · Buy</button>
                    : <span className="mb-sh-out">{R.supply - r.sold} left</span>}</td>
                  <td className="c-go"><Link href={`/players/${r.id}`} aria-label={`Open ${r.n}`}>›</Link></td>
                </tr>
              );
            })}
            {!view.length && <tr><td colSpan={13} className="mb-empty">No players match those filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {sheet && <ShareSheet mode={sheet.mode} t={sheet.t} rules={R} bank={shares.bank} heldCost={shares.heldCost} onClose={() => setSheet(null)} />}

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
