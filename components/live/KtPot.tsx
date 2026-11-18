'use client';
// The KT pot on a mini game (or a comp): who's paid in, pay in / take it back, and the payout once it's settled.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { payIn, payOut, refundPot } from '@/app/(app)/live/kt-actions';
import type { KtPot as Pot } from '@/lib/kt-pots';

const PLACE = ['1st', '2nd', '3rd'];
const SPLIT: Record<string, number[]> = { wta: [100], '70-30': [70, 30], '60-30-10': [60, 30, 10] };

export function KtPot({ pot, paid, clubs, myTeamId, commish, teamName, path, note }: {
  pot: Pot; paid: number[]; clubs: number[]; myTeamId: number; commish: boolean; teamName: (id: number) => string; path: string; note?: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const run = (f: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { setErr(null); const r = await f(); if (!r.ok) setErr(r.error ?? 'Something went wrong.'); else router.refresh(); });
  const gross = pot.entry * paid.length;
  const net = gross - Math.floor((gross * pot.cut_pct) / 100);
  const pct = (SPLIT[pot.split] ?? [100]).slice(0, Math.max(1, paid.length - 1));
  const tot = pct.reduce((a, b) => a + b, 0);
  const est = pct.map((x) => Math.floor((net * x) / tot)); if (est.length) est[0] += net - est.reduce((a, b) => a + b, 0);
  const inIt = clubs.includes(myTeamId), iPaid = paid.includes(myTeamId);

  return (
    <section className="rh-card ktp" aria-label="KT pot">
      <div className="ktp-top">
        <span className="ktp-pool">🏆 <b>{(pot.status === 'paid' ? pot.pool_kt ?? gross : gross).toLocaleString()} KT</b> <span className="rh-dim">pot · {pot.entry} KT a club · league takes {pot.cut_pct}%</span></span>
        {pot.status === 'open' && inIt && !iPaid && <button className="rh-btn go" disabled={pending} onClick={() => run(() => payIn(pot.id, path))}>Pay in {pot.entry} KT</button>}
        {pot.status === 'open' && iPaid && <button className="rh-btn alt" disabled={pending} onClick={() => run(() => payOut(pot.id, path))}>Take my {pot.entry} KT back</button>}
      </div>
      {pot.status === 'paid' && pot.result?.length ? (
        <div className="ktp-list">{pot.result.map((r) => <span key={r.place} className={r.team === myTeamId ? 'me' : ''}><em>{PLACE[r.place - 1]}</em> <b>{r.kt} KT</b> · {teamName(r.team)}</span>)}<span className="rh-dim">League bank +{pot.cut_kt ?? 0} KT</span></div>
      ) : pot.status === 'refunded' ? (
        <span className="rh-dim">Entries refunded.</span>
      ) : (
        <>
          <div className="ktp-list">{est.map((x, i) => <span key={i}><em>{PLACE[i]}</em> <b>{x} KT</b></span>)}</div>
          <div className="ktp-clubs">{clubs.map((t) => <span key={t} className={paid.includes(t) ? 'on' : ''}>{paid.includes(t) ? '✓ ' : ''}{teamName(t)}</span>)}</div>
          <span className="rh-dim" style={{ fontSize: 12 }}>{note ?? 'Only clubs that pay in can win. Pays out automatically when the commish locks the round.'}</span>
          {commish && paid.length > 0 && <button className="rh-btn alt" style={{ alignSelf: 'flex-start' }} disabled={pending} onClick={() => run(() => refundPot(pot.id, path))}>Refund everyone</button>}
        </>
      )}
      {err && <span className="rh-down">{err}</span>}
    </section>
  );
}

/** Server pages can't pass functions to client components, so they pass a name map. */
export function KtPotWrap(props: Omit<Parameters<typeof KtPot>[0], 'teamName'> & { names: Record<number, string> }) {
  const { names, ...rest } = props;
  return <KtPot {...rest} teamName={(id) => names[id] ?? `Club ${id}`} />;
}
