// Player circle as a crop of the club's home guernsey: the pattern plus a V-neck, inside a gold ring.
// Players with a holo profile get the same guernsey with a moving foil sweep and glints.
import { GUERNSEY, type GSpec } from '@/lib/guernseys';
import { HOLO, HOLO_FOIL } from '@/lib/holo';

const shortName = (n: string) => { const w = n.split(' '); return w.length > 1 && !/^[A-Z]\.$/.test(w[0]) ? `${w[0][0]}. ${w.slice(1).join(' ')}` : n; };
export const holoFor = (name?: string | null) => (name ? HOLO[name] ?? HOLO[shortName(name)] : undefined);

function body(g: GSpec) {
  const { a, b, c } = g;
  switch (g.p) {
    case 'hoops': return <><rect width="40" height="40" fill={a} />{[5, 17, 29].map((y) => <rect key={y} y={y} width="40" height="6" fill={b} />)}</>;
    case 'hoops3': return <><rect width="40" height="40" fill={a} /><rect y="15" width="40" height="12" fill={c} /><rect y="17.5" width="40" height="7" fill={b} /></>;
    case 'stripes': return <><rect width="40" height="40" fill={a} />{[4, 14, 24, 34].map((x) => <rect key={x} x={x} width="5" height="40" fill={b} />)}</>;
    case 'sash': return <><rect width="40" height="40" fill={a} /><path d="M-4 30 L30 -4 L42 -4 L42 4 L4 42 L-4 42Z" fill={b} /></>;
    case 'yoke': return <><rect width="40" height="40" fill={a} />{c && <path d="M0 0 H40 V17 L20 29 L0 17Z" fill={c} />}<path d="M0 0 H40 V14 L20 26 L0 14Z" fill={b} /></>;
    case 'chevron': return <><rect width="40" height="40" fill={a} /><path d="M0 18 L20 30 L40 18 V25 L20 37 L0 25Z" fill={b} /></>;
    case 'split': return <><rect width="40" height="40" fill={b} /><rect width="40" height="21" fill={a} />{c && <rect y="19" width="40" height="4" fill={c} />}</>;
    case 'diag': return <><rect width="40" height="40" fill={b} /><path d="M0 0 H40 L0 40Z" fill={a} /></>;
    case 'panels': return <><rect width="40" height="40" fill={b} /><rect width="14" height="40" fill={a} /><rect x="26" width="14" height="40" fill={c} /></>;
    case 'band': return <><rect width="40" height="40" fill={a} /><rect y="16" width="40" height="12" fill={c} /><rect y="19" width="40" height="6" fill={b} /></>;
    default: return <rect width="40" height="40" fill={a} />;
  }
}

export function Guernsey({ club, size = 18, name, ring = true, title }: { club: string | null | undefined; size?: number; name?: string | null; ring?: boolean; title?: string }) {
  const g = club ? GUERNSEY[club] : undefined;
  const holo = holoFor(name);
  const f = holo ? HOLO_FOIL[holo.palette] : undefined;
  const neckIn = g ? (g.p === 'yoke' || g.p === 'split' || g.p === 'diag' ? g.a === '#ffffff' ? g.b : g.a : g.a) : '#c9cfc7';
  const neckEdge = g ? (g.p === 'yoke' ? g.c ?? '#ffffff' : g.b) : '#e4e8e1';
  const showRing = ring && size >= 14;
  return (
    <span className={`gsy ${f ? 'holo' : ''}`} style={{ width: size, height: size }} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} title={title}>
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        {g ? body(g) : <rect width="40" height="40" fill="#d9ddd6" />}
        {g && <><path d="M13 0 L20 10 L27 0Z" fill={neckIn} /><path d="M12.5 0 L20 11.5 L27.5 0" fill="none" stroke={neckEdge} strokeWidth="2" /></>}
      </svg>
      {f && <><i className="gsy-foil holo-anim" style={{ background: f.sweep, backgroundSize: '280% 280%' }} /><i className="gsy-glint holo-anim" style={{ background: `radial-gradient(circle, ${f.glint[0]} 0 0.7px, transparent 1.2px) 0 0 / 7px 7px, radial-gradient(circle, ${f.glint[1]} 0 0.6px, transparent 1.1px) 3px 4px / 9px 9px` }} /></>}
      {showRing && <i className="gsy-ring" />}
    </span>
  );
}
