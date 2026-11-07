'use client';
// Pick a club colour: swatches in a small pop-over under the club badge.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CLUB_COLOURS } from '@/lib/team-colours';
import { setClubColour } from '@/app/(app)/clubhouse/[id]/logo-actions';

export function ClubColourPicker({ teamId, colour }: { teamId: number; colour: string | null }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(colour);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const pick = (hex: string | null) => start(async () => {
    const prev = cur; setCur(hex); setErr(null);
    const r = await setClubColour(teamId, hex);
    if (!r.ok) { setCur(prev); setErr(r.error ?? 'Couldn’t save.'); return; }
    setOpen(false); router.refresh();
  });
  return (
    <span className="ccp">
      <button type="button" className="ccp-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Club colour">
        <i style={{ background: cur ?? 'conic-gradient(#2563c9 0 25%, #1d8a3c 0 50%, #d6a92a 0 75%, #d23b2a 0)' }} />Colour
      </button>
      {open && (
        <span className="ccp-pop" role="dialog" aria-label="Pick your club colour">
          <span className="ccp-h">Club colour</span>
          <span className="ccp-grid">
            {CLUB_COLOURS.map((c) => (
              <button key={c.hex} type="button" className={`ccp-sw ${cur === c.hex ? 'on' : ''}`} style={{ background: c.hex }} title={c.name} aria-label={c.name} disabled={pending} onClick={() => pick(c.hex)} />
            ))}
          </span>
          <span className="ccp-note">Used for your clubhouse highlight and your score worm in matchups.</span>
          {cur && <button type="button" className="ccp-clear" disabled={pending} onClick={() => pick(null)}>Use the default</button>}
          {err && <span className="ccp-err">{err}</span>}
        </span>
      )}
    </span>
  );
}
