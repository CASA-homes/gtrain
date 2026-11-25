'use client';
// A club's contracts as a compact table. One row per player: full name, club and position/age, contract length,
// a market-value trend line (green rising, red falling), market value and salary, and an arrow that opens the full
// contract details and manage actions. Row tint: amber = unsigned, blue = free agent, purple = signed with another
// club for next season, red = clause paid, light yellow = final year.
import Link from 'next/link';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ClubDot } from '@/components/bits';
import { AuctionControl, ExtendControl, ProvisionalControls, ReleaseButton, useRun } from '@/components/contracts/client';
import { buyClause } from '@/app/(app)/contracts/actions';
import { offerKtForPlayer } from '@/app/(app)/market/desk/actions';
import { openUnsigned } from '@/app/(app)/contracts/actions';
import type { KcSettings, Tier } from '@/lib/contracts';

export type CtStatus = 'final' | 'pending' | 'moving' | 'extended' | 'draft' | 'rookie' | 'contract' | 'claim' | 'none';
export interface CtRow {
  id: number; playerId: number; name: string; positions: string[]; club: string | null; age: number | null; avg: number | null; games: number;
  salary: number | null; base: number; rate: number; start: number | null; end: number | null; yearsLeft: number; tier: Tier; clause: number | null;
  status: CtStatus; statusLabel: string; provisional?: boolean; homeGrown: boolean; extEnd: number | null; extSalary: number | null;
  onAuction: boolean; lockedUntil?: string | null; dead: number; deadLater?: number; deadYears?: number; releaseFee?: number; trend: number[]; tone?: 'red' | 'amber' | 'unsigned' | 'fa' | 'moving' | null; movingTo?: string | null;
}

/** What the viewing coach needs to pay a clause on another club's player. Null when it's your own club.
 *  capRoom is for the season he'd join you in (this one if a window is open, otherwise next). */
export interface BuyInfo { bank: number; windowOpen: boolean; maxBuys: number; used: number; capRoom: number; joinSeason: number; seasonCap: number; clubName: string; maxYears: number; season: number }

/** Market salary for a deal of this length (mirrors kc_length_factor): short deals cost a little more. */
const LEN: Record<number, number> = { 1: 1.06, 2: 1.03, 3: 1, 4: 0.967, 5: 0.933 };
export const clauseSalary = (rate: number, current: number, years: number) => Math.max(current, Math.round(rate * (LEN[years] ?? 1)));

const k$ = (k: number) => `$${Math.round(k)}k`;
const ktShort = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
const kt = (n: number) => `${Math.round(n).toLocaleString('en-AU')} KT`;
const TAG: Record<CtStatus, string> = { final: 'exp', pending: 'exp', moving: 'exp', claim: 'exp', extended: 'high', draft: 'rook', rookie: 'rook', contract: 'std', none: 'exp' };

function Trend({ v }: { v: number[] }) {
  if (v.length < 2) return <span className="ct-trend muted">—</span>;
  const lo = Math.min(...v), hi = Math.max(...v), up = v[v.length - 1] >= v[0];
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * 30 + 1).toFixed(1)},${(17 - ((x - lo) / (hi - lo || 1)) * 14).toFixed(1)}`).join(' ');
  const pct = v[0] > 0 ? Math.round(((v[v.length - 1] - v[0]) / v[0]) * 100) : 0;
  return (
    <span className={`ct-trend ${up ? 'up' : 'dn'}`} title={`Value ${up ? 'up' : 'down'} ${Math.abs(pct)}% this season`}>
      <svg viewBox="0 0 32 18" width="32" height="18" aria-hidden="true"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span className="sr-only">Value {up ? 'up' : 'down'} {Math.abs(pct)}%</span>
    </span>
  );
}

type SortKey = 'name' | 'age' | 'len' | 'trend' | 'market' | 'clause' | 'salary';
const COLS: [SortKey, string][] = [['age', 'Age'], ['len', 'Yrs'], ['trend', 'Trend'], ['market', 'Market'], ['clause', 'Clause'], ['salary', 'Salary']];
const trendPct = (v: number[]) => (v.length > 1 && v[0] > 0 ? (v[v.length - 1] - v[0]) / v[0] : 0);
const sortVal = (r: CtRow, k: SortKey): number | string => {
  switch (k) {
    case 'name': return r.name.toLowerCase();
    case 'age': return r.age ?? 99;
    case 'len': return r.extEnd ?? r.end ?? -1;
    case 'trend': return trendPct(r.trend);
    case 'market': return r.rate;
    case 'clause': return r.clause ?? -1;
    default: return r.salary ?? -1;
  }
};

export function ContractsTable({ title, note, info, rows, settings, years, canManage, mine, windowOpen, empty, buy, deadline }: {
  title: string; note?: string; info?: ReactNode; rows: CtRow[]; settings: KcSettings; years: number[]; canManage: boolean; mine: boolean; windowOpen: boolean; empty?: string; buy?: BuyInfo | null; deadline?: string | null;
}) {
  const total = rows.reduce((t, r) => t + (r.salary ?? 0), 0);
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 } | null>(null);
  const [bidOn, setBidOn] = useState<CtRow | null>(null);
  const shown = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const x = sortVal(a, sort.k), y = sortVal(b, sort.k);
      return (typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)) * sort.dir;
    });
  }, [rows, sort]);
  const click = (k: SortKey) => setSort((cur) => (cur?.k === k ? (cur.dir === (k === 'name' ? 1 : -1) ? { k, dir: (k === 'name' ? -1 : 1) } : null) : { k, dir: k === 'name' ? 1 : -1 }));
  return (
    <section className="ct2">
      <header className="ct2-head">
        <div><div className="ct2-title"><h3>{title} <span>{rows.length}</span></h3>{info && <details className="cs-info"><summary aria-label={`What does ${title.toLowerCase()} mean?`}>i</summary><div className="cs-pop">{info}</div></details>}</div>{note && <p>{note}</p>}</div>
        {total > 0 && <b>{k$(total)}</b>}
      </header>
      <div className="ct2-cols" role="toolbar" aria-label="Sort players">
        <span />
        <span className="ct2-ph">Player</span>
        {COLS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => click(k)} className={sort?.k === k ? 'on' : undefined} aria-pressed={sort?.k === k}
            title={`Sort by ${label.toLowerCase()}`}>
            {label}<i className="ct2-sort" aria-hidden="true">{sort?.k === k ? (sort.dir === -1 ? '▼' : '▲') : '⇅'}</i>
          </button>
        ))}
        <span />
      </div>
      {rows.length ? (
        <ul>{shown.map((r) => <Row key={r.id} r={r} years={years} settings={settings} canManage={canManage} mine={mine} windowOpen={windowOpen} onBid={buy ? setBidOn : null} deadline={deadline} />)}</ul>
      ) : <p className="ct2-empty">{empty ?? 'Nobody here.'}</p>}
      {bidOn && buy && <ClauseDialog r={bidOn} buy={buy} settings={settings} onClose={() => setBidOn(null)} />}
    </section>
  );
}

/** Popup for activating a release clause: pick a length, see the salary, every rule spelled out, plus a lower KT
 *  offer as the alternative. Mirrors kc_buy. */
function ClauseDialog({ r, buy, settings, onClose }: { r: CtRow; buy: BuyInfo; settings: KcSettings; onClose: () => void }) {
  const { pending, go, note, msg } = useRun();
  const [years, setYears] = useState(3);
  const price = r.clause ?? 0;
  const ref = useRef<HTMLDivElement>(null);
  const current = r.salary ?? 0;
  const sal = clauseSalary(r.rate, current, years);
  const from = buy.joinSeason, to = from + years - 1;
  const when = buy.windowOpen ? 'straight away (the window is open)' : `at the next window, at the end of ${buy.season}. He plays out the season for ${buy.clubName}`;
  const blockers = [
    r.status === 'moving' && 'He’s already signed with another club for next season.',
    buy.used >= buy.maxBuys && `You’ve made your ${buy.maxBuys} clause offers this period.`,
    buy.bank < price && `You need ${kt(price)} and have ${kt(buy.bank)}.`,
    sal > buy.capRoom && `His ${k$(sal)} salary would take you over the ${k$(buy.seasonCap)} cap in ${buy.joinSeason}.`,
  ].filter(Boolean) as string[];
  return (
    <div className="cd-back" role="dialog" aria-modal="true" aria-labelledby="cd-h" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cd-card" ref={ref}>
        <div className="cd-top">
          <div><span className="cd-eyebrow">Release clause · {buy.clubName}</span><h3 id="cd-h">{r.name}</h3></div>
          <button type="button" className="cd-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="cd-price">
          <div><span>Clause</span><b>{kt(price)}</b></div>
          <div><span>Salary now</span><b>{r.salary != null ? k$(r.salary) : '—'}</b></div>
          <div><span>Market</span><b>{k$(r.rate)}</b></div>
        </div>
        <div className="cd-len" role="radiogroup" aria-label="Contract length">
          <span>Your offer to him</span>
          <div>{Array.from({ length: Math.min(5, buy.maxYears) }, (_, i) => i + 1).map((y) => (
            <button key={y} type="button" role="radio" aria-checked={years === y} className={years === y ? 'on' : undefined} onClick={() => setYears(y)}>{y} yr{y > 1 ? 's' : ''}</button>
          ))}</div>
          <p><b>{k$(sal)} a year</b>, {from}{to > from ? `–${to}` : ''}. {sal === current && current > 0 ? 'Never less than he earns now.' : 'Market rate for that length.'}</p>
        </div>
        <ul className="cd-rules">
          <li><b>Pay the clause.</b> {kt(price)} up front, held for 48 hours.</li>
          <li><b>His club gets 48 hours to match.</b> To keep him they pay the same {kt(price)} (burned) and give him your terms. Your KT comes back.</li>
          <li><b>No match and he’s yours</b>, on your terms. He moves {when}.</li>
          <li><b>Any time of year.</b> {buy.maxBuys} clause offers per period ({buy.used} used). Balance your list by delisting when the window opens.</li>
          <li><b>Cap.</b> {k$(sal)} has to fit under your {k$(buy.seasonCap)} cap for {buy.joinSeason} ({k$(Math.max(0, buy.capRoom))} room).</li>
        </ul>
        {blockers.length > 0 && <div className="cd-block">{blockers.map((b) => <p key={b}>{b}</p>)}</div>}
        {msg?.ok ? note : (
          <>
            <button type="button" className="kc-btn cd-go" disabled={pending || blockers.length > 0}
              onClick={() => go(() => buyClause(r.id, years), `Pay ${kt(price)} for ${r.name}’s release clause and offer him ${years} year${years > 1 ? 's' : ''} at ${k$(sal)}? ${buy.clubName} get 48 hours to match.`)}>
              {pending ? 'Paying…' : `Pay the clause · ${kt(price)}`}
            </button>
            {note}
          </>
        )}
        <form action={offerKtForPlayer} className="cd-alt">
          <input type="hidden" name="player" value={r.playerId} />
          <span>Or make a lower offer. It opens a trade desk; his club can accept, counter or say no, any time of year.</span>
          <div><input name="kt" type="number" inputMode="numeric" min={1} step={1} max={buy.bank || undefined} placeholder={`e.g. ${Math.max(1, Math.round(price * 0.7))}`} required aria-label="Your KT offer" />
            <button type="submit" className="kc-btn small">Send offer</button></div>
          <em>You have {kt(buy.bank)}.</em>
        </form>
      </div>
    </div>
  );
}

function Row({ r, years, settings, canManage, mine, windowOpen, onBid, deadline }: { r: CtRow; years: number[]; settings: KcSettings; canManage: boolean; mine: boolean; windowOpen: boolean; onBid: ((r: CtRow) => void) | null; deadline?: string | null }) {
  const surplus = r.salary != null ? r.rate - r.salary : null;
  const setup = !!settings.setup_until && new Date(settings.setup_until) > new Date();
  const prov = setup && !!r.provisional;
  const locked = r.status === 'pending' || r.status === 'moving' || r.status === 'claim' || r.status === 'none';
  const finalYr = r.status === 'final' || r.status === 'draft' || r.status === 'pending';
  const until = r.extEnd ?? r.end;
  const yrs = until != null ? Math.max(1, until - years[0] + 1) : null;
  return (
    <li className={r.tone ? `tone-${r.tone}` : undefined}>
      <details className="ct2-item">
        <summary className="ct2-row">
          <span className="ct2-ic"><ClubDot code={r.club} size={20} /></span>
          <span className="ct2-who"><b>{r.name}</b><i>{r.positions.join('/')}{r.status === 'moving' && <em className="ct2-mv">Signed for {settings.season + 1}{r.movingTo ? ` · ${r.movingTo}` : ''}</em>}</i>
            {canManage && mine && !locked && !prov && r.salary != null && <ReleaseButton compact contractId={r.id} name={r.name} dead={r.dead} later={r.deadLater ?? 0} laterYears={r.deadYears ?? 0} fee={r.releaseFee ?? 0} deadline={deadline} />}</span>
          <span className="ct2-c ct2-pa">{r.age ?? '–'}<em>yrs</em></span>
          <span className="ct2-c">{yrs != null ? `${yrs}y` : '—'}<em>{until ?? 'none'}</em></span>
          <Trend v={r.trend} />
          <span className="ct2-c">{k$(r.rate)}{surplus != null ? <em className={surplus >= 5 ? 'kc-up' : surplus <= -5 ? 'kc-down' : ''}>{surplus > 0 ? '+' : surplus < 0 ? '−' : '±'}{k$(Math.abs(surplus))}</em> : <em>value</em>}</span>
          {r.clause != null && onBid && r.status !== 'claim' ? (
            <span role="button" tabIndex={0} className="ct2-c ct2-cl live" title={`Release clause ${kt(r.clause)}. Tap to bid.`}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onBid(r); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onBid(r); } }}>
              {ktShort(r.clause)}<em>bid</em>
            </span>
          ) : (
            <span className="ct2-c ct2-cl">{r.clause != null ? <>{ktShort(r.clause)}<em>KT</em></> : (
              <span className="ct2-lock" title="No release clause" aria-label="No release clause">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5" fill="currentColor" fillOpacity=".18" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
              </span>
            )}</span>
          )}
          {r.status === 'none' && onBid ? (
            <span className="ct2-c ct2-sal ct2-offer">
              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); (e.currentTarget.nextElementSibling as HTMLFormElement | null)?.requestSubmit(); }}>Offer<br />contract</button>
              <form action={openUnsigned.bind(null, r.playerId)} hidden />
            </span>
          ) : (
            <span className="ct2-c ct2-sal">{r.salary != null ? k$(r.salary) : '—'}<em>{r.extSalary != null ? `then ${k$(r.extSalary)}` : r.salary == null ? (canManage ? 'tap to offer' : 'unsigned') : ' '}</em></span>
          )}
          <span className="ct2-arrow" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 20 20"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          <span className="sr-only">Show contract details for {r.name}</span>
        </summary>
        <div className="ct2-more">
          <div className="ct2-status"><span className={`kc-tag ${TAG[r.status]}`}>{r.statusLabel}</span>{r.homeGrown && <span className="kc-tag high">Home-grown</span>}{prov && <span className="kc-tag exp">Provisional</span>}</div>
          <dl className="ct2-dl">
            <div><dt>Salary</dt><dd>{r.salary != null ? `${k$(r.salary)} a year` : 'Not contracted'}</dd></div>
            <div><dt>Contract</dt><dd>{r.start != null && r.end != null ? `${r.start}–${r.end}` : '—'}{yrs != null && <span className="kc-pips" style={{ marginLeft: 8 }}>{years.map((y) => <i key={y} className={r.end != null && r.start != null && r.end >= y && r.start <= y ? 'on' : r.extEnd && r.extEnd >= y && r.end != null && y > r.end ? 'next' : ''} />)}</span>}</dd></div>
            {r.extSalary != null && <div><dt>Extension</dt><dd>{k$(r.extSalary)} a year to {r.extEnd}</dd></div>}
            <div><dt>Release clause</dt><dd>{r.clause != null ? `${kt(r.clause)} (${r.tier})` : r.salary == null ? '—' : finalYr ? 'None in his last 6 months' : r.tier === 'none' ? 'No clause' : '—'}</dd></div>
            <div><dt>Market value</dt><dd>{k$(r.rate)}{surplus != null ? ` · ${surplus >= 0 ? `${k$(surplus)} under` : `${k$(-surplus)} over`} his salary` : ''}</dd></div>
            <div><dt>2026</dt><dd>{r.avg?.toFixed(1) ?? '–'} avg · {r.games} games</dd></div>
            {r.dead > 0 && !locked && <div><dt>Delist cost</dt><dd>{k$(r.dead)} dead now{r.deadLater ? `, ${k$(r.deadLater)} × ${r.deadYears} later` : ''}{r.releaseFee ? ` + ${kt(r.releaseFee)}` : ''}</dd></div>}
          </dl>
          {r.status === 'none' && canManage && (
            <div className="ct2-sign">
              <b>Offer {r.name} a contract</b>
              <span className="kc-sub">{setup ? `Unsigned. Re-sign him from ${settings.season}: ${k$(r.rate)} market value, less ${settings.home_grown_pct}% home-grown. Provisional until deadline day, so you can undo it.` : `Out of contract. Sign him from ${settings.season} at his priced salary: ${k$(r.rate)} market value.`}</span>
              <ExtendControl contractId={0} signPlayerId={r.playerId} name={r.name} rate={r.rate} homeGrown={setup} settings={settings} />
            </div>
          )}
          {canManage && r.lockedUntil && new Date(r.lockedUntil) > new Date() && <p className="kc-sub" style={{ margin: 0 }}>Extended recently: locked until {new Date(r.lockedUntil).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}.</p>}
          {canManage && !(r.lockedUntil && new Date(r.lockedUntil) > new Date()) && r.extEnd == null && r.end != null && r.salary != null && ['contract', 'final', 'rookie', 'draft'].includes(r.status) && r.end < settings.season + settings.max_years - 1 && (
            <details className="ct2-sign ct2-ext">
              <summary><b>Extend {r.name}</b><span className="kc-sub">Add up to {settings.season + settings.max_years - 1 - r.end} year{settings.season + settings.max_years - 1 - r.end > 1 ? 's' : ''} after {r.end}, at today’s market value {k$(r.rate)}{r.homeGrown ? ` less ${settings.home_grown_pct}% home-grown` : ''} +{settings.ext_premium_pct}%{setup ? ', no fee until deadline day' : `, plus a ${kt(settings.ext_fee_kt)} fee`}.</span></summary>
              <ExtendControl contractId={r.id} name={r.name} rate={r.rate} homeGrown={r.homeGrown} settings={settings} startYear={r.end + 1} maxYears={settings.season + settings.max_years - 1 - r.end} />
            </details>
          )}
          {canManage && prov && (
            <div className="ct2-sign">
              <b>Provisional until deadline day</b>
              <span className="kc-sub">Undo it for free and try something else, or lock it in. Everything becomes formal on deadline day.</span>
              <ProvisionalControls contractId={r.id} name={r.name} />
            </div>
          )}
          <div className="ct2-acts">
            <Link href={`/players/${r.playerId}`} className="kc-btn small">Player profile</Link>
            {canManage && !locked && <>
              {r.onAuction ? <Link href="/market/auctions" className="kc-btn small">On auction</Link> : mine && windowOpen && !finalYr ? <AuctionControl contractId={r.id} name={r.name} suggested={Math.max(1, Math.round((r.clause ?? r.rate) * 0.4))} /> : null}
            </>}
          </div>
        </div>
      </details>
    </li>
  );
}
