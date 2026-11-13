'use client';
// Clubhouse header on phones: the KPIs and club buttons fold away behind a dropdown so the header stays compact.
// On wider screens they're always shown and the toggle is hidden (CSS: .club-head-toggle / .club-head-more).
import { useState } from 'react';

export function ClubHeadMore({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="club-head-toggle" aria-expanded={open} aria-label={open ? 'Hide club details' : 'Show club details'} onClick={() => setOpen(!open)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <div className={`club-head-more ${open ? 'open' : ''}`}>{children}</div>
    </>
  );
}
