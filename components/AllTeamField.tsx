import Link from 'next/link';
import { CLUBS } from '@/lib/clubs';
import { photoUrl } from '@/lib/photos';
import type { Line, PlayerRow } from '@/lib/ratings';

/** Field spots as % of the oval (x across, y down). Forwards attack the top goal. */
const SPOTS: Record<Line, [number, number][]> = {
  FWD: [[24, 13], [50, 9], [76, 13], [29, 27], [71, 27]],
  MID: [[50, 36], [33, 44], [67, 44], [11, 51], [89, 51], [33, 60], [67, 60]],
  RUC: [[50, 51]],
  DEF: [[29, 74], [71, 74], [24, 88], [50, 91], [76, 88]],
};

function Marker({ p, owner, size = 'var(--chip)' }: { p: PlayerRow; owner: string; size?: string }) {
  const club = p.afl_club ? CLUBS[p.afl_club] : null;
  const src = photoUrl(p);
  const ring = club ? (club.m ? `conic-gradient(${club.a} 0 45%, ${club.m} 45% 55%, ${club.b} 55% 100%)` : `conic-gradient(${club.a} 0 50%, ${club.b} 50% 100%)`) : '#d9ddd6';
  return (
    <Link href={`/players/${p.id}`} title={`${p.full_name ?? p.name} · ${p.average?.toFixed(1)} avg · ${owner}`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textDecoration: 'none', color: '#fff', width: 'calc(var(--chip) * 1.9)' }}>
      <span style={{ width: size, height: size, borderRadius: '50%', padding: 2.5, background: ring, boxShadow: '0 2px 6px rgb(0 0 0 / .35)', flex: 'none' }}>
        <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: '#e8eee5' }}>
          {src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
          )}
        </span>
      </span>
      <span style={{ font: '600 9px/1.1 var(--font)', textAlign: 'center', textShadow: '0 1px 2px rgb(0 0 0 / .6)', whiteSpace: 'nowrap' }}>{p.name}</span>
      <span style={{ font: '600 8.5px/1 var(--mono)', background: 'rgb(0 0 0 / .45)', borderRadius: 99, padding: '1px 5px' }}>{p.average?.toFixed(1)}</span>
    </Link>
  );
}

/** The All-G-Train team on a footy oval: 18 on the ground, 4 on the bench. */
export function AllTeamField({ lines, bench, ownerOf }: {
  lines: Record<Line, PlayerRow[]>; bench: PlayerRow[]; ownerOf: (p: PlayerRow) => string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderRadius: 16, overflow: 'hidden', background: '#1d4a2b', width: '100%', maxWidth: 420, margin: '0 auto', ['--chip' as string]: 'clamp(26px, 6vw, 36px)' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '100 / 118' }}>
        <svg viewBox="0 0 100 118" preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <pattern id="mow" width="100" height="11.8" patternUnits="userSpaceOnUse">
              <rect width="100" height="5.9" fill="#2f7a45" /><rect y="5.9" width="100" height="5.9" fill="#2a7040" />
            </pattern>
            <clipPath id="oval"><ellipse cx="50" cy="59" rx="47" ry="56" /></clipPath>
          </defs>
          <ellipse cx="50" cy="59" rx="47" ry="56" fill="url(#mow)" stroke="#e9f2e4" strokeWidth=".5" />
          <g clipPath="url(#oval)" fill="none" stroke="#e9f2e4" strokeWidth=".35" opacity=".8">
            <rect x="34" y="47" width="32" height="24" />
            <circle cx="50" cy="59" r="7" />
            <circle cx="50" cy="59" r="1.4" />
            <line x1="50" y1="57.6" x2="50" y2="60.4" />
            <path d="M 15 3 A 35 35 0 0 0 85 3" />
            <path d="M 15 115 A 35 35 0 0 1 85 115" />
            <rect x="45" y="3" width="10" height="5" />
            <rect x="45" y="110" width="10" height="5" />
          </g>
          <g stroke="#f4f1e6" strokeWidth=".7" strokeLinecap="round">
            <line x1="47" y1="3" x2="47" y2="0" /><line x1="53" y1="3" x2="53" y2="0" />
            <line x1="47" y1="115" x2="47" y2="118" /><line x1="53" y1="115" x2="53" y2="118" />
          </g>
        </svg>
        {(Object.keys(SPOTS) as Line[]).flatMap((line) => lines[line].map((p, i) => {
          const spot = SPOTS[line][i];
          if (!spot) return null;
          return (
            <div key={p.id} style={{ position: 'absolute', left: `${spot[0]}%`, top: `${spot[1]}%`, transform: 'translate(-50%, -38%)' }}>
              <Marker p={p} owner={ownerOf(p)} />
            </div>
          );
        }))}
      </div>
      <div style={{ background: '#17241c', padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ font: '500 10px var(--mono)', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9ccb84' }}>Interchange</span>
        <div style={{ display: 'flex', justifyContent: 'space-around', gap: 6 }}>
          {bench.map((p) => <Marker key={p.id} p={p} owner={ownerOf(p)} />)}
        </div>
      </div>
    </div>
  );
}
