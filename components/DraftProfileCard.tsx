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
      <span className="muted" style={{ fontSize: 12 }}>
        Source: <a href={d.source.url} target="_blank" rel="noreferrer">{d.source.title}</a>{d.source.page ? `, page ${d.source.page}` : ''} ({publisher(d.source.url)}){d.year === 2020 && !d.source.url.includes('espn.com') ? <>, with the scouting read from <a href="https://www.espn.com/afl/story/_/id/30478295/afl-draft-2020-phantom-draft-chris-doerre-espn-full-final-phantom-draft" target="_blank" rel="noreferrer">ESPN’s 2020 phantom draft</a></> : null}. Summary is our own read of the source.
      </span>
    </div>
  );
}
