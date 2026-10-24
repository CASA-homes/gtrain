'use client';
import { useState } from 'react';

export interface RMComp { comp: string; head: string[]; rows: string[][] }

// Rookie Me's stat tables: totals first (K HB D M CP UP T HO CLR I50 R50 GL GM), then per-game averages (K H D M HO T G DC).
const n = (x: string) => Number(x) || 0;
const COMP_NAME: Record<string, string> = {
  'AFL U18 Championships': 'Under 18 National Championships',
  'Coates Talent League Boys': 'Talent League',
  'AFL U16 Championships': 'Under 16 National Championships',
};
const short = (t: string) => t.replace('Vic Country', 'Vic C.').replace('Vic Metro', 'Vic M.').replace('Western Australia', 'WA').replace('South Australia', 'SA').replace('Pioneers', '').replace('Dragons', '').trim();

function rowsOf(c: RMComp) {
  return c.rows.filter((r) => r[0] !== 'Total' && n(r[14]) > 0).map((r) => {
    const gm = n(r[14]);
    return {
      yr: r[0], team: r[1], gm, d: n(r[17]), k: n(r[15]), h: n(r[16]), m: n(r[18]), t: n(r[20]), g: n(r[21]), ho: n(r[19]), dc: n(r[22]),
      cp: n(r[6]) / gm, clr: n(r[10]) / gm, i50: n(r[11]) / gm, r50: n(r[12]) / gm,
    };
  }).sort((a, b) => b.yr.localeCompare(a.yr));
}

const COLS: [string, string, (r: ReturnType<typeof rowsOf>[number]) => string][] = [
  ['Gm', 'Games', (r) => String(r.gm)],
  ['Fan', 'Fantasy average (Rookie Me scoring)', (r) => String(Math.round(r.dc))],
  ['D', 'Disposals', (r) => r.d.toFixed(1)],
  ['K', 'Kicks', (r) => r.k.toFixed(1)],
  ['HB', 'Handballs', (r) => r.h.toFixed(1)],
  ['CP', 'Contested possessions', (r) => r.cp.toFixed(1)],
  ['M', 'Marks', (r) => r.m.toFixed(1)],
  ['T', 'Tackles', (r) => r.t.toFixed(1)],
  ['Clr', 'Clearances', (r) => r.clr.toFixed(1)],
  ['I50', 'Inside 50s', (r) => r.i50.toFixed(1)],
  ['R50', 'Rebound 50s', (r) => r.r50.toFixed(1)],
  ['G', 'Goals', (r) => r.g.toFixed(1)],
];

/** "Stats" button for a prospect's draft profile: opens his junior season averages by competition. */
export function JuniorStats({ comps, name }: { comps: RMComp[]; name: string }) {
  const [open, setOpen] = useState(false);
  const sections = comps.map((c) => ({ name: COMP_NAME[c.comp] ?? c.comp, rows: rowsOf(c) })).filter((s) => s.rows.length);
  if (!sections.length) return null;
  const all = sections.flatMap((s) => s.rows.map((r) => ({ ...r, comp: s.name })));
  const best = all.filter((r) => r.gm >= 2).sort((a, b) => b.dc - a.dc)[0];
  const hasRuck = all.some((r) => r.ho >= 5);
  const cols = hasRuck ? [...COLS.slice(0, 8), ['HO', 'Hitouts', (r: (typeof all)[number]) => r.ho.toFixed(1)] as (typeof COLS)[number], ...COLS.slice(8)] : COLS;
  return (
    <>
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}
        style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, background: open ? 'var(--ink)' : undefined, color: open ? '#fff' : undefined }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
        Stats
      </button>
      {open && (
        <div className="jstats" style={{ flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {best && (
            <div className="tile" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="eyebrow">Best season</span>
              <span style={{ fontSize: 13 }}><span style={{ fontWeight: 600 }}>{best.yr} {best.comp}</span> ({short(best.team)}): {Math.round(best.dc)} fantasy, {best.d.toFixed(1)} disposals, {best.t.toFixed(1)} tackles, {best.clr.toFixed(1)} clearances from {best.gm} games</span>
            </div>
          )}
          {sections.map((s) => (
            <div key={s.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="eyebrow">{s.name} · averages per game</span>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table className="squad" style={{ minWidth: 520, fontSize: 12 }} aria-label={`${name}: ${s.name}`}>
                  <thead><tr><th>Year</th>{cols.map(([c, t]) => <th key={c} title={t} style={{ textAlign: 'right' }}>{c}</th>)}</tr></thead>
                  <tbody>
                    {s.rows.map((r) => (
                      <tr key={r.yr + r.team}>
                        <td style={{ whiteSpace: 'nowrap' }}><b>{r.yr}</b> <span className="muted">{short(r.team)}</span></td>
                        {cols.map(([c, , f]) => <td key={c} className="mono" style={{ textAlign: 'right', fontWeight: c === 'Fan' ? 700 : 400 }}>{f(r)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <span className="muted" style={{ fontSize: 11 }}>From Rookie Me Central. Fan is Rookie Me’s fantasy score; CP, Clr, I50 and R50 are per game from season totals.</span>
        </div>
      )}
    </>
  );
}
