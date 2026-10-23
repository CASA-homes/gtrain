// Light line drawing of the MCG from above: roof canopy, three stand tiers with bays and aisles,
// light towers, scoreboards and the ground's markings. Purely decorative.
const CX = 180, CY = 120;
const f = (n: number) => n.toFixed(1);
const at = (deg: number, rx: number, ry: number) => {
  const a = (deg * Math.PI) / 180;
  return [CX + rx * Math.cos(a), CY + ry * Math.sin(a)] as const;
};
const ring = (rx: number, ry: number) => <ellipse cx={CX} cy={CY} rx={rx} ry={ry} />;

function radials(step: number, r1: [number, number], r2: [number, number], skip?: (d: number) => boolean) {
  const out: React.ReactNode[] = [];
  for (let d = 0; d < 360; d += step) {
    if (skip?.(d)) continue;
    const [x1, y1] = at(d, ...r1), [x2, y2] = at(d, ...r2);
    out.push(<line key={`${step}-${d}-${r1[0]}`} x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} />);
  }
  return out;
}

export function StadiumArt({ className, style }: { className?: string; style?: React.CSSProperties }) {
  // Roof edge: a saw-tooth of truss points around the rim.
  const roof: string[] = [];
  for (let d = 0; d <= 360; d += 4) { const r = d % 8 === 0 ? 1 : 0.982; const [x, y] = at(d, 172 * r, 112 * r); roof.push(`${f(x)},${f(y)}`); }
  // Light towers: stem out from the rim, a small head at the top.
  const towers = [22, 82, 142, 202, 262, 322].map((d) => {
    const [x1, y1] = at(d, 166, 108), [x2, y2] = at(d, 184, 120);
    const a = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    return (
      <g key={d}>
        <line x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} />
        <rect x={f(x2 - 5)} y={f(y2 - 2.5)} width="10" height="5" transform={`rotate(${f(a + 90)} ${f(x2)} ${f(y2)})`} />
      </g>
    );
  });
  // Scoreboards sit in the upper tier at each end.
  const boards = [180, 0].map((d) => {
    const [x, y] = at(d, 150, 97);
    return <rect key={d} x={f(x - 4)} y={f(y - 11)} width="8" height="22" rx="1.5" />;
  });
  const seat = (d: number) => (d > 170 && d < 190) || d > 350 || d < 10; // gaps behind the scoreboards
  return (
    <svg viewBox="0 0 360 240" fill="none" stroke="currentColor" aria-hidden="true" className={className} style={style}>
      <g strokeWidth="1.1">
        <polyline points={roof.join(' ')} />
        {ring(166, 108)}
      </g>
      {/* Three tiers with concourse lines between them */}
      <g strokeWidth="0.9">{ring(156, 101)}{ring(146, 94)}{ring(140, 90)}{ring(130, 83)}{ring(122, 77)}</g>
      {/* Bays (every 6°) through all tiers, finer seat rows in the middle tier */}
      <g strokeWidth="0.7">{radials(6, [122, 77], [166, 108], seat)}</g>
      <g strokeWidth="0.45">{radials(3, [140, 90], [156, 101], seat)}{radials(3, [122, 77], [130, 83])}</g>
      <g strokeWidth="0.9">{boards}</g>
      <g strokeWidth="1">{towers}</g>
      {/* Fence and boundary */}
      <g strokeWidth="1">{ring(116, 72)}</g>
      <g strokeWidth="0.8" strokeDasharray="2 2">{ring(110, 67)}</g>
      {/* Ground markings */}
      <g strokeWidth="0.8">
        <rect x={CX - 14} y={CY - 14} width="28" height="28" />
        <circle cx={CX} cy={CY} r="3" /><circle cx={CX} cy={CY} r="9" />
        <path d={`M${CX - 62} ${CY - 44} A52 52 0 0 1 ${CX - 62} ${CY + 44}`} />
        <path d={`M${CX + 62} ${CY - 44} A52 52 0 0 0 ${CX + 62} ${CY + 44}`} />
        <rect x={CX - 110} y={CY - 7} width="9" height="14" /><rect x={CX + 101} y={CY - 7} width="9" height="14" />
        <line x1={CX - 110} y1={CY - 3} x2={CX - 116} y2={CY - 3} /><line x1={CX - 110} y1={CY + 3} x2={CX - 116} y2={CY + 3} />
        <line x1={CX + 110} y1={CY - 3} x2={CX + 116} y2={CY - 3} /><line x1={CX + 110} y1={CY + 3} x2={CX + 116} y2={CY + 3} />
        <rect x={CX - 9} y={CY + 63} width="18" height="5" />
      </g>
    </svg>
  );
}
