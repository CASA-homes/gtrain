'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AvgChip, ClubDot, PosDots } from '@/components/bits';
import { C, type Line } from '@/lib/ratings';
import { saveKeepers } from './actions';

interface P { id: number; name: string; positions: Line[]; afl_club: string | null; average: number | null; games: number | null; value: number; is_keeper: boolean; is_rookie_keeper: boolean }

/**
 * 17 keepers plus an 18th "rookie" slot for a player with 10 or fewer career games.
 * Keeper only shows 2026 games, so career eligibility is on the honour system (the commish can check),
 * with a warning when the 2026 count alone is already over 10.
 */
export function KeeperPicker({ teamId, players }: { teamId: number; players: P[] }) {
  const router = useRouter();
  const [keepers, setKeepers] = useState(new Set(players.filter((p) => p.is_keeper).map((p) => p.id)));
  const [rookie, setRookie] = useState<number | null>(players.find((p) => p.is_rookie_keeper)?.id ?? null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const full = keepers.size >= 17;
  const rookiePlayer = players.find((p) => p.id === rookie);

  function toggle(id: number) {
    const next = new Set(keepers);
    if (next.has(id)) next.delete(id);
    else if (!full) next.add(id);
    if (rookie === id) setRookie(null);
    setKeepers(next);
  }

  function pickRookie(id: number | null) {
    setRookie(id);
    if (id) { const next = new Set(keepers); next.delete(id); setKeepers(next); }
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
          <div className="kpi"><span className="eyebrow">18th: rookie slot</span><b>{rookiePlayer ? rookiePlayer.name : 'Empty'}</b></div>
          <div className="kpi"><span className="eyebrow">Total kept</span><b>{keepers.size + (rookie ? 1 : 0)} / 18</b></div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && <span role="status" style={{ fontSize: 13, color: msg === 'Keepers saved' ? C.green5 : C.redFg }}>{msg}</span>}
          <button type="button" className="btn dark" onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save keepers'}</button>
        </div>
      </div>

      <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row-between">
          <h2 className="h2">18th keeper: rookie slot</h2>
          <span className="muted" style={{ fontSize: 13 }}>A player with 10 or fewer career AFL games</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label htmlFor="rookie" className="sr-only">Rookie keeper</label>
          <select id="rookie" className="input" style={{ minWidth: 260 }} value={rookie ?? ''} onChange={(e) => pickRookie(e.target.value ? Number(e.target.value) : null)}>
            <option value="">No rookie keeper</option>
            {[...players].sort((a, b) => (a.games ?? 0) - (b.games ?? 0)).map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.games ?? 0} games in 2026</option>
            ))}
          </select>
          {rookiePlayer && (rookiePlayer.games ?? 0) > 10 && (
            <span className="pill" style={{ background: C.yellow, color: C.ink, padding: '4px 10px' }}>
              {rookiePlayer.games} games in 2026 alone. Check he’s 10 or under for his career.
            </span>
          )}
        </div>
      </section>

      <div className="table-box">
        <table className="squad">
          <thead>
            <tr><th style={{ width: 70 }}>Keep</th><th>Player</th><th style={{ width: 90 }}>Pos</th><th style={{ width: 60, textAlign: 'center' }}>Avg</th><th style={{ width: 70, textAlign: 'center' }}>2026 games</th><th style={{ width: 60, textAlign: 'center' }}>Value</th></tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const isRookie = rookie === p.id;
              return (
                <tr key={p.id} style={{ background: keepers.has(p.id) ? '#f1f6ee' : isRookie ? '#f8f4e2' : undefined }}>
                  <td>
                    {isRookie ? <span className="pill" style={{ background: C.yellow }}>18th</span> : (
                      <>
                        <input type="checkbox" id={`k-${p.id}`} checked={keepers.has(p.id)} disabled={!keepers.has(p.id) && full} onChange={() => toggle(p.id)} style={{ width: 18, height: 18 }} />
                        <label htmlFor={`k-${p.id}`} className="sr-only">Keep {p.name}</label>
                      </>
                    )}
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
    </div>
  );
}
