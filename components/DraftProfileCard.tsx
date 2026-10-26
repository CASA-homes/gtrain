import type { DraftProfile } from '@/lib/draft-profiles';

const publisher = (url: string) => url.includes('espn.com') ? 'ESPN' : url.includes('essendonfc') ? 'Essendon FC' : url.includes('dfsaustralia') ? 'DFS Australia' : 'Rookie Me Central';

/** The pre-draft scouting profile: facts, junior numbers, strengths and improvements, with a link to the guide. */
export function DraftProfileCard({ d, compact = false }: { d: DraftProfile; compact?: boolean }) {
  const facts: [string, string | undefined][] = [
    ['Junior club', d.junior], ['State', d.state], ['Position', d.position], ['Height', d.height ? `${d.height} cm` : undefined],
    ['Draft projection', d.projection ? `Picks ${d.projection}` : undefined],
  ];
  const ratings = (title: string, r?: Record<string, string>) => r && Object.keys(r).length ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="eyebrow">{title}</span>
      {Object.entries(r).map(([k, v]) => (
        <span key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
          <span>{k}</span>
          <span className="pill" style={{ background: /above|elite/i.test(v) ? '#d8ecd0' : /below/i.test(v) ? '#f3d9d2' : '#f1e8a8', color: '#151a16' }}>{v}</span>
        </span>
      ))}
    </div>
  ) : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 12 : 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px 18px' }}>
        {facts.filter(([, v]) => v).map(([k, v]) => (
          <span key={k} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}><span className="eyebrow">{k}</span><b style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{v}</b></span>
        ))}
      </div>
      {d.stats && d.stats.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="eyebrow">{/VFL|SANFL League|WAFL/.test(d.statsFrom ?? '') ? 'Pre-draft numbers' : 'Junior numbers'}{d.statsFrom ? ` · ${d.statsFrom}` : ''}</span>
          <div className="tiles" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
            {d.stats.map((s) => <div key={s.label} className="tile" style={{ minWidth: 0 }}><span className="eyebrow" style={{ overflowWrap: 'anywhere' }}>{s.label}</span><b>{s.value}</b></div>)}
          </div>
        </div>
      )}
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, maxWidth: '70ch' }}>{d.summary}</p>
      {(d.strengths.length > 0 || d.improvements.length > 0 || (!compact && (d.athletic || d.onField))) && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {d.strengths.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow" style={{ color: '#1f6b3a' }}>Strengths</span>
          {d.strengths.map((s) => <span key={s} style={{ fontSize: 14, lineHeight: 1.45 }}><b style={{ color: '#1f6b3a' }}>+</b> {s}</span>)}
        </div>}
        {d.improvements.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow" style={{ color: '#b4532a' }}>To work on</span>
          {d.improvements.map((s) => <span key={s} style={{ fontSize: 14, lineHeight: 1.45 }}><b style={{ color: '#b4532a' }}>–</b> {s}</span>)}
        </div>}
        {!compact && ratings('Athletic', d.athletic)}
        {!compact && ratings('On field', d.onField)}
      </div>}
      {d.games && <GameByGame g={d.games} compact={compact} />}
      {d.zh && <ZeroHanger z={d.zh} />}
      <span className="muted" style={{ fontSize: 12 }}>
        Source: <a href={d.source.url} target="_blank" rel="noreferrer">{d.source.title}</a>{d.source.page ? `, page ${d.source.page}` : ''} ({publisher(d.source.url)}){d.year === 2020 && !d.source.url.includes('espn.com') ? <>, with the scouting read from <a href="https://www.espn.com/afl/story/_/id/30478295/afl-draft-2020-phantom-draft-chris-doerre-espn-full-final-phantom-draft" target="_blank" rel="noreferrer">ESPN’s 2020 phantom draft</a></> : null}. Summary is our own read of the source.
      </span>
    </div>
  );
}

const chip = (x: number) => ({ background: x >= 150 ? '#1f6b3a' : x >= 120 ? '#9fd18b' : x >= 100 ? '#d8ecd0' : 'var(--chip, #eee9dc)', color: x >= 150 ? '#fff' : '#151a16' });

/** Every junior game's AFL Fantasy score: the big games are the tell (Sheezel averaged 83 but had a 159). */
function GameByGame({ g, compact }: { g: NonNullable<DraftProfile['games']>; compact: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="eyebrow">Game by game · AFL Fantasy</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13 }}>
        <span className="pill" style={chip(g.max)}>Best game {g.max}</span>
        <span className="pill">{g.g120} game{g.g120 === 1 ? '' : 's'} of 120+</span>
        {g.g150 > 0 && <span className="pill" style={chip(150)}>{g.g150} of 150+</span>}
        <span className="muted">{g.n} games, 2025–26</span>
      </div>
      {g.seasons.slice(0, compact ? 2 : 4).map((s) => (
        <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="muted" style={{ fontSize: 12 }}>{s.label}: avg <b>{s.avg.toFixed(0)}</b> from {s.n}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {s.scores.map((x, i) => <span key={i} className="mono" style={{ ...chip(x), fontSize: 11, padding: '1px 5px', borderRadius: 4, minWidth: 26, textAlign: 'center' }}>{x}</span>)}
          </div>
        </div>
      ))}
      <span className="muted" style={{ fontSize: 11 }}>From the <a href="https://www.afl.com.au/" target="_blank" rel="noreferrer">AFL match centre</a> (Talent League and U18 Championships). WAFL Colts, SANFL U18 and school games aren’t included.</span>
    </div>
  );
}

function ZeroHanger({ z }: { z: NonNullable<DraftProfile['zh']> }) {
  const facts: [string, string | undefined][] = [['Big board', z.rank ? `#${z.rank}` : undefined], ['Mock pick', z.mock], ['Range', z.range], ['Landing spots', z.landing?.join(', ')]];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--line, #e3dccb)', paddingTop: 12 }}>
      <span className="eyebrow">Zero Hanger’s read</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px 18px' }}>
        {facts.filter(([, v]) => v).map(([k, v]) => <span key={k} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}><span className="eyebrow">{k}</span><b style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{v}</b></span>)}
      </div>
      {z.strengths && z.strengths.length > 0 && <span style={{ fontSize: 14 }}>{z.strengths.map((s) => <span key={s} style={{ marginRight: 10 }}><b style={{ color: '#1f6b3a' }}>+</b> {s}</span>)}</span>}
      {z.note && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, maxWidth: '70ch' }}>{z.note}</p>}
      <span className="muted" style={{ fontSize: 12 }}>Source: <a href={z.url} target="_blank" rel="noreferrer">{z.source}</a> (Zero Hanger). Summary is our own read.</span>
    </div>
  );
}
