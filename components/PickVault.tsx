'use client';
// Clubhouse picks: one year at a time (this year / next year), national draft first, then mid-season draft picks.
import { useState } from 'react';

export interface VaultPick { id: number; year: number; round: number; overall: number | null; kind: string; via: string | null; points: number }
export function PickVault({ picks, years }: { picks: VaultPick[]; years: number[] }) {
  const [year, setYear] = useState(years[0]);
  const shown = picks.filter((p) => p.year === year).sort((a, b) => Number(a.kind === 'msd') - Number(b.kind === 'msd') || a.round - b.round || (a.overall ?? 999) - (b.overall ?? 999));
  const total = shown.reduce((s, p) => s + p.points, 0);
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row-between"><h2 className="h2">Picks</h2><span className="muted" style={{ fontSize: 12 }}>{shown.length} held · {total.toLocaleString()} pts</span></div>
      <div className="card pv">
        <div className="pv-head">
          <span className="eyebrow">Draft year</span>
          <select className="pv-sel" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Draft year">
            {years.map((y, i) => <option key={y} value={y}>{y}{i === 0 ? ' · this year' : ' · next year'}</option>)}
          </select>
        </div>
        {shown.map((p) => (
          <div key={p.id} className="pv-row">
            <span className="pv-rd">R{p.round}</span>
            <span><span className="pv-no">{p.overall ? `#${p.overall}` : 'TBC'}</span>{p.via && <span className="pv-via"> · via {p.via}</span>}</span>
            {p.kind === 'msd' ? <span className="pv-tag">MSD</span> : <span />}
            <span className="pv-pts">{p.points.toLocaleString()}</span>
          </div>
        ))}
        {!shown.length && <div className="pv-empty">No {year} picks.</div>}
      </div>
    </section>
  );
}
