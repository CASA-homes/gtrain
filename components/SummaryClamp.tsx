'use client';
import { useState } from 'react';

/** Player summary, cut to a few lines with Read more / Show less. */
export function SummaryClamp({ paras }: { paras: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={`phx-sum${open ? ' open' : ''}`}>{paras.map((t, i) => <p key={i}>{t}</p>)}</div>
      <button type="button" className="phx-more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? 'Show less' : 'Read more'}</button>
    </>
  );
}
