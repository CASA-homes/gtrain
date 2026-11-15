'use client';
// Important news: contract moves cycle through one line at a time instead of a long list.
import { useEffect, useState } from 'react';

export interface NewsItem { kind: string; text: string; ago: string }

export function NewsTicker({ items }: { items: NewsItem[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (items.length < 2 || paused || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), 3800);
    return () => clearInterval(t);
  }, [items.length, paused]);
  if (!items.length) return null;
  const n = items[i];
  return (
    <div className="ch-tick" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onClick={() => setI((x) => (x + 1) % items.length)} aria-live="polite">
      <div key={i} className="ch-tick-row">
        <span className="kc-kind">{n.kind}</span>
        <span className="ch-tick-txt">{n.text}</span>
        <span className="muted" style={{ fontSize: 11 }}>{n.ago}</span>
      </div>
      {items.length > 1 && <div className="ch-tick-dots" aria-hidden="true">{items.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>}
    </div>
  );
}
