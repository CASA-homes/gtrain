'use client';
// Buy or sell shares in a player: how many, what it costs or returns after the fee and gains tax, what he has to reach
// before it pays, then swipe to confirm. The database checks every rule again (migration 0096).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { buyShares, sellShares } from '@/app/(app)/contracts/actions';
import { breakEven, buyCost, sellReturn, shareRoom, type ShareRules } from '@/lib/shares';
import './shares.css';

export interface ShareTarget {
  id: number; name: string; sub: string; price: number; sold: number; mine: number; myCost: number;
  games: number; season: number | null;
}

const kt = (n: number) => `${Math.round(n).toLocaleString('en-AU')} KT`;
const sg = (n: number) => `${n >= 0 ? '+' : '−'}${kt(Math.abs(n))}`;

export function ShareSheet({ mode, t, rules, bank, heldCost, onClose }: {
  mode: 'buy' | 'sell'; t: ShareTarget; rules: ShareRules; bank: number; heldCost: number; onClose: () => void;
}) {
  const router = useRouter();
  const left = Math.max(0, rules.supply - t.sold);
  const room = shareRoom(bank, heldCost, rules.limitPct);
  // Most he can buy: shares left, the club limit, and what the bank and the market allowance cover.
  const afford = (n: number) => buyCost(t.price, n, rules.feePct).total <= Math.min(bank, room);
  let maxBuy = Math.min(left, rules.maxClub - t.mine);
  while (maxBuy > 0 && !afford(maxBuy)) maxBuy--;
  const max = mode === 'buy' ? maxBuy : t.mine;
  const [q, setQ] = useState(Math.min(1, max));
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'err'>('idle');
  const [msg, setMsg] = useState('');
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState<{ start: number; max: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && state !== 'busy') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, state]);

  const b = buyCost(t.price, q, rules.feePct);
  const s = sellReturn(t.price, q, Math.max(1, t.mine), t.myCost, rules.feePct, rules.taxPct);
  const perShare = mode === 'buy' ? (q ? b.total / q : t.price * (1 + rules.feePct / 100)) : t.mine ? t.myCost / t.mine : t.price;
  const be = breakEven(perShare, rules.feePct, rules.taxPct);
  const scen = mode === 'buy' ? [[1.15, 'Rises 15%'], [1.3, 'Rises 30%'], [0.85, 'Falls 15%']].map(([f, label]) => {
    const r = sellReturn(Math.round(t.price * (f as number)), q, q, b.total, rules.feePct, rules.taxPct);
    return { label: `${label} to ${kt(Math.round(t.price * (f as number)))}`, back: r.net, pl: r.pl };
  }) : [];

  const locked = t.games < rules.lockGames;
  const why = mode === 'sell' ? null
    : !rules.open ? 'The share market is closed.'
    : locked ? `Protected: he’s played ${t.games} of ${rules.lockGames} games. Shares open at ${rules.lockGames}.`
    : left === 0 ? `All ${rules.supply} shares are owned.`
    : t.mine >= rules.maxClub ? `You hold the most a club can (${rules.maxClub}).`
    : maxBuy === 0 ? (buyCost(t.price, 1, rules.feePct).total > bank ? `One share costs ${kt(buyCost(t.price, 1, rules.feePct).total)} and you have ${kt(bank)}.` : `You’ve reached your ${rules.limitPct}% market allowance.`)
    : null;

  const fire = async () => {
    if (why || q < 1) return;
    setState('busy');
    const r = mode === 'buy' ? await buyShares(t.id, q) : await sellShares(t.id, q);
    if (r.ok) { setState('done'); setMsg(r.message); router.refresh(); }
    else { setState('err'); setMsg(r.message); setX(0); }
  };
  const down = (e: React.PointerEvent) => {
    if (state === 'busy' || state === 'done' || why) return;
    const w = track.current!.clientWidth - 54;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ start: e.clientX - x, max: w });
  };
  const move = (e: React.PointerEvent) => { if (drag) setX(Math.max(0, Math.min(drag.max, e.clientX - drag.start))); };
  const up = () => {
    if (!drag) return;
    const ok = x >= drag.max * 0.9;
    setDrag(null);
    if (ok) { setX(drag.max); fire(); } else setX(0);
  };
  const pct = drag ? x / drag.max : 0;
  const verb = mode === 'buy' ? 'buy' : 'sell';
  const cta = mode === 'buy' ? `Swipe to buy ${q} · ${kt(b.total)}` : `Swipe to sell ${q} · get ${kt(s.net)}`;

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="ss-back" role="dialog" aria-modal="true" aria-labelledby="ss-h" onClick={(e) => { if (e.target === e.currentTarget && state !== 'busy') onClose(); }}>
      <section className={`ss-sheet ${mode}`}>
        {state === 'done' ? (
          <div className="ss-done" role="status">
            <span className="ss-tick" aria-hidden="true">✓</span>
            <span className="ss-eb">{mode === 'buy' ? 'Shares bought' : 'Shares sold'}</span>
            <b className="ss-name">{t.name}</b>
            <p>{msg}</p>
            <button type="button" className="kc-btn dark" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div className="ss-top">
              <div>
                <span className="ss-eb">{mode === 'buy' ? 'Buy shares' : 'Sell shares'}</span>
                <h2 id="ss-h">{t.name}</h2>
                <div className="ss-sub">{mode === 'sell' ? `You own ${t.mine} · paid ${kt(t.myCost)} with the fee (${kt(t.mine ? t.myCost / t.mine : 0)} a share)` : t.sub}</div>
              </div>
              <button type="button" className="ss-x" onClick={onClose} aria-label="Close" disabled={state === 'busy'}>×</button>
            </div>

            {mode === 'buy' && (
              <div className="ss-facts">
                <div><span>Share price</span><b>{kt(t.price)}</b><em>= his value, ${t.price}k</em></div>
                <div><span>This season</span><b className={t.season == null ? '' : t.season >= 0 ? 'up' : 'dn'}>{t.season == null ? '—' : `${t.season >= 0 ? '▲' : '▼'} ${Math.abs(t.season).toFixed(1)}%`}</b><em>by his last 30 games</em></div>
                <div><span>Shares left</span><b>{left} of {rules.supply}</b>
                  <span className="ss-pips" aria-hidden="true">{Array.from({ length: rules.supply }, (_, i) => <i key={i} className={i < t.sold - t.mine ? 'o' : i < t.sold ? 'm' : i < t.sold + q ? 'n' : ''} />)}</span></div>
              </div>
            )}

            {why ? <p className="ss-why" role="alert">{why}</p> : (
              <>
                <div className="ss-qty">
                  <div><b>{mode === 'buy' ? 'How many?' : 'How many to sell?'}</b>
                    <span>{mode === 'buy' ? `Up to ${max}: ${left} left, max ${rules.maxClub} per club` : `Share price now: ${kt(t.price)} (his value, $${t.price}k)`}</span></div>
                  <div className="ss-step">
                    <button type="button" aria-label="One fewer" disabled={q <= 1 || state === 'busy'} onClick={() => setQ(q - 1)}>−</button>
                    <b aria-live="polite">{q}</b>
                    <button type="button" aria-label="One more" disabled={q >= max || state === 'busy'} onClick={() => setQ(q + 1)}>+</button>
                  </div>
                </div>

                {mode === 'buy' ? (
                  <dl className="ss-sum">
                    <div><dt>{q} × {kt(t.price)}</dt><dd>{kt(b.gross)}</dd></div>
                    <div className="mut"><dt>Buy fee ({rules.feePct}%, to the league)</dt><dd>{kt(b.fee)}</dd></div>
                    <div className="tot"><dt>You pay</dt><dd>{kt(b.total)}</dd></div>
                    <div className="mut sm"><dt>Bank after</dt><dd>{kt(bank - b.total)} · {kt(room - b.total)} market allowance left</dd></div>
                  </dl>
                ) : (
                  <dl className="ss-sum">
                    <div><dt>Sale: {q} × {kt(t.price)}</dt><dd>{kt(s.gross)}</dd></div>
                    <div className="mut"><dt>Sell fee ({rules.feePct}%, to the league)</dt><dd>−{kt(s.fee)}</dd></div>
                    <div className="mut"><dt>Gains tax ({rules.taxPct}% of profit over the {kt(s.basis)} you paid)</dt><dd>−{kt(s.tax)}</dd></div>
                    <div className="tot"><dt>You get back</dt><dd>{kt(s.net)}</dd></div>
                    <div className={`tot ${s.pl >= 0 ? 'up' : 'dn'}`}><dt>Profit</dt><dd>{sg(s.pl)}</dd></div>
                  </dl>
                )}

                {mode === 'buy' ? (
                  <div className="ss-scen">
                    <div className="row"><b>If you sell later</b><span>after the {rules.feePct}% sell fee and {rules.taxPct}% tax on profit</span></div>
                    {scen.map((c) => <div key={c.label} className="line"><span>{c.label}</span><span>{kt(c.back)}</span><b className={c.pl >= 0 ? 'up' : 'dn'}>{sg(c.pl)}</b></div>)}
                    <p>Break-even: he needs to reach <b>${Math.ceil(be)}k (+{Math.round(((be - t.price) / t.price) * 100)}%)</b> before you’re in profit.</p>
                  </div>
                ) : s.pl < 0 && t.price > (t.mine ? t.myCost / t.mine : 0) ? (
                  <p className="ss-warn">He’s up on what you paid, but the fees make this a loss. He needs to reach <b>${Math.ceil(be)}k</b> before selling pays.</p>
                ) : null}

                {state === 'err' && <p className="ss-why" role="alert">{msg}</p>}
              </>
            )}

            <div className="ss-foot">
              <div ref={track} className={`ss-track ${mode}${state === 'busy' ? ' busy' : ''}${why ? ' off' : ''}`}>
                <span className="ss-fill" style={{ width: `${x + 54}px`, transition: drag ? 'none' : 'width .25s' }} />
                <span className="ss-label" style={{ opacity: 1 - pct * 1.2 }}>{state === 'busy' ? 'Working…' : why ? 'Not available' : cta}</span>
                <button type="button" className="ss-knob" style={{ transform: `translateX(${x}px)`, transition: drag ? 'none' : 'transform .25s' }}
                  disabled={!!why} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                  onKeyDown={(e) => { if (e.key === 'Enter' && state !== 'busy') fire(); }}
                  aria-label={`Swipe or press Enter to ${verb} ${q} share${q > 1 ? 's' : ''} in ${t.name}`}>
                  {state === 'busy' ? '…' : '→'}
                </button>
              </div>
              <p>{mode === 'buy' ? `Shares use KT, never salary cap. Sell back to the league any time at his market value.` : 'KT goes straight to your bank. Fees and tax go to the league.'}</p>
            </div>
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}
