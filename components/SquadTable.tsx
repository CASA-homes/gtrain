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
  pos?: number | null;          // spot within the line (0 = top)
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
// Cells shown per group. The bench gets one spare spot so there's always somewhere to move a player while you shuffle.
const CELLS: Record<Slot, number> = { DEF: 5, MID: 7, RUC: 1, FWD: 5, BENCH: 5 };
const SLOTS: Slot[] = [...LINES, 'BENCH'];

/** Can this player fill this slot? Bench and the extended squad take anyone. */
const fits = (p: SquadPlayer, s: Slot | 'EXT') => s === 'EXT' || s === 'BENCH' || p.positions.includes(s);

type Board = { cells: Record<Slot, (number | null)[]>; ext: number[] };
type Loc = { slot: Slot | 'EXT'; i: number };   // ext i = -1 is the empty "move off the 22" row
type SortKey = 'avg' | 'apps' | 'ability' | 'pot';
const SORTS: Record<SortKey, (p: SquadPlayer) => number> = {
  avg: (p) => p.average ?? -1, apps: (p) => p.games ?? -1, ability: (p) => p.valueStars, pot: (p) => p.potential ?? -1,
};

/** Lay the squad out on the board: each player in his saved spot, gaps kept, overflow to the extended squad. */
function initBoard(players: SquadPlayer[]): Board {
  const cells = Object.fromEntries(SLOTS.map((s) => [s, Array(CELLS[s]).fill(null)])) as Board['cells'];
  const ext: number[] = [];
  for (const s of SLOTS) {
    const xs = players.filter((p) => p.slot === s).sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99) || (b.average ?? 0) - (a.average ?? 0));
    for (const p of xs) {
      const arr = cells[s];
      const at = p.pos != null && p.pos < arr.length && arr[p.pos] == null ? p.pos : arr.indexOf(null);
      if (at < 0) ext.push(p.id); else arr[at] = p.id;
    }
  }
  ext.push(...players.filter((p) => !p.slot).sort((a, b) => (b.average ?? 0) - (a.average ?? 0)).map((p) => p.id));
  return { cells, ext };
}
const key = (b: Board) => JSON.stringify(b.cells) + '|' + [...b.ext].sort().join(',');

/**
 * Starting 22 + extended squad. The owner moves players by dragging a row onto another row or onto an empty spot,
 * or by tapping ⇅ on a player and then tapping where he goes. Lines can have gaps. Changes save in one go.
 * Clicking Avg / Apps / Current ability / Pot. sorts within each line (click again to go back to the coach's order).
 */
export function SquadTable({ players, teamId, editable, saved, onToggle }: {
  players: SquadPlayer[]; teamId: number; editable: boolean; saved: boolean; onToggle?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const start0 = useMemo(() => initBoard(players), [players]);
  const [board, setBoard] = useState<Board>(start0);
  const [picked, setPicked] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const dirty = key(board) !== key(start0);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  function locOf(b: Board, id: number): Loc {
    for (const s of SLOTS) { const i = b.cells[s].indexOf(id); if (i >= 0) return { slot: s, i }; }
    return { slot: 'EXT', i: b.ext.indexOf(id) };
  }
  const at = (b: Board, l: Loc) => (l.slot === 'EXT' ? (l.i >= 0 ? b.ext[l.i] ?? null : null) : b.cells[l.slot][l.i]);

  /** Move a player to a spot. If someone's there they trade places (if he can play the other spot). */
  function move(id: number, to: Loc) {
    const p = byId.get(id)!;
    const from = locOf(board, id);
    if (from.slot === to.slot && from.i === to.i) return;
    const other = at(board, to);
    if (!fits(p, to.slot)) return setMsg({ text: `${p.name} can’t play ${to.slot}.`, bad: true });
    if (other != null && !fits(byId.get(other)!, from.slot)) return setMsg({ text: `${byId.get(other)!.name} can’t play ${from.slot}.`, bad: true });
    const cells = Object.fromEntries(SLOTS.map((s) => [s, [...board.cells[s]]])) as Board['cells'];
    let ext = [...board.ext];
    // take him out
    if (from.slot === 'EXT') ext[from.i] = other ?? -1; else cells[from.slot][from.i] = other;
    // put him in
    if (to.slot === 'EXT') { if (to.i >= 0 && other != null) ext[to.i] = id; else ext.push(id); } else cells[to.slot][to.i] = id;
    ext = ext.filter((x) => x !== -1);
    setBoard({ cells, ext });
    setMsg({ text: other != null ? `${p.name} ⇄ ${byId.get(other)!.name}` : `${p.name} → ${to.slot === 'EXT' ? 'extended squad' : to.slot === 'BENCH' ? 'bench' : to.slot}` });
  }

  function tap(id: number | null, to: Loc) {
    if (picked == null) { if (id != null) { setPicked(id); setMsg({ text: `Now tap where ${byId.get(id)!.name} goes` }); } return; }
    if (picked === id) { setPicked(null); setMsg(null); return; }
    move(picked, to);
    setPicked(null);
  }

  function save() {
    if (board.cells.BENCH.filter((x) => x != null).length > SLOT_COUNT.BENCH) return setMsg({ text: `The bench holds ${SLOT_COUNT.BENCH}. Move one to the extended squad first.`, bad: true });
    const entries: { id: number; slot: Slot | null; pos: number | null }[] = [];
    for (const s of SLOTS) board.cells[s].forEach((id, i) => { if (id != null) entries.push({ id, slot: s, pos: i }); });
    for (const id of board.ext) entries.push({ id, slot: null, pos: null });
    start(async () => {
      const res = await saveLineup(teamId, entries);
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

  type Row = { id: number | null; loc: Loc; spare?: boolean };
  /** Rows for a group, in the coach's order (gaps where he left them) or sorted with gaps at the bottom. */
  const rowsFor = (s: Slot | 'EXT'): Row[] => {
    const raw: Row[] = s === 'EXT'
      ? [...board.ext.map((id, i) => ({ id, loc: { slot: 'EXT' as const, i } })), ...(editable ? [{ id: null, loc: { slot: 'EXT' as const, i: -1 } }] : [])]
      : board.cells[s].map((id, i) => ({ id, loc: { slot: s, i }, spare: s === 'BENCH' && i === SLOT_COUNT.BENCH }));
    const shown = s === 'BENCH' && !editable ? raw.filter((r) => !r.spare) : raw;
    if (!sortBy) return shown;
    const f = SORTS[sortBy];
    return [...shown.filter((r) => r.id != null).sort((a, b) => f(byId.get(b.id!)!) - f(byId.get(a.id!)!)), ...shown.filter((r) => r.id == null)];
  };
  const count = (s: Slot | 'EXT') => (s === 'EXT' ? board.ext.length : board.cells[s].filter((x) => x != null).length);
  const blocks = [
    {
      title: 'Starting 22',
      sub: saved ? 'Set by the coach' : '5 DEF · 7 MID · 1 RUC · 5 FWD · 4 bench, auto-picked on 2026 average',
      groups: [
        ...LINES.map((l) => ({ key: l as Slot | 'EXT', name: LINE_NAMES[l], colour: C[l], need: SLOT_COUNT[l] })),
        { key: 'BENCH' as Slot | 'EXT', name: 'Bench', colour: C.muted, need: SLOT_COUNT.BENCH },
      ],
    },
    { title: 'Extended squad', sub: `${board.ext.length} not selected`, groups: [{ key: 'EXT' as Slot | 'EXT', name: 'Not selected', colour: C.muted, need: 0 }] },
  ];
  const cols = (open ? 13 : 9) + (editable ? 1 : 0);
  const SortHead = ({ k, label, title, style }: { k: SortKey; label: string; title?: string; style: React.CSSProperties }) => (
    <th style={style} title={title} aria-sort={sortBy === k ? 'descending' : undefined}>
      <button type="button" onClick={() => setSortBy(sortBy === k ? null : k)} title={sortBy === k ? 'Back to the coach’s order' : `Sort each line by ${label}`}
        style={{ all: 'unset', cursor: 'pointer', fontWeight: sortBy === k ? 800 : undefined, textDecoration: sortBy === k ? 'underline' : undefined, textUnderlineOffset: 3 }}>
        {label}{sortBy === k ? ' ↓' : ''}
      </button>
    </th>
  );
  const dropProps = (r: Row) => editable ? {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); const k = `${r.loc.slot}:${r.loc.i}`; if (over !== k) setOver(k); },
    onDragLeave: () => setOver((o) => (o === `${r.loc.slot}:${r.loc.i}` ? null : o)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')) || dragId; if (from) move(from, r.loc); setDragId(null); setOver(null); },
  } : {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: -12 }}>
        {msg && <span role="status" style={{ fontSize: 13, marginRight: 'auto', color: msg.bad ? C.redFg : C.muted }}>{msg.text}</span>}
        {editable && saved && !dirty && <button type="button" className="btn" onClick={reset} disabled={pending}>Auto-pick</button>}
        {editable && dirty && (
          <>
            <button type="button" className="btn" onClick={() => { setBoard(start0); setPicked(null); setMsg(null); }} disabled={pending}>Undo</button>
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
                  {editable && <th style={{ width: 34 }}><span className="sr-only">Move</span></th>}
                  <th style={{ width: 82 }}>Pos</th>
                  <th style={{ width: 40 }}><span className="sr-only">Player photo</span></th>
                  <th>Player</th>
                  <SortHead k="avg" label="Avg" style={{ width: 54, textAlign: 'center' }} />
                  {open && <th style={{ width: 176, textAlign: 'center' }}>Last 5</th>}
                  {open && <th style={{ width: 40, textAlign: 'center' }}>Age</th>}
                  {open && <th style={{ width: 48, textAlign: 'center' }} title="Change on last year's average">± ’25</th>}
                  {open && <th style={{ width: 50, textAlign: 'center' }} title="General trend of his average over recent seasons">Trend</th>}
                  <th style={{ width: 40, textAlign: 'center' }}>Form</th>
                  <SortHead k="apps" label="Apps" style={{ width: 44, textAlign: 'center' }} />
                  <th style={{ width: 38, textAlign: 'center' }} title="100+ scores in the last 5">100s</th>
                  <SortHead k="ability" label="Current ability" style={{ width: 110 }} />
                  <SortHead k="pot" label="Pot." style={{ width: 78 }} />
                </tr>
              </thead>
              {b.groups.map((g) => (
                <tbody key={g.key}>
                  <tr className="group">
                    <td colSpan={cols}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="dot" style={{ background: g.colour }} />{g.name}
                        <span className="muted" style={{ fontWeight: 400 }}>{g.need ? `${count(g.key)} of ${g.need}` : count(g.key)}</span>
                        {g.key === 'BENCH' && count('BENCH') > SLOT_COUNT.BENCH && <span style={{ fontWeight: 400, fontSize: 12, color: C.redFg }}>One too many: move one off before saving</span>}
                      </span>
                    </td>
                  </tr>
                  {rowsFor(g.key).map((r) => {
                    const k = `${r.loc.slot}:${r.loc.i}`;
                    const pickedP = picked != null ? byId.get(picked)! : null;
                    if (r.id == null) {
                      const ok = !pickedP || fits(pickedP, r.loc.slot);
                      return (
                        <tr key={k} {...dropProps(r)} className="empty-slot"
                          style={{ outline: over === k ? `2px dashed ${C.green4}` : undefined, outlineOffset: -2, background: over === k ? '#eef5ea' : undefined, opacity: ok ? 1 : 0.45 }}>
                          {editable && <td style={{ paddingLeft: 6, paddingRight: 0 }}>
                            {pickedP && ok && <button type="button" onClick={() => tap(null, r.loc)} aria-label={`Move ${pickedP.name} here`} title="Move here"
                              style={{ width: 26, height: 26, borderRadius: 8, border: `1px solid ${C.green5}`, background: '#fff', color: C.green5, cursor: 'pointer', padding: 0, fontWeight: 700 }}>+</button>}
                          </td>}
                          <td colSpan={cols - (editable ? 1 : 0)} className="muted" style={{ fontSize: 13, fontStyle: 'italic', borderTop: '1px dashed var(--line)' }}>
                            {r.loc.slot === 'EXT' ? 'Drop here to take a player off the 22' : r.spare ? 'Spare bench spot: park a player here while you shuffle' : `Empty ${r.loc.slot === 'BENCH' ? 'bench' : r.loc.slot} spot`}
                          </td>
                        </tr>
                      );
                    }
                    const p = byId.get(r.id)!;
                    const isPicked = picked === p.id;
                    // While a player is picked, dim the rows he can't swap with.
                    const blocked = pickedP && !isPicked && !(fits(pickedP, r.loc.slot) && fits(p, locOf(board, pickedP.id).slot));
                    const moved = (() => { const l0 = locOf(start0, p.id); return l0.slot !== r.loc.slot || (r.loc.slot !== 'EXT' && l0.i !== r.loc.i); })();
                    return (
                      <tr
                        key={p.id}
                        draggable={editable}
                        onDragStart={editable ? (e) => { setDragId(p.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(p.id)); } : undefined}
                        onDragEnd={editable ? () => { setDragId(null); setOver(null); } : undefined}
                        {...dropProps(r)}
                        style={{
                          background: isPicked ? '#e3efdc' : over === k && dragId !== p.id ? '#eef5ea' : moved ? '#f8f6e8' : undefined,
                          opacity: blocked || dragId === p.id ? 0.45 : 1,
                          cursor: editable ? 'grab' : undefined,
                          outline: over === k && dragId !== p.id ? `2px dashed ${C.green4}` : undefined,
                          outlineOffset: -2,
                        }}
                      >
                        {editable && (
                          <td style={{ paddingLeft: 6, paddingRight: 0 }}>
                            <button
                              type="button" onClick={() => tap(p.id, r.loc)} disabled={!!blocked}
                              aria-pressed={isPicked} aria-label={isPicked ? `Cancel move for ${p.name}` : pickedP ? `Swap ${pickedP.name} with ${p.name}` : `Move ${p.name}`}
                              title={isPicked ? 'Cancel' : pickedP ? `Swap with ${pickedP.name}` : 'Move'}
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
        {editable && <span>Drag a player onto another player or an empty spot, or tap <b style={{ fontWeight: 600 }}>⇅</b> then tap where he goes. Click Avg, Apps, Current ability or Pot. to sort each line.</span>}
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
