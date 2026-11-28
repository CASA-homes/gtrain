'use client';
// Commish KT console: pick a club, give or take KT, rewind its term deposits and loans, or reset it to the starting
// bank. Every change is a "Commish:" entry on the club's token record, shown underneath.
import { useState } from 'react';
import { commishAdjust, resetFinances, rewindDeposit, rewindLoan } from '@/app/(app)/contracts/actions';
import { useRun } from '@/components/contracts/client';

export interface CfClub {
  id: number; name: string; code: string; bank: number;
  deposits: { id: number; amount: number; rate: number; months: number; matures: string | null; at: string }[];
  loans: { id: number; amount: number; rate: number; status: 'offered' | 'active'; lender: number; borrower: number; at: string }[];
  ledger: { id: number; delta: number; reason: string; at: string }[];
}

const kt = (n: number) => `${n.toLocaleString('en-AU')} KT`;
const day = (s: string) => new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Perth' });

export function CommishFinances({ clubs, startKt }: { clubs: CfClub[]; startKt: number }) {
  const { pending, go, note } = useRun();
  const [id, setId] = useState(clubs[0]?.id ?? 0);
  const [mode, setMode] = useState<'give' | 'take'>('give');
  const [amount, setAmount] = useState('');
  const [why, setWhy] = useState('');
  const c = clubs.find((x) => x.id === id);
  const name = (t: number) => clubs.find((x) => x.id === t)?.name ?? 'another club';
  if (!c) return <p className="kc-sub">No clubs yet.</p>;
  const n = Math.round(Number(amount));
  const signed = mode === 'give' ? n : -n;

  return (
    <div className="cf-con">
      <div className="cf-top">
        <label className="kc-field">Club
          <select value={id} onChange={(e) => setId(Number(e.target.value))}>
            {clubs.map((x) => <option key={x.id} value={x.id}>{x.name} · {kt(x.bank)}</option>)}
          </select>
        </label>
        <div className="cf-bank"><span>Bank</span><b>{kt(c.bank)}</b></div>
        <button type="button" className="kc-btn" disabled={pending}
          onClick={() => go(() => resetFinances(c.id), `Rewinds ${c.name}'s open term deposits (no interest), cancels loan offers and sets their bank to ${kt(startKt)}. Contracts and picks don't change. Every step shows on their token record.`,
            { title: `Reset ${c.name} to ${kt(startKt)}?`, cta: 'Reset finances', rows: [['Bank now', kt(c.bank)], ['Bank after', kt(startKt)]] })}>
          Reset to {kt(startKt)}
        </button>
      </div>

      <form className="cf-adj" onSubmit={(e) => {
        e.preventDefault();
        if (!n || n < 1 || !why.trim()) return;
        go(() => commishAdjust(c.id, signed, why.trim()), `"${why.trim()}" goes on ${c.name}'s token record.`,
          { title: `${mode === 'give' ? 'Give' : 'Take'} ${kt(n)} ${mode === 'give' ? 'to' : 'from'} ${c.name}?`, cta: mode === 'give' ? 'Give KT' : 'Take KT', rows: [['Bank now', kt(c.bank)], ['Bank after', kt(c.bank + signed)]] });
      }}>
        <div className="cf-seg" role="group" aria-label="Give or take">
          <button type="button" className={mode === 'give' ? 'on' : ''} onClick={() => setMode('give')}>Give</button>
          <button type="button" className={mode === 'take' ? 'on' : ''} onClick={() => setMode('take')}>Take</button>
        </div>
        <label className="kc-field">KT<input type="number" min={1} step={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="250" /></label>
        <label className="kc-field cf-why">Reason (shows on their record)<input value={why} maxLength={140} onChange={(e) => setWhy(e.target.value)} placeholder="Prize: round 5 high score" /></label>
        <button type="submit" className="kc-btn dark" disabled={pending || !n || n < 1 || !why.trim()}>{mode === 'give' ? 'Give' : 'Take'}{n > 0 ? ` ${kt(n)}` : ''}</button>
      </form>

      <div className="cf-cols">
        <div>
          <h3>Term deposits</h3>
          {c.deposits.length ? c.deposits.map((d) => (
            <div key={d.id} className="cf-row">
              <span><b>{kt(d.amount)}</b> · {d.months} months at +{d.rate}%<small>Since {day(d.at)}{d.matures ? ` · matures ${day(d.matures)}` : ''}</small></span>
              <button type="button" className="kc-btn small" disabled={pending}
                onClick={() => go(() => rewindDeposit(d.id), `${kt(d.amount)} goes back into ${c.name}'s bank with no interest.`, { title: 'Rewind this deposit?', cta: 'Rewind deposit' })}>Rewind</button>
            </div>
          )) : <p className="kc-sub">No open deposits.</p>}
        </div>
        <div>
          <h3>Loans</h3>
          {c.loans.length ? c.loans.map((o) => {
            const out = o.lender === c.id;
            return (
              <div key={o.id} className="cf-row">
                <span><b>{kt(o.amount)}</b> {out ? 'lent to' : 'borrowed from'} {name(out ? o.borrower : o.lender)}<small>{o.status === 'offered' ? 'Offered, not accepted' : `Active at +${o.rate}%`} · {day(o.at)}</small></span>
                <button type="button" className="kc-btn small" disabled={pending}
                  onClick={() => go(() => rewindLoan(o.id), o.status === 'offered' ? 'The offer is cancelled. No KT moves.' : `${kt(o.amount)} goes back to ${name(o.lender)} from ${name(o.borrower)}, no interest. Both clubs see it on their record.`,
                    { title: o.status === 'offered' ? 'Cancel this loan offer?' : 'Rewind this loan?', cta: o.status === 'offered' ? 'Cancel offer' : 'Rewind loan' })}>
                  {o.status === 'offered' ? 'Cancel' : 'Rewind'}
                </button>
              </div>
            );
          }) : <p className="kc-sub">No loans.</p>}
        </div>
      </div>

      <h3>Token record <span className="kc-sub">· last 15</span></h3>
      <div className="cf-ledger">
        {c.ledger.length ? c.ledger.map((l) => (
          <div key={l.id} className={l.reason.startsWith('Commish') ? 'cm' : ''}>
            <span>{day(l.at)}</span><span>{l.reason}</span><b className={l.delta >= 0 ? 'up' : 'dn'}>{l.delta >= 0 ? '+' : '−'}{Math.abs(l.delta).toLocaleString('en-AU')}</b>
          </div>
        )) : <p className="kc-sub">Nothing yet.</p>}
      </div>
      {note}
    </div>
  );
}
