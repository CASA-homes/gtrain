'use client';
import { useState, useTransition } from 'react';
import { toggleWatch } from '@/app/(app)/players/watch-actions';

/** Grey outline star; tap to add to your watchlist (solid gold), tap again to remove. */
export function WatchStar({ playerId, initial, name, size = 22 }: { playerId: number; initial: boolean; name: string; size?: number }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const click = () => {
    const next = !on;
    setOn(next);
    start(async () => { const r = await toggleWatch(playerId, next); setOn(r.on); });
  };
  return (
    <button type="button" onClick={click} aria-pressed={on} disabled={pending}
      aria-label={on ? `Remove ${name} from your watchlist` : `Add ${name} to your watchlist`}
      title={on ? 'On your watchlist' : 'Add to your watchlist'}
      style={{ background: 'none', border: 0, padding: 2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"
          fill={on ? '#e2b100' : 'none'} stroke={on ? '#c99a00' : '#b9c0b6'} strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
