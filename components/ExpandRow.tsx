'use client';
import { useState, type ReactNode } from 'react';

/** Table row with a caret that opens a full-width detail row underneath. */
export function ExpandRow({ cells, detail, cols, label }: { cells: ReactNode; detail: ReactNode; cols: number; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className={open ? 'xr-open' : undefined}>
        {cells}
        <td className="xr-btn">
          <button type="button" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} details for ${label}`} onClick={() => setOpen(!open)}>
            <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </td>
      </tr>
      {open && <tr className="xr-detail"><td colSpan={cols}>{detail}</td></tr>}
    </>
  );
}
