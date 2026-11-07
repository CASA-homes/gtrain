// Clubhouse honours: one compact row of seasons (flag, grand final, spoon or ladder finish), the all-time record and rivals.
import { Cup } from '@/components/bits';

export interface HonourSeason { year: number; result: 'premier' | 'runner' | 'spoon' | 'rank' | 'none'; rank?: number | null }
const ord = (n: number) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] ?? 'th');

export function ClubHonours({ seasons, record, nemesis, bunny }: {
  seasons: HonourSeason[]; record: { w: number; l: number; pct: number } | null;
  nemesis: { name: string; w: number; l: number } | null; bunny: { name: string; w: number; l: number } | null;
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 className="h2">Honours</h2>
      <div className="card hn">
        <div className="hn-row">
          {seasons.map((s) => (
            <span key={s.year} className={`hn-yr ${s.result}`} title={s.result === 'premier' ? 'Premiers' : s.result === 'runner' ? 'Runners-up' : s.result === 'spoon' ? 'Wooden spoon' : ''}>
              {s.result === 'premier' && <Cup size={11} />}{s.year}
              {s.result === 'runner' ? ' · GF' : s.result === 'spoon' ? ' · spoon' : s.result === 'rank' && s.rank ? ` · ${ord(s.rank)}` : ''}
            </span>
          ))}
        </div>
        <div className="hn-meta">
          {record && <span>All-time <b>{record.w}–{record.l}</b> ({Math.round(record.pct * 100)}%)</span>}
          {nemesis && <span>Nemesis <b>{nemesis.name}</b> {nemesis.w}–{nemesis.l}</span>}
          {bunny && bunny.name !== nemesis?.name && <span>Bunny <b>{bunny.name}</b> {bunny.w}–{bunny.l}</span>}
        </div>
      </div>
    </section>
  );
}
