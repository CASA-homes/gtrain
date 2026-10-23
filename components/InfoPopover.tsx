'use client';
import { useEffect, useState, type ReactNode } from 'react';

/** Small ⓘ button that opens a dialog with server-rendered details. Closes on Esc, backdrop click or the close button. */
export function InfoPopover({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Why: ${title}`} title="Why this player"
        style={{ width: 26, height: 26, borderRadius: 13, border: '1px solid var(--line)', background: '#fff', cursor: 'pointer', font: '600 13px var(--font)', color: '#1f6b3a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
        i
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={title} onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgb(0 0 0 / .35)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="card"
            style={{ background: '#fff', maxWidth: 620, width: '100%', maxHeight: '86vh', overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 12px 40px rgb(0 0 0 / .2)' }}>
            <div className="row-between" style={{ alignItems: 'flex-start', gap: 10 }}>
              <h3 style={{ font: '600 22px var(--font)', margin: 0, letterSpacing: '-.02em' }}>{title}</h3>
              <button type="button" className="btn" onClick={() => setOpen(false)} style={{ fontSize: 12 }}>Close</button>
            </div>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
