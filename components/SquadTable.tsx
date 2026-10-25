'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { AvgChip, FormArrow, PosDots, ScoreChip, Stars } from '@/components/bits';
import { Face } from '@/components/TradeHighlights';
import { C, LINES, type Form, type Line, type Slot } from '@/lib/ratings';
import { resetLineup, saveLineup } from '@/app/(app)/clubhouse/[id]/lineup-actions';

export interface SquadPlayer {
  id: number; name: string; positions: Line[]; afl_club: string | null; average: number | null;
  last5: (number | null)[]; games: number | null; tons: number; form: Form;
  valueStars: number; potential: number | null; is_keeper: boolean; status: string | null;
  slot: Slot | null;
  photo_path: string | null; dfs_id: string | null;
  age: number | null; prevAvg: number | null; delta: number | null; trend: -2 | -1 | 0 | 1 | 2 | null;
}

const TREND: Record<string, { colour: string; rot: number; label: string }> = {
  '2': { colour: '#1f6b3a', rot: -90, label: 'Rising fast' },
  '1': { colour: '#7cc47f', rot: -45, label: 'Rising' },
  '0': { colour: '#ecd56a', rot: 0, label: 'Steady' },
  '-1': { colour: '#f2a65a', rot: 45, label: 'Dipping' },
  '-2': { colour: '#d9483b', rot: 90, label: 'Falling' },
};

/** Arrow showing the general direction of a player's average across recent seasons. */
function TrendArrow({ trend }: { trend: SquadPlayer['trend'] }) {
  if (trend == null) return <span className="muted">–</span>;
  const t = TREND[String(trend)];
  return (
    <span title={t.label} aria-label={t.label} style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: 999, background: t.colour, alignItems: 'center', justifyContent: 'center' }}>
      <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true" style={{ transform: `rotate(${t.rot}deg)` }}>
        <path d="M4 10h11M11 5.5 15.5 10 11 14.5" fill="none" stroke={trend === 0 || trend === 1 ? '#1d2a20' : '#fff'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Delta({ p }: { p: SquadPlayer }) {
  if (p.delta == null) return <span className="muted">–</span>;
  const d = Math.round(p.delta);
  return <span className="mono" title={`2025: ${Math.round(p.prevAvg!)}`} style={{ fontWeight: 600, color: d > 0 ? '#1f6b3a' : d < 0 ? '#b8392e' : C.muted }}>{d > 0 ? '+' : ''}{d}</span>;
}

const LINE_NAMES: Record<Line, string> = { DEF: 'Defence', MID: 'Midfield', RUC: 'Ruck', FWD: 'Forward' };
const SLOT_COUNT: Record<Slot, number> = { DEF: 5, MID: 7, RUC: 1, FWD: 5, BENCH: 4 };

/** Can this player fill this slot? Bench and the extended squad take anyone. */
const fits = (p: SquadPlayer, s: Slot | null) => s == null || s === 'BENCH' || p.positions.includes(s);

/**
 * Starting 22 + extended squad. The owner can swap players by dragging one row onto another,
 * or by tapping the swap icon on two rows. Changes save in one go.
 */
export function SquadTable({ players, teamId, editable, saved, onToggle }: {
  players: SquadPlayer[]; teamId: number; editable: boolean; saved: boolean; onToggle?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<Map<number, Slot | null>>(() => new Map(players.map((p) => [p.id, p.slot])));
  const [picked, setPicked] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const dirty = players.some((p) => slots.get(p.id) !== p.slot);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  function swap(a: number, b: number) {
    if (a === b) return;
    const pa = byId.get(a)!, pb = byId.get(b)!;
    const sa = slots.get(a) ?? null, sb = slots.get(b) ?? null;
    if (!fits(pa, sb)) return setMsg({ text: `${pa.name} can’t play ${sb}.`, bad: true });
    if (!fits(pb, sa)) return setMsg({ text: `${pb.name} can’t play ${sa}.`, bad: true });
    const next = new Map(slots);
    next.set(a, sb); next.set(b, sa);
    setSlots(next);
    setMsg({ text: `${pa.name} ⇄ ${pb.name}` });
  }

  function tapSwap(id: number) {
    if (picked == null) { setPicked(id); setMsg({ text: `Pick who swaps with ${byId.get(id)!.name}` }); return; }
    if (picked === id) { setPicked(null); setMsg(null); return; }
    swap(picked, id);
    setPicked(null);
  }

  function save() {
    start(async () => {
      const res = await saveLineup(teamId, [...slots].map(([id, slot]) => ({ id, slot })));
      if ('error' in res && res.error) setMsg({ text: res.error, bad: true });
      else { setMsg({ text: 'Lineup saved' }); router.refresh(); }
    });
  }
  function reset() {
    start(async () => {
      const res = await resetLineup(teamId);
      if ('error' in res && res.error) setMsg({ text: res.error, bad: true });
      else { setMsg({ text: 'Back to the auto-picked Best 22' }); router.refresh(); }
    });
  }

  const sortAvg = (xs: SquadPlayer[]) => [...xs].sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  const inSlot = (s: Slot | null) => sortAvg(players.filter((p) => (slots.get(p.id) ?? null) === s));
  const blocks = [
    {
      title: 'Starting 22',
      sub: saved ? 'Set by the coach' : '5 DEF · 7 MID · 1 RUC · 5 FWD · 4 bench, auto-picked on 2026 average',
      groups: [
        ...LINES.map((l) => ({ key: l, name: LINE_NAMES[l], colour: C[l], players: inSlot(l), need: SLOT_COUNT[l] })),
        { key: 'BENCH', name: 'Bench', colour: C.muted, players: inSlot('BENCH'), need: SLOT_COUNT.BENCH },
      ],
    },
    { title: 'Extended squad', sub: `${inSlot(null).length} not selected`, groups: [{ key: 'EXT', name: 'Not selected', colour: C.muted, players: inSlot(null), need: 0 }] },
  ];
  const cols = (open ? 13 : 9) + (editable ? 1 : 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: -12 }}>
        {msg && <span role="status" style={{ fontSize: 13, marginRight: 'auto', color: msg.bad ? C.redFg : C.muted }}>{msg.text}</span>}
        {editable && saved && !dirty && <button type="button" className="btn" onClick={reset} disabled={pending}>Auto-pick</button>}
        {editable && dirty && (
          <>
            <button type="button" className="btn" onClick={() => { setSlots(new Map(players.map((p) => [p.id, p.slot]))); setPicked(null); setMsg(null); }} disabled={pending}>Undo</button>
            <button type="button" className="btn dark" onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save lineup'}</button>
          </>
        )}
        <button type="button" className="btn" aria-expanded={open} onClick={() => { setOpen(!open); onToggle?.(!open); }}>
          <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
            <path d={open ? 'M12 5 L7 10 L12 15' : 'M8 5 L13 10 L8 15'} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {open ? 'Hide detail' : 'Show detail'}
        </button>
      </div>
      {blocks.map((b) => (
        <section key={b.title} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row-between">
            <h2 className="h2">{b.title}</h2>
            <span className="muted" style={{ fontSize: 13 }}>{b.sub}</span>
          </div>
          <div className="table-box">
            <table className="squad" style={{ minWidth: open ? 930 : 610 }}>
              <thead>
                <tr>
                  {editable && <th style={{ width: 34 }}><span className="sr-only">Swap</span></th>}
                  <th style={{ width: 82 }}>Pos</th>
                  <th style={{ width: 40 }}><span className="sr-only">Player photo</span></th>
                  <th>Player</th>
                  <th style={{ width: 54, textAlign: 'center' }}>Avg</th>
                  {open && <th style={{ width: 176, textAlign: 'center' }}>Last 5</th>}
                  {open && <th style={{ width: 40, textAlign: 'center' }}>Age</th>}
                  {open && <th style={{ width: 48, textAlign: 'center' }} title="Change on last year's average">± ’25</th>}
                  {open && <th style={{ width: 50, textAlign: 'center' }} title="General trend of his average over recent seasons">Trend</th>}
                  <th style={{ width: 40, textAlign: 'center' }}>Form</th>
                  <th style={{ width: 38, textAlign: 'center' }}>Apps</th>
                  <th style={{ width: 38, textAlign: 'center' }} title="100+ scores in the last 5">100s</th>
                  <th style={{ width: 96 }}>Current ability</th>
                  <th style={{ width: 78 }}>Pot.</th>
                </tr>
              </thead>
              {b.groups.map((g) => (
                <tbody key={g.key}>
                  <tr className="group">
                    <td colSpan={cols}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="dot" style={{ background: g.colour }} />{g.name}
                        <span className="muted" style={{ fontWeight: 400 }}>{g.need && g.players.length !== g.need ? `${g.players.length} of ${g.need}` : g.players.length}</span>
                      </span>
                    </td>
                  </tr>
                  {g.players.map((p) => {
                    const isPicked = picked === p.id;
                    const pickedP = picked != null ? byId.get(picked)! : null;
                    // While a player is picked, dim the rows he can't swap with.
                    const blocked = pickedP && !isPicked && !(fits(pickedP, slots.get(p.id) ?? null) && fits(p, slots.get(pickedP.id) ?? null));
                    const moved = slots.get(p.id) !== p.slot;
                    return (
                      <tr
                        key={p.id}
                        draggable={editable}
                        onDragStart={editable ? (e) => { setDragId(p.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(p.id)); } : undefined}
                        onDragEnd={editable ? () => { setDragId(null); setOverId(null); } : undefined}
                        onDragOver={editable ? (e) => { e.preventDefault(); if (overId !== p.id) setOverId(p.id); } : undefined}
                        onDragLeave={editable ? () => setOverId((o) => (o === p.id ? null : o)) : undefined}
                        onDrop={editable ? (e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')) || dragId; if (from) swap(from, p.id); setDragId(null); setOverId(null); } : undefined}
                        style={{
                          background: isPicked ? '#e3efdc' : overId === p.id && dragId !== p.id ? '#eef5ea' : moved ? '#f8f6e8' : undefined,
                          opacity: blocked || dragId === p.id ? 0.45 : 1,
                          cursor: editable ? 'grab' : undefined,
                          outline: overId === p.id && dragId !== p.id ? `2px dashed ${C.green4}` : undefined,
                          outlineOffset: -2,
                        }}
                      >
                        {editable && (
                          <td style={{ paddingLeft: 6, paddingRight: 0 }}>
                            <button
                              type="button" onClick={() => tapSwap(p.id)} disabled={!!blocked}
                              aria-pressed={isPicked} aria-label={isPicked ? `Cancel swap for ${p.name}` : pickedP ? `Swap ${pickedP.name} with ${p.name}` : `Swap ${p.name}`}
                              title={isPicked ? 'Cancel' : pickedP ? `Swap with ${pickedP.name}` : 'Swap'}
                              style={{ width: 26, height: 26, borderRadius: 8, border: `1px solid ${isPicked ? C.green5 : 'var(--line)'}`, background: isPicked ? C.green5 : '#fff', color: isPicked ? '#fff' : C.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                            >
                              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M6 3v12M3 12l3 3 3-3M14 17V5M11 8l3-3 3 3" />
                              </svg>
                            </button>
                          </td>
                        )}
                        <td><PosDots positions={p.positions} /></td>
                        <td style={{ paddingLeft: 2, paddingRight: 2, paddingTop: 4, paddingBottom: 4 }}><Face p={p} label={p.name} size={32} /></td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <Link href={`/players/${p.id}`} draggable={false}>{p.name}</Link>
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
                        {open && <td className="mono" style={{ textAlign: 'center' }}>{p.age != null ? Math.floor(p.age) : '–'}</td>}
                        {open && <td style={{ textAlign: 'center' }}><Delta p={p} /></td>}
                        {open && <td style={{ textAlign: 'center' }}><TrendArrow trend={p.trend} /></td>}
                        <td style={{ textAlign: 'center' }}><FormArrow form={p.form} /></td>
                        <td style={{ textAlign: 'center' }}>{p.games ?? '–'}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{p.tons}</td>
                        <td><Stars value={p.valueStars} label="Current ability" /></td>
                        <td><Stars value={p.potential} colour={C.green5} label="Potential" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        </section>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center', fontSize: 12 }} className="muted">
        {editable && <span>Drag a player onto another, or tap <b style={{ fontWeight: 600 }}>⇅</b> on two players, to swap them.</span>}
        {open && (
          <>
            <span className="eyebrow">Trend</span>
            {(['2', '1', '0', '-1', '-2'] as const).map((k) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><TrendArrow trend={Number(k) as SquadPlayer['trend']} />{TREND[k].label}</span>
            ))}
          </>
        )}
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
