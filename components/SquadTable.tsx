'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AvgChip, ClubDot, FormArrow, PosDots, ScoreChip, Stars } from '@/components/bits';
import { C, type Form, type Line } from '@/lib/ratings';

export interface SquadPlayer {
  id: number; name: string; positions: Line[]; afl_club: string | null; average: number | null;
  last5: (number | null)[]; games: number | null; tons: number; form: Form;
  valueStars: number; potential: number | null; is_keeper: boolean; status: string | null;
}
export interface SquadGroup { name: string; colour: string; players: SquadPlayer[] }
export interface SquadBlock { title: string; sub: string; groups: SquadGroup[] }

/** Starting 22 + extended squad. The Last 5 column folds away to give the analysis panel more room. */
export function SquadTable({ blocks, onToggle }: { blocks: SquadBlock[]; onToggle?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const cols = open ? 10 : 9;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -12 }}>
        <button type="button" className="btn" aria-expanded={open} onClick={() => { setOpen(!open); onToggle?.(!open); }}>
          <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
            <path d={open ? 'M12 5 L7 10 L12 15' : 'M8 5 L13 10 L8 15'} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {open ? 'Hide last 5' : 'Show last 5'}
        </button>
      </div>
      {blocks.map((b) => (
        <section key={b.title} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row-between">
            <h2 className="h2">{b.title}</h2>
            <span className="muted" style={{ fontSize: 13 }}>{b.sub}</span>
          </div>
          <div className="table-box">
            <table className="squad" style={{ minWidth: open ? 760 : 580 }}>
              <thead>
                <tr>
                  <th style={{ width: 82 }}>Pos</th>
                  <th style={{ width: 26 }}><span className="sr-only">Club</span></th>
                  <th>Player</th>
                  <th style={{ width: 54, textAlign: 'center' }}>Avg</th>
                  {open && <th style={{ width: 176, textAlign: 'center' }}>Last 5</th>}
                  <th style={{ width: 40, textAlign: 'center' }}>Form</th>
                  <th style={{ width: 38, textAlign: 'center' }}>Apps</th>
                  <th style={{ width: 38, textAlign: 'center' }} title="100+ scores in the last 5">100s</th>
                  <th style={{ width: 78 }}>Value</th>
                  <th style={{ width: 78 }}>Pot.</th>
                </tr>
              </thead>
              {b.groups.map((g) => (
                <tbody key={g.name}>
                  <tr className="group">
                    <td colSpan={cols}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="dot" style={{ background: g.colour }} />{g.name}
                        <span className="muted" style={{ fontWeight: 400 }}>{g.players.length}</span>
                      </span>
                    </td>
                  </tr>
                  {g.players.map((p) => (
                    <tr key={p.id}>
                      <td><PosDots positions={p.positions} /></td>
                      <td style={{ paddingLeft: 2, paddingRight: 2 }}><ClubDot code={p.afl_club} /></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <Link href={`/players/${p.id}`}>{p.name}</Link>
                        {p.is_keeper && <span className="keeper-tag">K</span>}
                        {p.status && <span className="pill" style={{ marginLeft: 6, background: '#f3c2b9', color: '#7a1d12' }}>{p.status}</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}><AvgChip value={p.average} /></td>
                      {open && (
                        <td>
                          <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                            {[...p.last5].reverse().map((s, i) => <ScoreChip key={i} value={s} />)}
                          </div>
                        </td>
                      )}
                      <td style={{ textAlign: 'center' }}><FormArrow form={p.form} /></td>
                      <td style={{ textAlign: 'center' }}>{p.games ?? '–'}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{p.tons}</td>
                      <td><Stars value={p.valueStars} label="Value" /></td>
                      <td><Stars value={p.potential} colour={C.green5} label="Potential" /></td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </section>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center', fontSize: 12 }} className="muted">
        <span className="eyebrow">Scores</span>
        {([['120+', C.green5], ['100–119', C.green4], ['70–99', C.green3], ['50–69', C.yellow], ['Under 50', C.redBg]] as const).map(([l, c]) => (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 10, borderRadius: 3, background: c }} />{l}
          </span>
        ))}
      </div>
    </div>
  );
}
