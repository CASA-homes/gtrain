'use client';
// Club settings: your club colour and which sections show on your clubhouse page.
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CLUB_COLOURS, CLUBHOUSE_SECTIONS } from '@/lib/team-colours';
import { setClubSettings } from '@/app/(app)/clubhouse/[id]/logo-actions';

export function ClubSettings({ teamId, colour, hidden }: { teamId: number; colour: string | null; hidden: string[] }) {
  const [open, setOpen] = useState(false);
  const [col, setCol] = useState(colour);
  const [hide, setHide] = useState<string[]>(hidden);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => { if (open) { setCol(colour); setHide(hidden); setErr(null); } }, [open, colour, hidden]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open]);
  const save = () => start(async () => {
    const r = await setClubSettings(teamId, col, hide);
    if (!r.ok) { setErr(r.error ?? 'Couldn’t save.'); return; }
    setOpen(false); router.refresh();
  });
  const toggle = (k: string) => setHide((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]));
  return (
    <>
      <button type="button" className="btn club-head-cta cs-open" onClick={() => setOpen(true)}>
        <i style={{ background: colour ?? 'conic-gradient(#2563c9 0 25%, #1d8a3c 0 50%, #d6a92a 0 75%, #d23b2a 0)' }} />Club settings
      </button>
      {open && (
        <div className="cs-back" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="cs-sheet" role="dialog" aria-modal="true" aria-label="Club settings">
            <div className="cs-head"><h3>Club settings</h3><button type="button" className="cs-x" onClick={() => setOpen(false)} aria-label="Close">✕</button></div>

            <section className="cs-sec">
              <span className="cs-k">Club colour</span>
              <span className="cs-note">Highlights your clubhouse and colours your score and margin graph in matchups.</span>
              <div className="cs-swatches">
                {CLUB_COLOURS.map((c) => (
                  <button key={c.hex} type="button" className={`cs-sw ${col === c.hex ? 'on' : ''}`} style={{ background: c.hex }} title={c.name} aria-label={c.name} aria-pressed={col === c.hex} onClick={() => setCol(c.hex)} />
                ))}
                <button type="button" className={`cs-sw cs-default ${col == null ? 'on' : ''}`} title="Default" aria-label="Default colours" aria-pressed={col == null} onClick={() => setCol(null)}>Default</button>
              </div>
              <div className="cs-preview" style={{ ['--club' as string]: col ?? '#2563c9' }}><i /><span>Preview</span><b className="rh-mono">1,284</b></div>
            </section>

            <section className="cs-sec">
              <span className="cs-k">Show on your clubhouse page</span>
              <div className="cs-toggles">
                {CLUBHOUSE_SECTIONS.map((s) => {
                  const on = !hide.includes(s.key);
                  return (
                    <label key={s.key} className="cs-tg">
                      <span>{s.name}</span>
                      <input type="checkbox" role="switch" id={`cs-${s.key}`} checked={on} onChange={() => toggle(s.key)} />
                      <i aria-hidden="true" />
                    </label>
                  );
                })}
              </div>
              <span className="cs-note">Your squad and the header always show. Everyone who visits your clubhouse sees the same sections.</span>
            </section>

            {err && <span className="cs-err">{err}</span>}
            <div className="cs-acts">
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="btn dark" disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save settings'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
