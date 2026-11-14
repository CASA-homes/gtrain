'use client';
// The 5-step "offer a contract" popup: player → length & salary → release clause → sweeteners → review → tabled.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { tableOffer } from '@/app/(app)/contracts/actions';
import type { KcSettings, MyOffer } from '@/lib/contracts';

const money = (k: number) => `$${(Math.round(k) * 1000).toLocaleString('en-AU')}`;
const kt = (n: number) => `${Math.round(n).toLocaleString('en-AU')} KT`;
const LF: Record<number, number> = { 1: 1.06, 2: 1.03, 3: 1, 4: 0.967, 5: 0.933 };
const STEPS = ['Player', 'Contract', 'Release clause', 'Sweeteners', 'Review'];
type ClauseTier = 'standard' | 'high' | 'none';

export function OfferFlow({ fa, player, rate, settings: s, bank, salary, longUsed, picks, existing }: {
  fa: { id: number; offers: number; closesAt: string | null; exTeam: string | null; exRank: number | null };
  player: { name: string; positions: string[]; club: string | null; age: number | null; average: number | null; games: number | null };
  rate: number; settings: KcSettings; bank: number; salary: number; longUsed: number;
  picks: { id: number; label: string; overall: number }[]; existing: MyOffer | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(existing ? 1 : 0);
  const [years, setYears] = useState(existing?.years ?? 3);
  const minFor = (y: number) => Math.max(5, Math.round(rate * (LF[y] ?? 0.933)));
  const [extra, setExtra] = useState(existing ? Math.max(0, existing.salary_k - minFor(existing.years)) : 0);
  const [tier, setTier] = useState<ClauseTier>((existing?.tier as ClauseTier) ?? 'standard');
  const [sweet, setSweet] = useState(existing?.sweet_kt ?? 0);
  const [pickIds, setPickIds] = useState<number[]>(existing?.pick_ids ?? []);
  const [ack, setAck] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const base = minFor(years) + extra;
  const prem = 1 + (tier === 'high' ? s.high_pct : tier === 'none' ? s.none_pct : 0) / 100;
  const capSalary = Math.round(base * prem);
  const after = salary + capSalary;
  const taxKt = Math.max(0, after - s.tax_line_k) * s.tax_kt_per_k;
  const pickScore = useMemo(() => picks.filter((p) => pickIds.includes(p.id)).reduce((a, p) => a + Math.round(3000 * Math.exp(-0.07 * (p.overall - 1)) / 50), 0), [picks, pickIds]);
  const score = years * base + Math.trunc(sweet / 50) + pickScore;
  const escrowNeeded = sweet - (existing?.sweet_kt ?? 0);
  const longBlocked = years >= 4 && longUsed >= s.long_deal_limit;
  const overCap = after > s.season_cap_k;
  const tooPoor = escrowNeeded > bank;
  const belowExisting = !!existing && score < existing.score;
  const clauseKt = (t: ClauseTier) => (t === 'none' ? null : rate * (t === 'high' ? s.clause_high : s.clause_std) * s.kt_per_k * (years === 1 ? 0.5 : 1));

  const submit = () => start(async () => {
    setError(null);
    const r = await tableOffer(fa.id, years, base, tier, sweet, pickIds);
    if (r.ok) { setDone(r.message); router.refresh(); } else setError(r.message);
  });

  const Side = () => (
    <aside className="kc-side-sum">
      <div className="kc-card dark" style={{ padding: 18 }}>
        <div className="kc-stat"><span>Your offer</span><b>{money(capSalary)} <small style={{ fontSize: 14, color: '#c9cec8' }}>/ yr</small></b>
          <em>{years} yr{years > 1 ? 's' : ''} · {tier === 'none' ? 'no clause' : `${tier} clause`}{sweet ? ` · +${kt(sweet)}` : ''}{pickIds.length ? ` · +${pickIds.length} pick${pickIds.length > 1 ? 's' : ''}` : ''}</em></div>
        <div className="kc-kv" style={{ borderColor: 'rgba(255,255,255,.15)', marginTop: 10 }}><span style={{ color: '#c9cec8' }}>Offer score</span><strong style={{ color: '#e5c98a' }}>{score}</strong></div>
      </div>
      <div className="kc-card" style={{ padding: 16 }}>
        <p className="eyebrow" style={{ margin: 0 }}>Your cap</p>
        <div className="kc-kv"><span>Season now</span><strong>{money(salary)}</strong></div>
        <div className="kc-kv"><span>After signing</span><strong className={overCap ? 'kc-down' : taxKt ? 'kc-brass' : ''}>{money(after)}</strong></div>
        <div className="kc-bar"><i style={{ width: `${Math.min(100, (salary / s.season_cap_k) * 100)}%` }} /><i style={{ left: `${Math.min(100, (salary / s.season_cap_k) * 100)}%`, width: `${Math.min(100, (capSalary / s.season_cap_k) * 100)}%`, background: 'var(--khq-brass)', borderRadius: 0 }} /><s style={{ left: `${(s.tax_line_k / s.season_cap_k) * 100}%`, background: '#a8461f' }} /></div>
        <p className="kc-sub" style={{ fontSize: 12 }}>Red mark = {money(s.tax_line_k)} luxury tax line · full bar = {money(s.season_cap_k)}</p>
      </div>
    </aside>
  );

  const body = () => {
    if (done) return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        <div style={{ flex: '1 1 360px' }}>
          <h3 style={{ font: '600 26px var(--font)' }}>Offer tabled</h3>
          <p className="kc-sub" style={{ fontSize: 15 }}>{player.name} now has {fa.offers + (existing ? 0 : 1)} offer{fa.offers + (existing ? 0 : 1) > 1 ? 's' : ''}. Nobody can see the amounts, including yours.</p>
          <ol style={{ margin: '18px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
            <li><strong>Tabled</strong>: score {score}{sweet ? `, ${kt(sweet)} held until offers close` : ''}.</li>
            <li><strong>Offers close</strong>{fa.closesAt ? ' when the clock runs out' : ' when the commish closes them'}. You can raise your offer until then, but not lower it.</li>
            <li><strong>Best score wins</strong>; ties go to the lower ladder club. Lose and your tokens come back.</li>
          </ol>
        </div>
        <Side />
      </div>
    );
    if (step === 0) return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <h3 style={{ font: '600 20px var(--font)' }}>Is he worth chasing?</h3>
          <p className="kc-sub" style={{ marginBottom: 16 }}>{fa.exTeam ? `Out of contract at ${fa.exTeam}.` : 'Free agent.'} Offers are blind; the best offer score wins when offers close.</p>
          <div className="kc-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
            {[['Average', player.average?.toFixed(1) ?? '–'], ['Age', player.age ?? '–'], ['Games', player.games ?? '–'], ['Market rate', money(rate)]].map(([l, v], i) => (
              <div key={l as string} className="kc-card" style={{ padding: 14, background: i === 3 ? '#f3ebd9' : 'var(--sunk)', border: 0 }}><div className="kc-stat"><span>{l}</span><b style={{ fontSize: 22 }}>{v}</b></div></div>
            ))}
          </div>
          <div className="kc-card" style={{ padding: '6px 16px', marginTop: 14 }}>
            <div className="kc-kv"><span>Position</span><strong>{player.positions.join('/')} · {player.club ?? ''}</strong></div>
            <div className="kc-kv"><span>Former G-Train club</span><strong>{fa.exTeam ?? '—'}{fa.exRank ? ` (${fa.exRank} last season)` : ''}</strong></div>
            <div className="kc-kv"><span>Offers tabled</span><strong>{fa.offers} · amounts hidden</strong></div>
            <div className="kc-kv"><span>Minimum offer</span><strong>{money(minFor(3))} a year over 3 years</strong></div>
            {existing && <div className="kc-kv"><span>Your current offer</span><strong>{existing.years} × {money(existing.salary_k)} · score {existing.score}</strong></div>}
          </div>
        </div>
        <Side />
      </div>
    );
    if (step === 1) return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <h3 style={{ font: '600 20px var(--font)' }}>How long, and how much?</h3>
          <p className="kc-sub" style={{ marginBottom: 14 }}>Longer deals are cheaper each year. You carry the risk if he drops off.</p>
          <div className="kc-opts" style={{ gridTemplateColumns: `repeat(${s.max_years}, minmax(0, 1fr))` }}>
            {Array.from({ length: s.max_years }, (_, i) => i + 1).map((y) => {
              const blocked = y >= 4 && longUsed >= s.long_deal_limit;
              return (
                <button key={y} type="button" className="kc-opt" aria-pressed={years === y} disabled={blocked} onClick={() => setYears(y)}>
                  <small style={{ fontWeight: 600 }}>{y} year{y > 1 ? 's' : ''}</small><b>{money(minFor(y))}</b>
                  <small style={blocked || (player.age && player.age + y > 33) ? { color: '#a8461f', fontWeight: 600 } : undefined}>
                    {blocked ? 'No long-deal slot' : player.age && player.age + y > 33 ? `Age ${player.age + y} at end` : y === 3 ? 'Market rate' : `${Math.round(((LF[y] ?? 1) - 1) * 100) > 0 ? '+' : ''}${Math.round(((LF[y] ?? 1) - 1) * 1000) / 10}%`}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="kc-card" style={{ padding: 16, marginTop: 16 }}>
            <label className="kc-field" htmlFor="kc-extra" style={{ flexDirection: 'row', justifyContent: 'space-between' }}><span>Go above his rate to beat rival offers</span><span className="num">+{money(extra)} a year</span></label>
            <input id="kc-extra" type="range" min={0} max={40} step={1} value={extra} onChange={(e) => setExtra(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--khq-sage)', height: 28 }} />
          </div>
          <p className="kc-sub" style={{ marginTop: 12 }}>Long-deal slots used: <strong>{longUsed} of {s.long_deal_limit}</strong>. 4- and 5-year deals use one.</p>
        </div>
        <Side />
      </div>
    );
    if (step === 2) return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <h3 style={{ font: '600 20px var(--font)' }}>How hard is he to poach?</h3>
          <p className="kc-sub" style={{ marginBottom: 14 }}>Rivals can pay his release clause in a window and take him. A higher clause costs salary.</p>
          <div className="kc-opts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {(['standard', 'high', 'none'] as ClauseTier[]).map((t) => {
              const sal = Math.round(base * (1 + (t === 'high' ? s.high_pct : t === 'none' ? s.none_pct : 0) / 100));
              const c = clauseKt(t);
              return (
                <button key={t} type="button" className="kc-opt" aria-pressed={tier === t} onClick={() => setTier(t)} style={{ minHeight: 150 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{t === 'standard' ? 'Standard' : t === 'high' ? 'High' : 'No clause'}</span>
                  <small>Salary <strong style={{ color: 'var(--ink)' }}>{money(sal)}</strong></small>
                  <small>Clause <strong style={{ color: 'var(--ink)' }}>{c == null ? 'Can’t be bought' : kt(c)}</strong></small>
                  <small>{t === 'standard' ? `${s.clause_std}× his rate. Halves in his final year.` : t === 'high' ? `${s.clause_high}× his rate. Costs ${s.high_pct}% more salary.` : `Only leaves in a trade you agree to. Costs ${s.none_pct}% more salary.`}</small>
                </button>
              );
            })}
          </div>
          <p className="kc-card" style={{ padding: '12px 14px', marginTop: 14, fontSize: 13, background: 'var(--sunk)', border: 0 }}>
            <strong>Depth floor still protects you.</strong> Nobody can pay a clause that would leave you under {s.floor_def} DEF, {s.floor_mid} MID, {s.floor_ruc} RUC or {s.floor_fwd} FWD fit players.
          </p>
        </div>
        <Side />
      </div>
    );
    if (step === 3) return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <h3 style={{ font: '600 20px var(--font)' }}>Sweeten it{fa.exTeam ? ` for ${fa.exTeam}?` : '?'}</h3>
          <p className="kc-sub" style={{ marginBottom: 14 }}>Optional compensation to his former club. It adds to your offer score. Tokens are held until offers close and come back if you lose.</p>
          <div className="kc-card" style={{ padding: 16 }}>
            <label className="kc-field" htmlFor="kc-sweet" style={{ flexDirection: 'row', justifyContent: 'space-between' }}><span>Tokens</span><span className="num">{kt(sweet)}</span></label>
            <input id="kc-sweet" type="range" min={0} max={Math.max(existing?.sweet_kt ?? 0, Math.min(bank + (existing?.sweet_kt ?? 0), 5000))} step={100} value={sweet} onChange={(e) => setSweet(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--khq-sage)', height: 28 }} />
            <p className="kc-sub" style={{ fontSize: 12 }}>50 KT = 1 score point · you have {kt(bank)}</p>
          </div>
          <p className="kc-field" style={{ marginTop: 14 }}>Draft picks</p>
          {picks.length === 0 ? <p className="kc-sub">You don’t own any picks.</p> : (
            <div className="kc-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
              {picks.map((pk) => {
                const on = pickIds.includes(pk.id);
                return (
                  <label key={pk.id} className="kc-opt" style={on ? { border: '2px solid var(--khq-sage)', padding: 13, background: '#f4f7f3', flexDirection: 'row', alignItems: 'center', gap: 10 } : { flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" checked={on} onChange={() => setPickIds((ids) => (on ? ids.filter((i) => i !== pk.id) : [...ids, pk.id]))} style={{ width: 18, height: 18, accentColor: 'var(--khq-sage)' }} />
                    <span><strong style={{ display: 'block', fontSize: 13 }}>{pk.label}</strong><small>{Math.round(3000 * Math.exp(-0.07 * (pk.overall - 1)) / 50)} pts</small></span>
                  </label>
                );
              })}
            </div>
          )}
          {s.shadow && <p className="kc-sub" style={{ marginTop: 10 }}>Shadow season: picks count toward your score but no real pick moves.</p>}
          <div className="kc-card" style={{ padding: '6px 16px', marginTop: 14, background: 'var(--sunk)', border: 0 }}>
            <div className="kc-kv"><span>Contract: {years} × {money(base)}</span><strong>{years * base}</strong></div>
            <div className="kc-kv"><span>Tokens: {kt(sweet)}</span><strong>{Math.trunc(sweet / 50)}</strong></div>
            <div className="kc-kv"><span>Picks</span><strong>{pickScore}</strong></div>
            <div className="kc-kv" style={{ fontWeight: 700 }}><span style={{ color: 'var(--ink)' }}>Offer score</span><strong>{score}</strong></div>
          </div>
        </div>
        <Side />
      </div>
    );
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <h3 style={{ font: '600 20px var(--font)' }}>Check and table it</h3>
          <p className="kc-sub" style={{ marginBottom: 14 }}>Once tabled you can raise it until offers close, but you can’t cut it.</p>
          <div className="kc-card" style={{ padding: '6px 16px' }}>
            <div className="kc-kv"><span>Contract</span><strong>{years} year{years > 1 ? 's' : ''} · {money(capSalary)} a year</strong></div>
            <div className="kc-kv"><span>Release clause</span><strong>{tier === 'none' ? 'None' : `${tier === 'high' ? 'High' : 'Standard'} · ${kt(clauseKt(tier)!)}`}</strong></div>
            <div className="kc-kv"><span>Sweetener</span><strong>{sweet ? kt(sweet) : 'None'}{pickIds.length ? ` + ${picks.filter((p) => pickIds.includes(p.id)).map((p) => p.label).join(', ')}` : ''}</strong></div>
            <div className="kc-kv"><span>Offer score</span><strong>{score}</strong></div>
          </div>
          <div className="kc-grid" style={{ marginTop: 12, gap: 10 }}>
            <div className="kc-card" style={{ padding: 14, background: 'var(--sunk)', border: 0 }}><div className="kc-stat"><span>Season cap after</span><b style={{ fontSize: 20 }}>{money(after)}</b><em>of {money(s.season_cap_k)}</em></div></div>
            <div className={`kc-card${taxKt ? ' warn' : ''}`} style={{ padding: 14, border: 0 }}><div className="kc-stat"><span>Luxury tax</span><b style={{ fontSize: 20 }}>{taxKt ? `${kt(taxKt)}` : 'None'}</b><em>per season</em></div></div>
            <div className="kc-card" style={{ padding: 14, background: 'var(--sunk)', border: 0 }}><div className="kc-stat"><span>Bank after</span><b style={{ fontSize: 20 }}>{kt(bank - Math.max(0, escrowNeeded))}</b><em>tokens held until close</em></div></div>
          </div>
          {overCap && <p className="kc-msg err" style={{ marginTop: 12 }}>That takes you over the {money(s.season_cap_k)} season cap.</p>}
          {tooPoor && <p className="kc-msg err" style={{ marginTop: 12 }}>You don’t have enough tokens for that sweetener.</p>}
          {belowExisting && <p className="kc-msg err" style={{ marginTop: 12 }}>A tabled offer can only go up. Yours scores {existing!.score}.</p>}
          {longBlocked && <p className="kc-msg err" style={{ marginTop: 12 }}>You’ve used all {s.long_deal_limit} long-deal slots.</p>}
          {error && <p className="kc-msg err" style={{ marginTop: 12 }}>{error}</p>}
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, fontSize: 14 }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--khq-sage)' }} />
            I understand a tabled offer can only go up{taxKt ? ' and that I’ll pay luxury tax' : ''}.
          </label>
        </div>
        <Side />
      </div>
    );
  };

  return (
    <div className="kc-modal-back">
      <div className="kc-modal" role="dialog" aria-modal="true" aria-labelledby="kc-offer-h">
        <div className="kc-modal-head">
          <div className="row-between" style={{ alignItems: 'center' }}>
            <div>
              <span className="eyebrow" style={{ color: 'var(--khq-brass-text)' }}>{existing ? 'Raise your offer' : 'Offer contract'} · free agent</span>
              <h2 id="kc-offer-h" style={{ font: '600 22px var(--font)', marginTop: 2 }}>{player.name}</h2>
            </div>
            <Link href="/contracts/market" className="kc-btn" aria-label="Close">✕</Link>
          </div>
          <ol className="kc-steps">
            {STEPS.map((l, i) => <li key={l} data-n={i + 1} className={done || i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step && !done ? 'step' : undefined}>{l}</li>)}
          </ol>
        </div>
        <div className="kc-modal-body">{body()}</div>
        <div className="kc-modal-foot">
          {done ? <>
            <Link href="/contracts/market" className="kc-btn">Back to market</Link>
            <span className="kc-sub">Raise any time before offers close</span>
            <Link href="/contracts" className="kc-btn dark">Done</Link>
          </> : <>
            {step === 0 ? <Link href="/contracts/market" className="kc-btn">Cancel</Link> : <button type="button" className="kc-btn" onClick={() => setStep(step - 1)}>Back</button>}
            <span className="kc-sub">Step {step + 1} of 5</span>
            {step < 4
              ? <button type="button" className="kc-btn dark" disabled={step === 1 && longBlocked} onClick={() => setStep(step + 1)}>{step === 0 ? 'Build offer' : `Next: ${STEPS[step + 1].toLowerCase()}`}</button>
              : <button type="button" className="kc-btn dark" disabled={pending || !ack || overCap || tooPoor || belowExisting || longBlocked} onClick={submit}>{pending ? 'Tabling…' : existing ? 'Raise offer' : 'Table offer'}</button>}
          </>}
        </div>
      </div>
    </div>
  );
}
