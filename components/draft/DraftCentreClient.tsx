'use client';
// Draft Centre: the live countdown and the commish's draft settings.
import './draft.css';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DRAFT_YEAR, type RoomSettings } from '@/lib/draft-room';

const pad = (n: number) => String(n).padStart(2, '0');

export function Countdown({ to }: { to: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const d = to && now != null ? Math.max(0, (new Date(to).getTime() - now) / 1000) : null;
  const parts: [string, string][] = d == null ? [['–', 'days'], ['–', 'hrs'], ['–', 'min'], ['–', 'sec']]
    : [[String(Math.floor(d / 86400)), 'days'], [pad(Math.floor((d % 86400) / 3600)), 'hrs'], [pad(Math.floor((d % 3600) / 60)), 'min'], [pad(Math.floor(d % 60)), 'sec']];
  return <div className="dc-cd" aria-label="Countdown to the first pick">{parts.map(([v, l]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}</div>;
}

/** Perth has no daylight saving: +08:00 all year. */
const toPerthInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 8 * 3600e3).toISOString().slice(0, 16) : '');
const fromPerthInput = (v: string) => (v ? new Date(`${v}:00+08:00`).toISOString() : null);

export function StartDraftButton({ label = 'Start the draft now', className = 'dc-btn ghost' }: { label?: string; className?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className={className} disabled={busy} onClick={async () => {
      if (!confirm('Start the draft now? The first pick goes on the clock straight away.')) return;
      setBusy(true);
      const { error } = await supabase.rpc('draft_room_control', { y: DRAFT_YEAR, action: 'start' });
      setBusy(false);
      if (error) alert(error.message); else router.push('/draft/room');
    }}>{label}</button>
  );
}

export function DraftSettings({ room, started }: { room: RoomSettings; started: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [s, setS] = useState({
    snake: room.snake, starts: toPerthInput(room.starts_at), pick_seconds: room.pick_seconds, break_every: room.break_every,
    break_minutes: room.break_minutes, trading: room.trading, list_max: room.list_max,
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.from('draft_room').update({
      snake: s.snake, starts_at: fromPerthInput(s.starts), pick_seconds: s.pick_seconds, break_every: s.break_every,
      break_minutes: s.break_minutes, trading: s.trading, list_max: s.list_max, updated_at: new Date().toISOString(),
    }).eq('year', DRAFT_YEAR);
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Saved. Everyone sees the new settings straight away.' });
    if (!error) router.refresh();
  }
  async function reset() {
    if (!confirm('Reset the draft? Every pick made in the room is cleared and the draft goes back to scheduled. Pick trades stay done.')) return;
    setBusy(true);
    const { error } = await supabase.rpc('draft_room_control', { y: DRAFT_YEAR, action: 'reset' });
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'The draft has been reset.' });
    if (!error) router.refresh();
  }

  return (
    <div className="dc-set">
      <div className="row"><label>Draft type<small>{s.snake ? 'Snake flips the order every second round' : 'Straight keeps the same order every round'}</small></label>
        <div className="dc-seg">
          <button className={!s.snake ? 'on' : ''} disabled={started} onClick={() => set('snake', false)}>Straight</button>
          <button className={s.snake ? 'on' : ''} disabled={started} onClick={() => set('snake', true)}>Snake</button>
        </div>
      </div>
      <div className="row"><label>Start time<small>Perth time. Countdowns run to this.</small></label>
        <input type="datetime-local" value={s.starts} onChange={(e) => set('starts', e.target.value)} /></div>
      <div className="row"><label>Pick timer <b>{Math.floor(s.pick_seconds / 60)}:{pad(s.pick_seconds % 60)}</b><small>Time each coach has on the clock</small></label>
        <input type="range" min={30} max={300} step={15} value={s.pick_seconds} onChange={(e) => set('pick_seconds', Number(e.target.value))} /></div>
      <div className="row"><label>Breaks<small>A pause for drinks and trade talk</small></label>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          every <input type="number" min={0} max={16} value={s.break_every} onChange={(e) => set('break_every', Number(e.target.value))} aria-label="Break every how many rounds" /> rounds,
          <input type="number" min={0} max={60} value={s.break_minutes} onChange={(e) => set('break_minutes', Number(e.target.value))} aria-label="Break minutes" /> min
        </span></div>
      <div className="row"><label>When the timer runs out<small>Takes the top player on their queue. No queue: the pick is skipped and they get a make-up pick at the end.</small></label></div>
      <div className="row"><label>List size<small>Each club can draft this many, minus its keepers</small></label>
        <input type="number" min={20} max={60} value={s.list_max} disabled={started} onChange={(e) => set('list_max', Number(e.target.value))} aria-label="List size" /></div>
      <div className="row"><label>Pick trading in the room<small>Goes through when both coaches accept</small></label>
        <span className="dc-tg"><input type="checkbox" checked={s.trading} onChange={(e) => set('trading', e.target.checked)} aria-label="Pick trading" /><i /></span></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="dc-btn go" disabled={busy} onClick={save}>Save settings</button>
        {!started && <StartDraftButton className="dc-btn" />}
        {started && <button className="dc-btn" disabled={busy} onClick={reset}>Reset the draft</button>}
      </div>
      {msg && <span style={{ fontSize: 12.5, color: msg.ok ? '#1d8a3c' : '#b4392b' }}>{msg.text}</span>}
      {started && <span className="dc-dim">Draft type and list size lock once the draft has started.</span>}
    </div>
  );
}
