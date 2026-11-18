'use client';
// One club's "add to my side" row: type (player, pick, KT), then the asset, then who gets it (only asked with 3+ clubs).
import { useState } from 'react';

export interface TradeAsset { key: string; label: string; value: string }

export function TradeAdd({ from, toOptions, players, picks, bank, action }: {
  from: number; toOptions: { id: number; name: string }[]; players: TradeAsset[]; picks: TradeAsset[];
  bank: number | null; action: (form: FormData) => void;
}) {
  const [kind, setKind] = useState<'player' | 'pick' | 'kt'>(players.length ? 'player' : 'pick');
  const [asset, setAsset] = useState('');
  const [kt, setKt] = useState('');
  const [to, setTo] = useState(toOptions[0]?.id ?? 0);
  const list = kind === 'player' ? players : picks;
  const ktN = Math.floor(Number(kt) || 0);
  const value = kind === 'kt' ? (ktN > 0 ? `kt:${ktN}` : '') : asset;
  return (
    <form action={action} className="td-add">
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="asset" value={value} />
      <label className="sr-only" htmlFor={`k-${from}`}>Type</label>
      <select id={`k-${from}`} className="input" value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setAsset(''); }}>
        <option value="player">Player</option>
        <option value="pick">Pick</option>
        <option value="kt">KT</option>
      </select>
      {kind === 'kt' ? (
        <input className="input" type="number" min={1} step={5} max={bank ?? undefined} inputMode="numeric" placeholder={bank != null ? `Up to ${bank.toLocaleString('en-AU')} KT` : 'How much KT'} value={kt} onChange={(e) => setKt(e.target.value)} aria-label="KT amount" />
      ) : (
        <select className="input" value={asset} onChange={(e) => setAsset(e.target.value)} aria-label={kind === 'player' ? 'Player' : 'Pick'}>
          <option value="" disabled>{kind === 'player' ? (list.length ? 'Choose a player…' : 'No players') : (list.length ? 'Choose a pick…' : 'No picks')}</option>
          {list.map((a) => <option key={a.key} value={a.key}>{a.label} · {a.value}</option>)}
        </select>
      )}
      {toOptions.length > 1 && (
        <select className="input" value={to} onChange={(e) => setTo(Number(e.target.value))} aria-label="Goes to">
          {toOptions.map((t) => <option key={t.id} value={t.id}>to {t.name}</option>)}
        </select>
      )}
      <button className="btn dark" disabled={!value}>Add</button>
    </form>
  );
}
