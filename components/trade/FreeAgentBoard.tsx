'use client';
// Trademarket › Free agents: everyone a club can offer a contract to, in the market board's style, but built around
// contracts: who's open now, who's pending (his club can match), who's in a final year and coming, their current deal
// and what a new one costs at market rate.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ClubDot } from '@/components/bits';

export type FaStatus = 'open' | 'pending' | 'final';
export interface FaRow {
  pid: number; faId: number | null; n: string; pos: string[]; club: string | null; age: number | null;
  st: FaStatus; from: string | null; l5: (number | null)[]; avg: number | null; g: number;
  sal: number | null; ends: number | null; tier: string | null;
  v: number; d1: number; d3: number; d5: number;
  offers: number; closes: string | null; mine: boolean; myOffer: boolean;
}
type Key = 'n' | 'age' | 'avg' | 'sal' | 'ends' | 'd3' | 'v' | 'offers';

const ST: Record<FaStatus, [string, string]> = {
  open: ['Open', 'Any club can offer now; best offer wins when it closes'],
  pending: ['Pending', 'In the last six months of his deal; his club can match the best offer'],
  final: ['Final year', 'Contract ends this season; offers open at the mid-season window if he isn’t re-signed'],
};
const POS = ['DEF', 'MID', 'RUC', 'FWD'] as const;
const k$ = (x: number | null) => (x == null ? '—' : `$${x.toLocaleString('en-AU')}k`);
const sc = (x: number) => (x >= 110 ? 'hot' : x >= 90 ? 'good' : x >= 70 ? 'ok' : x >= 50 ? 'low' : 'bad');
const closes = (iso: string | null) => {
  if (!iso) return null;
  const h = Math.round((new Date(iso).getTime() - Date.now()) / 3600000);
  return h <= 0 ? 'Closed' : h < 48 ? `${h}h left` : `${Math.round(h / 24)}d left`;
};

export function FreeAgentBoard({ rows, meId }: { rows: FaRow[]; meId: number | null }) {
  const [show, setShow] = useState<'all' | FaStatus>('all');
  const [pos, setPos] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: Key; asc: boolean }>({ k: 'v', asc: false });

  const counts = useMemo(() => ({ all: rows.length, open: rows.filter((r) => r.st === 'open').length, pending: rows.filter((r) => r.st === 'pending').length, final: rows.filter((r) => r.st === 'final').length }), [rows]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const xs = rows.filter((r) => (show === 'all' || r.st === show) && (pos === 'all' || r.pos.includes(pos)) && (!s || r.n.toLowerCase().includes(s) || (r.from ?? '').toLowerCase().includes(s)));
    const { k, asc } = sort;
    return xs.sort((a, b) => {
      const x = a[k], y = b[k];
      if (x == null && y == null) return b.v - a.v;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
      return (asc ? c : -c) || b.v - a.v;
    });
  }, [rows, show, pos, q, sort]);

  const H = ({ k, children, cls = '', title }: { k: Key; children: React.ReactNode; cls?: string; title?: string }) => {
    const on = sort.k === k;
    return (
      <th className={`${cls}${on ? ' on' : ''}`} aria-sort={on ? (sort.asc ? 'ascending' : 'descending') : 'none'} title={title}>
        <button type="button" onClick={() => setSort(on ? { k, asc: !sort.asc } : { k, asc: k === 'n' || k === 'age' || k === 'ends' })}>{children}<span className="mb-ar">{on ? (sort.asc ? '▲' : '▼') : '↕'}</span></button>
      </th>
    );
  };

  return (
    <section className="th-card mb fa" aria-labelledby="fa-h">
      <div className="mb-top">
        <div>
          <h2 id="fa-h">Free agents</h2>
          <p className="mb-mut">Everyone you can offer a contract to. A new deal costs his market value a season, cheaper the longer it runs (1 yr +10% · 3 yrs flat · 5 yrs −15%), plus the clause premium you pick.</p>
        </div>
        <label className="mb-search"><span className="sr-only">Search free agents</span>
          <input type="search" placeholder="Search a player or club" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="mb-filters">
        <div className="mb-seg" role="group" aria-label="Status">
          {(['all', 'open', 'pending', 'final'] as const).map((k) => (
            <button key={k} type="button" className={show === k ? 'on' : ''} title={k === 'all' ? 'Everyone' : ST[k][1]} onClick={() => setShow(k)}>{k === 'all' ? 'All' : ST[k][0]}<em>{counts[k]}</em></button>
          ))}
        </div>
        <div className="mb-seg" role="group" aria-label="Position">
          <button type="button" className={pos === 'all' ? 'on' : ''} onClick={() => setPos('all')}>All</button>
          {POS.map((p) => <button key={p} type="button" className={pos === p ? 'on' : ''} onClick={() => setPos(p)}>{p}</button>)}
        </div>
      </div>

      <div className="mb-wrap">
        <table className="mb-tbl">
          <thead>
            <tr className="mb-grp"><th colSpan={3} /><th colSpan={2} className="g">Form</th><th colSpan={3} className="g">Current deal</th><th colSpan={2} className="g">New deal a season</th><th colSpan={2} className="g">Offers</th><th /></tr>
            <tr>
              <H k="n" cls="c-pl">Player</H>
              <th className="c-fst">Status</th>
              <H k="age" cls="r c-age">Age</H>
              <th className="c-l5">Last 5</th>
              <H k="avg" cls="r c-a0" title="2026 average">Avg</H>
              <H k="sal" cls="r c-sal" title="Salary a season">Salary</H>
              <H k="ends" cls="r c-ends">Ends</H>
              <th className="c-tier">Clause</th>
              <H k="d3" cls="r c-d3" title="3-year deal at market value, standard clause">3 yrs</H>
              <th className="r c-d5" title="5-year deal at market value, standard clause">5 yrs</th>
              <H k="offers" cls="r c-off">Offers</H>
              <th className="c-cl">Closes</th>
              <th className="c-fa-go" aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={`${r.st}-${r.pid}`} className={`fa-${r.st}`}>
                <td className="c-pl">
                  <Link href={`/players/${r.pid}`} className="mb-who">
                    <ClubDot code={r.club} size={18} />
                    <span><b>{r.n}</b><small>{r.pos.join('/')}{r.from ? ` · ${r.st === 'open' ? 'ex ' : ''}${r.from}` : ''}</small></span>
                  </Link>
                </td>
                <td className="c-fst"><span className={`fa-pill s-${r.st}`} title={ST[r.st][1]}>{ST[r.st][0]}</span></td>
                <td className="r c-age tn">{r.age ?? '–'}</td>
                <td className="c-l5"><span className="mb-l5">{r.l5.length ? r.l5.map((x, j) => <i key={j} className={x == null ? 'na' : sc(x)}>{x ?? '·'}</i>) : <span className="mb-mut">No games</span>}</span></td>
                <td className="r c-a0 tn">{r.avg != null ? <b>{r.avg.toFixed(1)}</b> : '—'}{r.g ? <small>{r.g}g</small> : null}</td>
                <td className="r c-sal tn">{k$(r.sal)}</td>
                <td className="r c-ends tn">{r.ends ?? '—'}</td>
                <td className="c-tier">{r.tier ?? '—'}</td>
                <td className="r c-d3 tn"><b>{k$(r.d3)}</b></td>
                <td className="r c-d5 tn">{k$(r.d5)}</td>
                <td className="r c-off tn">{r.st === 'final' ? '—' : r.offers}</td>
                <td className="c-cl">{r.st === 'open' ? (closes(r.closes) ?? 'Set by commish') : r.st === 'pending' ? 'Club can match' : 'Mid-season'}</td>
                <td className="c-fa-go">
                  {r.mine ? <span className="mb-mut">Yours</span>
                    : r.st !== 'final' && r.faId && meId && closes(r.closes) !== 'Closed' ? <Link href={`/contracts/offer/${r.faId}`} className="mb-sh">{r.myOffer ? 'Raise offer' : 'Make offer'}</Link>
                    : <Link href={`/players/${r.pid}`} className="mb-sh-out">View</Link>}
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={13} className="mb-empty">{show === 'open' ? 'No open free agents right now. Released and unsigned players land here.' : 'No players match those filters.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
