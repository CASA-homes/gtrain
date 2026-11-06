// Clubhouse legacy strip: trophy cabinet, the club's timeline, its pick vault and its nemesis.
// Pure display: everything is worked out on the server and passed in.

export interface LegacySeason { year: number; result: 'premier' | 'runner' | 'spoon' | 'rank' | 'none'; rank?: number | null }
export interface LegacyProps {
  colour: string;
  record: { w: number; l: number; pct: number } | null;
  seasons: LegacySeason[];
  prelims: number;
  extraTrophies: { label: string; year: number }[];
  picks: { id: number; year: number; label: string; via: string | null; kind: string; round: number }[];
  nemesis: { name: string; w: number; l: number; margin: number } | null;
  bunny: { name: string; w: number; l: number; margin: number } | null;
}

function Cup({ kind, size = 46 }: { kind: 'gold' | 'silver' | 'empty'; size?: number }) {
  const f = kind === 'gold' ? ['#f4d27a', '#d4a62a', '#a87c12'] : kind === 'silver' ? ['#eef0f2', '#c3c8cd', '#8d949b'] : ['#f1f2ef', '#e3e6e0', '#d3d7d0'];
  return (
    <svg width={size} height={size * 1.12} viewBox="0 0 40 45" aria-hidden="true">
      <defs><linearGradient id={`cg-${kind}`} x1="0" x2="1"><stop offset="0" stopColor={f[0]} /><stop offset=".55" stopColor={f[1]} /><stop offset="1" stopColor={f[2]} /></linearGradient></defs>
      <path d="M10 4h20v11a10 10 0 0 1-20 0z" fill={`url(#cg-${kind})`} />
      <path d="M10 7H4v3a7 7 0 0 0 7 7M30 7h6v3a7 7 0 0 1-7 7" fill="none" stroke={f[1]} strokeWidth="2.4" />
      <rect x="18" y="25" width="4" height="8" fill={f[2]} />
      <rect x="12" y="33" width="16" height="5" rx="1.2" fill={`url(#cg-${kind})`} />
      <rect x="9" y="38" width="22" height="5" rx="1.2" fill={f[2]} />
      {kind !== 'empty' && <path d="M14 7c0 6 1 9 3 11" stroke="#fff" strokeOpacity=".55" strokeWidth="1.6" fill="none" strokeLinecap="round" />}
    </svg>
  );
}
function Spoon() {
  return (
    <svg width="22" height="50" viewBox="0 0 22 50" aria-hidden="true">
      <ellipse cx="11" cy="11" rx="8" ry="10" fill="#b9864a" /><ellipse cx="11" cy="11" rx="5" ry="7" fill="#a5733a" />
      <rect x="9" y="19" width="4" height="29" rx="2" fill="#b9864a" />
    </svg>
  );
}

export function ClubLegacy(p: LegacyProps) {
  const flags = p.seasons.filter((s) => s.result === 'premier').length;
  const rs = p.seasons.filter((s) => s.result === 'runner').length;
  return (
    <section className="lg" style={{ ['--club' as string]: p.colour }}>
      {/* Trophy cabinet */}
      <div className="lg-cab">
        <div className="lg-cab-h">
          <span className="eyebrow">Trophy cabinet</span>
          <span className="lg-cab-sum">{flags ? `${flags} flag${flags === 1 ? '' : 's'}` : 'No flags yet'}{rs ? ` · ${rs} grand final${rs === 1 ? '' : 's'} lost` : ''}{p.prelims ? ` · ${p.prelims} third-place finish${p.prelims === 1 ? '' : 'es'}` : ''}</span>
        </div>
        <div className="lg-shelf">
          {p.seasons.map((s) => (
            <div key={s.year} className={`lg-slot ${s.result}`}>
              <span className="lg-piece">
                {s.result === 'premier' ? <Cup kind="gold" /> : s.result === 'runner' ? <Cup kind="silver" size={38} /> : s.result === 'spoon' ? <Spoon /> : <Cup kind="empty" size={34} />}
              </span>
              <span className="lg-plaque"><b>{s.year}</b>{s.result === 'premier' ? 'Premiers' : s.result === 'runner' ? 'Runners-up' : s.result === 'spoon' ? 'Spoon' : s.rank ? `${s.rank}${['th', 'st', 'nd', 'rd'][s.rank % 10 > 3 || [11, 12, 13].includes(s.rank) ? 0 : s.rank % 10]}` : '–'}</span>
            </div>
          ))}
          {p.extraTrophies.map((t, i) => (
            <div key={`x${i}`} className="lg-slot premier"><span className="lg-piece"><Cup kind="silver" size={34} /></span><span className="lg-plaque"><b>{t.year}</b>{t.label}</span></div>
          ))}
          <div className="lg-slot next"><span className="lg-piece"><Cup kind="empty" size={34} /></span><span className="lg-plaque"><b>2027</b>Space for one</span></div>
        </div>
        <div className="lg-ledge" aria-hidden="true" />
      </div>

      <div className="lg-side">
        {/* Record + nemesis */}
        <div className="lg-card">
          <span className="eyebrow">All-time</span>
          {p.record ? <b className="lg-rec">{p.record.w}<span>–</span>{p.record.l}<small>{Math.round(p.record.pct * 100)}% since 2022</small></b> : <span className="muted">No record yet.</span>}
          {p.nemesis && (
            <div className="lg-rival bad"><span className="eyebrow">Nemesis</span><b>{p.nemesis.name}</b><span className="mono">{p.nemesis.w}–{p.nemesis.l} in 2026 · {p.nemesis.margin > 0 ? '+' : ''}{p.nemesis.margin}</span></div>
          )}
          {p.bunny && p.bunny.name !== p.nemesis?.name && (
            <div className="lg-rival good"><span className="eyebrow">Bunny</span><b>{p.bunny.name}</b><span className="mono">{p.bunny.w}–{p.bunny.l} in 2026 · {p.bunny.margin > 0 ? '+' : ''}{p.bunny.margin}</span></div>
          )}
        </div>

        {/* Pick vault */}
        <div className="lg-card">
          <div className="row-between"><span className="eyebrow">Pick vault</span><span className="muted" style={{ fontSize: 12 }}>{p.picks.length} held</span></div>
          <div className="lg-tickets">
            {p.picks.length ? p.picks.map((t) => (
              <span key={t.id} className={`lg-ticket ${t.kind} ${t.round === 1 ? 'r1' : ''}`}>
                <small>{t.year}{t.kind === 'msd' ? ' MSD' : ''}</small>
                <b>{t.label}</b>
                {t.via && <i>via {t.via}</i>}
              </span>
            )) : <span className="muted" style={{ fontSize: 13 }}>No picks in the vault.</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
