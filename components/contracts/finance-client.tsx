'use client';
// Finances: interactive pieces. Rookie-slot assign, term deposit and loan forms, and the cap simulator.
import { useMemo, useState } from 'react';
import { makeDeposit, offerLoan, respondLoan, setDropDay, setRookieSlot } from '@/app/(app)/contracts/actions';
import { useRun } from '@/components/contracts/client';

const k$ = (k: number) => `$${Math.round(k).toLocaleString('en-AU')}k`;
const kt = (n: number) => `${Math.round(n).toLocaleString('en-AU')} KT`;

export function RookieAssign({ playerId, season, on, label }: { playerId: number; season: number; on: boolean; label?: string }) {
  const { pending, go, note } = useRun();
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button type="button" className={`kc-btn small ${on ? '' : 'sage'}`} disabled={pending} onClick={() => go(() => setRookieSlot(playerId, season, !on))}>
        {pending ? '…' : on ? 'Remove' : label ?? 'Assign'}
      </button>
      {note}
    </span>
  );
}

/** Pick this season's cap-free rookie from a dropdown of eligible players. */
export function RookiePicker({ season, current, options, locked }: {
  season: number; current: number | null; options: { id: number; label: string }[]; locked: boolean;
}) {
  const { pending, go, note } = useRun();
  const [pick, setPick] = useState<string>(current ? String(current) : options[0] ? String(options[0].id) : '');
  if (!options.length) return <p className="kc-sub" style={{ margin: 0 }}>No one on your list has 10 or fewer games.</p>;
  return (
    <div className="rk-pick">
      <div className="rk-row">
        <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={locked || pending} aria-label={`${season} rookie`}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <button type="button" className="kc-btn dark small" disabled={locked || pending || !pick || Number(pick) === current}
          onClick={() => go(() => setRookieSlot(Number(pick), season, true))}>{pending ? '…' : current ? 'Swap' : 'Set'}</button>
        {current && <button type="button" className="kc-btn small" disabled={locked || pending} onClick={() => go(() => setRookieSlot(current, season, false))}>Clear</button>}
      </div>
      {note}
    </div>
  );
}

/** Commish: when rookie slots lock (player drop day). */
export function DropDayControl({ value }: { value: string | null }) {
  const { pending, go, note } = useRun();
  const toLocal = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const [v, setV] = useState(value ? toLocal(value) : '');
  return (
    <div className="rk-pick">
      <div className="rk-row">
        <input type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} aria-label="Player drop day" />
        <button type="button" className="kc-btn small" disabled={pending || !v} onClick={() => go(() => setDropDay(new Date(v).toISOString()))}>Save</button>
        {value && <button type="button" className="kc-btn small" disabled={pending} onClick={() => { setV(''); go(() => setDropDay(null)); }}>Clear</button>}
      </div>
      {note}
    </div>
  );
}

export function DepositForm({ bank, rate }: { bank: number; rate: number }) {
  const { pending, go, note } = useRun();
  const [amt, setAmt] = useState('100');
  const n = Math.floor(Number(amt) || 0);
  return (
    <form className="fn-form" onSubmit={(e) => { e.preventDefault(); go(() => makeDeposit(n), `Lock ${kt(n)} until season end? You get ${kt(n + Math.floor((n * rate) / 100))} back at rollover.`); }}>
      <label>Amount<input type="number" min={10} step={5} max={bank} value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="numeric" /></label>
      <div className="fn-calc"><span>Back at season end</span><b>{kt(n + Math.floor((n * rate) / 100))}</b><em>+{rate}%</em></div>
      <button type="submit" className="kc-btn sage" disabled={pending || n < 100 || n > bank}>Lock it in</button>
      {note}
    </form>
  );
}

export function LoanForm({ bank, teams, maxRate }: { bank: number; teams: { id: number; name: string }[]; maxRate: number }) {
  const { pending, go, note } = useRun();
  const [to, setTo] = useState(teams[0]?.id ?? 0);
  const [amt, setAmt] = useState('100');
  const [rate, setRate] = useState(String(Math.min(10, maxRate)));
  const n = Math.floor(Number(amt) || 0), r = Math.floor(Number(rate) || 0);
  return (
    <form className="fn-form" onSubmit={(e) => { e.preventDefault(); go(() => offerLoan(to, n, r)); }}>
      <label>Lend to<select value={to} onChange={(e) => setTo(Number(e.target.value))}>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <div className="fn-two">
        <label>Amount<input type="number" min={10} step={5} max={bank} value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="numeric" /></label>
        <label>Interest %<input type="number" min={0} max={maxRate} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="numeric" /></label>
      </div>
      <div className="fn-calc"><span>Repaid at season end</span><b>{kt(n + Math.floor((n * r) / 100))}</b><em>+{kt(Math.floor((n * r) / 100))}</em></div>
      <button type="submit" className="kc-btn dark" disabled={pending || n < 100 || n > bank}>Offer the loan</button>
      {note}
    </form>
  );
}

export function LoanRespond({ id, accept, label, kind = 'sage' }: { id: number; accept: boolean; label: string; kind?: 'sage' | 'plain' }) {
  const { pending, go, note } = useRun();
  return <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}><button type="button" className={`kc-btn small ${kind === 'sage' ? 'sage' : ''}`} disabled={pending} onClick={() => go(() => respondLoan(id, accept))}>{label}</button>{note}</span>;
}

/** The cap bar: salary, cap-free rookie, room, keeper hard cap and the in-season soft cap, with brackets under it. */
export function CapBar({ salary, rookie, keeperCap, seasonCap, taxLine, label }: { salary: number; rookie: number; keeperCap: number; seasonCap: number; taxLine: number; label: string }) {
  const max = seasonCap;
  const pc = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const over = salary > keeperCap;
  return (
    <div className="fn-cap">
      <div className="fn-cap-top">
        <span style={{ left: 0 }}><b>{k$(salary)}</b>{label}</span>
        <span style={{ left: pc(Math.min(salary, keeperCap) + (keeperCap - Math.min(salary, keeperCap)) / 2), transform: 'translateX(-50%)' }} className={over ? 'dn' : 'up'}><b>{over ? k$(salary - keeperCap) : k$(keeperCap - salary)}</b>{over ? 'over keeper cap' : 'under keeper cap'}</span>
      </div>
      <div className="fn-bar">
        <i className="sal" style={{ width: pc(Math.min(salary, max)) }} />
        {rookie > 0 && <i className="rook" style={{ left: pc(Math.min(salary, max)), width: pc(rookie) }} title={`${k$(rookie)} cap-free rookie`} />}
        <i className="soft" style={{ left: pc(keeperCap), width: pc(seasonCap - keeperCap) }} />
        <s className="hard" style={{ left: pc(keeperCap) }} />
      </div>
      <div className="fn-brackets">
        <div style={{ left: 0, width: pc(keeperCap) }}><span>Keeper hard cap · {k$(keeperCap)}</span></div>
        <div className="soft" style={{ left: pc(keeperCap), width: pc(seasonCap - keeperCap) }}><span>In-season +{k$(seasonCap - keeperCap)}</span></div>
      </div>
      <div className="fn-legend"><span><i className="sal" />Salary</span>{rookie > 0 && <span><i className="rook" />Cap-free rookie</span>}<span><i className="soft" />Soft cap zone</span></div>
    </div>
  );
}

export interface SimPlayer {
  id: number; name: string; pos: string; age: number | null;
  /** This season's salary as it counts now (0 if he's the cap-free rookie). */ cur: number;
  /** Next season's salary if signed for it (incl. an extension), else null. */ next: number | null;
  end: number; final: boolean; rate: number;
  deadNow: number; deadLater: number; fee: number; extPrice: number;
}
type SimState = 'keep' | 'release' | 'trade';

/** Cap simulator: every contracted player starts kept; set each to Keep, Release or Trade and watch this season's
 *  salary and next season's keeper salary move. Expiring players start off; switch one on to re-sign him. Nothing is saved. */
export function CapSimulator({ players, keeperCap, seasonCap, salaryNow, nextSalary, kept, deficitMax, season, bank }: {
  players: SimPlayer[]; keeperCap: number; seasonCap: number; salaryNow: number; nextSalary: number; kept: number; deficitMax: number; season: number; bank: number;
}) {
  const [tab, setTab] = useState<'contracted' | 'expiring'>('contracted');
  const [state, setState] = useState<Record<number, SimState>>({});
  const [resign, setResign] = useState<Record<number, boolean>>({});
  const contracted = useMemo(() => players.filter((p) => !p.final).sort((a, b) => (b.next ?? b.cur) - (a.next ?? a.cur)), [players]);
  const expiring = useMemo(() => players.filter((p) => p.final).sort((a, b) => b.rate - a.rate), [players]);
  const r = useMemo(() => {
    let now = salaryNow, next = nextSalary, keepers = kept, dead = 0, fees = 0, moves = 0;
    for (const p of players) {
      const st = state[p.id] ?? 'keep';
      if (!p.final && st !== 'keep') {
        moves++; keepers -= 1;
        now -= p.cur;
        if (p.next != null) next -= p.next;
        if (st === 'release') { now += p.deadNow; dead += p.deadNow; fees += p.fee; if (p.end > season) { next += p.deadLater; dead += p.deadLater; } }
      }
      // Signing an out-of-contract player: two-year deal at about his value, counts this season and next.
      if (p.final && resign[p.id]) { now += p.extPrice; next += p.extPrice; keepers += 1; moves++; }
    }
    return { now, next, keepers, dead, fees, moves };
  }, [players, state, resign, salaryNow, nextSalary, kept, season]);
  const over = r.now - keeperCap;
  const status = over <= 0 ? ['ok', `${k$(-over)} under the ${k$(keeperCap)} keeper cap`] : over <= deficitMax ? ['warn', `${k$(over)} over: a deficit is allowed`] : ['bad', `${k$(over)} over: release or trade more`];
  const reset = () => { setState({}); setResign({}); };
  const Seg = ({ p }: { p: SimPlayer }) => {
    const st = state[p.id] ?? 'keep';
    return (
      <div className="sim3" role="radiogroup" aria-label={`${p.name}: keep, release or trade`}>
        {(['keep', 'release', 'trade'] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={st === k} className={`${k}${st === k ? ' on' : ''}`} onClick={() => setState((m) => ({ ...m, [p.id]: k }))}>
            {k === 'keep' ? 'Contracted' : k === 'release' ? 'Released' : 'Traded'}
          </button>
        ))}
      </div>
    );
  };
  const effect = (p: SimPlayer) => {
    const st = state[p.id] ?? 'keep';
    if (st === 'keep') return null;
    const freed = (p.next ?? 0) - (st === 'release' && p.end > season ? p.deadLater : 0);
    return <span className="sim-eff">{st === 'release'
      ? <>Frees {k$(p.cur - p.deadNow)} in {season}{p.next != null ? ` and ${k$(freed)} in ${season + 1}` : ''}. Legacy: {k$(p.deadNow)} dead in {season}{p.end > season ? `, ${k$(p.deadLater)} a year to ${p.end}` : ''} · {p.fee.toLocaleString('en-AU')} KT fee</>
      : <>Frees {k$(p.cur)} in {season}{p.next != null ? ` and ${k$(p.next)} in ${season + 1}` : ''}. No dead money.</>}</span>;
  };
  return (
    <div className="sim2">
      <div className={`sim-result ${status[0]}`}>
        <span className="eyebrow">Test only · nothing is saved</span>
        <div className="sim-two">
          <div><span>{season} keepers</span><b>{k$(r.now)}</b>{r.moves > 0 ? <em>was {k$(salaryNow)}</em> : <em>deadline day</em>}</div>
          <div><span>{season + 1} committed</span><b>{k$(r.next)}</b>{r.moves > 0 && <em>was {k$(nextSalary)}</em>}</div>
        </div>
        <p>{status[1]} · {r.keepers} keepers{r.keepers > 18 ? ' (max 18)' : ''}</p>
        <CapBar salary={r.now} rookie={0} keeperCap={keeperCap} seasonCap={seasonCap} taxLine={keeperCap} label="keepers" />
        <div className="sim-kpis">
          <div><span>Moves</span><b>{r.moves}</b></div>
          <div><span>Dead money</span><b>{k$(r.dead)}</b></div>
          <div><span>Release fees</span><b className={r.fees > bank ? 'dn' : undefined}>{r.fees.toLocaleString('en-AU')} KT</b></div>
        </div>
        {r.moves > 0 && <button type="button" className="kc-link" onClick={reset}>Reset</button>}
      </div>
      <div className="sim-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'contracted'} className={tab === 'contracted' ? 'on' : undefined} onClick={() => setTab('contracted')}>Contracted <i>{contracted.length}</i></button>
        <button type="button" role="tab" aria-selected={tab === 'expiring'} className={tab === 'expiring' ? 'on' : undefined} onClick={() => setTab('expiring')}>Out of contract <i>{expiring.length}</i></button>
      </div>
      <div className="sim-list">
        {tab === 'contracted' ? contracted.map((p) => (
          <div key={p.id} className={`sim-p ${state[p.id] ?? 'keep'}`}>
            <div className="sim-who"><b>{p.name}</b><small>{p.pos}{p.age != null ? ` · ${p.age}` : ''} · {k$(p.next ?? p.cur)} to {p.end}</small></div>
            <Seg p={p} />
            {effect(p)}
          </div>
        )) : expiring.length ? expiring.map((p) => {
          const on = !!resign[p.id];
          return (
            <button key={p.id} type="button" className={`sim-p sim-x ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setResign((m) => ({ ...m, [p.id]: !on }))}>
              <div className="sim-who"><b>{p.name}</b><small>{p.pos}{p.age != null ? ` · ${p.age}` : ''} · value {k$(p.rate)}</small></div>
              <span className="sim-tog"><i aria-hidden="true" />{on ? `Signed · ${k$(p.extPrice)} a year` : 'Not signed'}</span>
            </button>
          );
        }) : <p className="kc-sub" style={{ padding: 12 }}>Everyone on your list is under contract.</p>}
      </div>
    </div>
  );
}
