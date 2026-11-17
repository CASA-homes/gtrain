// Trademarket: a running strip of the most valuable players and their move this season.
import Link from 'next/link';

export interface TickItem { id: number; name: string; value: number; pct: number }

export function MarketTicker({ items }: { items: TickItem[] }) {
  if (!items.length) return null;
  const set = (hidden: boolean) => (
    <div className="th-tick-set" aria-hidden={hidden || undefined}>
      {items.map((t) => (
        <Link key={t.id} href={`/players/${t.id}`} tabIndex={hidden ? -1 : undefined}>
          <b>{t.name}</b>${t.value}k{' '}
          <span className={t.pct > 0 ? 'u' : t.pct < 0 ? 'd' : 'f'}>{t.pct > 0 ? '▲' : t.pct < 0 ? '▼' : '•'} {Math.abs(t.pct)}%</span>
        </Link>
      ))}
    </div>
  );
  return (
    <div className="th-tick" role="region" aria-label="Player market ticker">
      <div className="th-tick-track">{set(false)}{set(true)}</div>
    </div>
  );
}
