'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AvgChip, ClubDot, PosDots } from '@/components/bits';
import { C, type Line } from '@/lib/ratings';
import { saveKeepers } from './actions';

interface P { id: number; name: string; positions: Line[]; afl_club: string | null; average: number | null; games: number | null; value: number; is_keeper: boolean; is_rookie_keeper: boolean }

export function KeeperPicker({ teamId, players }: { teamId: number; players: P[] }) {
  const router = useRouter();
  const [keepers, setKeepers] = useState(new Set(players.filter((p) => p.is_keeper).map((p) => p.id)));
  const [rookie, setRookie] = useState<number | null>(players.find((p) => p.is_rookie_keeper)?.id ?? null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const full = keepers.size >= 17;

  function toggle(id: number) {
    const next = new Set(keepers);
    if (next.has(id)) next.delete(id);
    else if (!full) { next.add(id); if (rookie === id) setRookie(null); }
    setKeepers(next);
  }

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveKeepers(teamId, [...keepers], rookie);
      if ('error' in res && res.error) setMsg(res.error);
      else { setMsg('Keepers saved'); router.refresh(); }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="ribbon" style={{ position: 'sticky', top: 64, zIndex: 5 }}>
        <div className="kpis">
          <div className="kpi"><span className="eyebrow">Keepers</span><b style={{ color: full ? C.green5 : C.ink }}>{keepers.size} / 17</b></div>
          <div className="kpi"><span className="eyebrow">Rookie</span><b>{rookie ? players.find((p) => p.id === rookie)?.name : 'None'}</b></div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && <span role="status" style={{ fontSize: 13, color: msg === 'Keepers saved' ? C.green5 : C.redFg }}>{msg}</span>}
          <button type="button" className="btn dark" onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save keepers'}</button>
        </div>
      </div>
      <div className="table-box">
        <table className="squad">
          <thead>
            <tr><th style={{ width: 70 }}>Keep</th><th style={{ width: 80 }}>Rookie</th><th>Player</th><th style={{ width: 90 }}>Pos</th><th style={{ width: 60, textAlign: 'center' }}>Avg</th><th style={{ width: 60, textAlign: 'center' }}>Games</th><th style={{ width: 60, textAlign: 'center' }}>Value</th></tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const rookieOk = (p.games ?? 0) <= 10;
              return (
                <tr key={p.id} style={{ background: keepers.has(p.id) ? '#f1f6ee' : rookie === p.id ? '#f8f4e2' : undefined }}>
                  <td>
                    <input type="checkbox" id={`k-${p.id}`} checked={keepers.has(p.id)} disabled={!keepers.has(p.id) && full} onChange={() => toggle(p.id)} style={{ width: 18, height: 18 }} />
                    <label htmlFor={`k-${p.id}`} className="sr-only">Keep {p.name}</label>
                  </td>
                  <td>
                    {rookieOk ? (
                      <>
                        <input type="radio" name="rookie" id={`r-${p.id}`} checked={rookie === p.id} onChange={() => { setRookie(p.id); const n = new Set(keepers); n.delete(p.id); setKeepers(n); }} style={{ width: 18, height: 18 }} />
                        <label htmlFor={`r-${p.id}`} className="sr-only">Make {p.name} the rookie keeper</label>
                      </>
                    ) : <span className="muted" title="Rookie keepers must have played 10 games or fewer">–</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontWeight: 600 }}><ClubDot code={p.afl_club} size={16} />{p.name}</span></td>
                  <td><PosDots positions={p.positions} /></td>
                  <td style={{ textAlign: 'center' }}><AvgChip value={p.average} /></td>
                  <td style={{ textAlign: 'center' }}>{p.games ?? '–'}</td>
                  <td style={{ textAlign: 'center' }} className="mono">{p.value}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rookie && (
        <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setRookie(null)}>Clear rookie keeper</button>
      )}
    </div>
  );
}
