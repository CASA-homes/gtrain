'use client';
import { useState } from 'react';

/** Instant name filter for a server-rendered table: rows carry data-n="lowercase name"; non-matches are hidden with CSS. */
export function TableSearch({ scope, placeholder = 'Search players' }: { scope: string; placeholder?: string }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase().replace(/["\\]/g, '');
  return (
    <>
      <label className="sr-only" htmlFor={`${scope}-q`}>{placeholder}</label>
      <input id={`${scope}-q`} type="search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
        style={{ minHeight: 34, width: 'min(260px, 100%)', fontSize: 13 }} autoComplete="off" />
      {term && <style>{`.${scope} tbody tr[data-n]:not([data-n*="${term}"]) { display: none; }`}</style>}
    </>
  );
}
