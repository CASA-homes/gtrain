'use client';
import { useEffect, useState } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');

/** Live auction clock. Turns red in the final hour. */
export function Countdown({ endsAt }: { endsAt: string }) {
  const end = new Date(endsAt).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, end - (now ?? end));
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  const urgent = left < 3600_000;
  const done = now != null && left === 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', padding: '8px 12px', borderRadius: 10, flex: 'none', background: urgent ? 'var(--red-bg)' : 'var(--forest)', color: urgent ? 'var(--red-fg)' : 'var(--cream)' }}>
      <span style={{ font: '500 10px var(--mono)', letterSpacing: '.06em', textTransform: 'uppercase', opacity: .75 }}>{done ? 'Ended' : 'Ends in'}</span>
      <span style={{ font: '600 18px var(--mono)', fontVariantNumeric: 'tabular-nums' }} suppressHydrationWarning>
        {now == null ? '––:––:––' : `${d ? `${d}d ` : ''}${pad(h)}:${pad(m)}:${pad(s % 60)}`}
      </span>
    </div>
  );
}
