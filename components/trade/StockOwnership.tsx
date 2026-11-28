'use client';
// Finances › Stock ownership: the club's shares, what it paid, what they're worth and what it would get back today.
import Link from 'next/link';
import { useState } from 'react';
import { ShareSheet, type ShareTarget } from '@/components/trade/ShareSheet';
import { sellReturn, shareRoom, type ShareRules } from '@/lib/shares';

export interface Holding { id: number; name: string; sub: string; qty: number; cost: number; price: number; sold: number; games: number; season: number | null }

const kt = (n: number) => `${Math.round(n).toLocaleString('en-AU')} KT`;
const sg = (n: number) => `${n >= 0 ? '+' : '−'}${kt(Math.abs(n))}`;

export function StockOwnership({ rows, rules, bank, mine }: { rows: Holding[]; rules: ShareRules; bank: number; mine: boolean }) {
  const [sheet, setSheet] = useState<ShareTarget | null>(null);
  const paid = rows.reduce((t, r) => t + r.cost, 0);
  const value = rows.reduce((t, r) => t + r.price * r.qty, 0);
  const back = rows.reduce((t, r) => t + sellReturn(r.price, r.qty, r.qty, r.cost, rules.feePct, rules.taxPct).net, 0);
  const room = shareRoom(bank, paid, rules.limitPct);

  return (
    <>
      <div className="fn-split four">
        <div><span>Portfolio value</span><b>{kt(value)}</b></div>
        <div><span>You paid</span><b>{kt(paid)}</b></div>
        <div><span>Gain</span><b className={value - paid > 0 ? 'up' : value - paid < 0 ? 'dn' : ''}>{sg(value - paid)}</b></div>
        <div><span>If you sold all today</span><b>{kt(back)}</b>{rows.length ? <em className={back - paid >= 0 ? 'up' : 'dn'}>{sg(back - paid)} after fees and tax</em> : null}</div>
      </div>
      {rows.length ? (
        <div className="fn-stocks">
          <table>
            <thead><tr><th>Player</th><th>Shares</th><th>Paid a share</th><th>Now</th><th>Change</th><th>Value</th><th>Sell today</th>{mine && <th aria-label="Sell" />}</tr></thead>
            <tbody>
              {rows.map((r) => {
                const per = r.cost / r.qty, chg = ((r.price - per) / per) * 100;
                const s = sellReturn(r.price, r.qty, r.qty, r.cost, rules.feePct, rules.taxPct);
                return (
                  <tr key={r.id}>
                    <td><Link href={`/players/${r.id}`}><b>{r.name}</b></Link><small>{r.sub}</small></td>
                    <td>{r.qty} <span className="mut">of {rules.supply}</span></td>
                    <td>{kt(per)}</td>
                    <td>{kt(r.price)}</td>
                    <td className={chg > 0.05 ? 'up' : chg < -0.05 ? 'dn' : ''}>{chg > 0.05 ? '▲' : chg < -0.05 ? '▼' : ''} {Math.abs(chg).toFixed(1)}%</td>
                    <td>{kt(r.price * r.qty)}</td>
                    <td className={s.pl >= 0 ? 'up' : 'dn'}>{kt(s.net)} <small>{sg(s.pl)}</small></td>
                    {mine && <td><button type="button" className="kc-btn small" onClick={() => setSheet({ id: r.id, name: r.name, sub: r.sub, price: r.price, sold: r.sold, mine: r.qty, myCost: r.cost, games: r.games, season: r.season })}>Sell</button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="kc-sub" style={{ margin: '8px 0 0' }}>Shares sell back to the league at the player’s market value, less a {rules.feePct}% fee and {rules.taxPct}% tax on profit. {mine ? `You can invest ${kt(room)} more (${rules.limitPct}% of your KT).` : ''}</p>
        </div>
      ) : (
        <div className="fn-stock-empty">
          <b>No shares yet</b>
          <p>Buy shares in any player with KT: {rules.supply} shares per player, up to {rules.maxClub} per club. A share costs his market value, so it rises and falls with his form. A {rules.feePct}% fee goes to the league when you buy and when you sell, plus {rules.taxPct}% tax on profit. Players are protected until they’ve played {rules.lockGames} games. Up to {rules.limitPct}% of your KT can be in shares.</p>
          <Link href="/market" className="kc-btn small">Browse the player market</Link>
        </div>
      )}
      {sheet && <ShareSheet mode="sell" t={sheet} rules={rules} bank={bank} heldCost={paid} onClose={() => setSheet(null)} />}
    </>
  );
}
