'use client';
// League settings › Stats sources (commish): pull a season from AFL Tables / Footywire and see how each lines up
// with the scores the site uses now.
import { useState } from 'react';

type Cmp = { source: string; lines: number; linked: number; compared: number; exact: number; matches_official: number; worst: { name: string; round: number; points: number; score: number }[] | null };

export function StatsSources({ season, compare }: { season: number; compare: Cmp[] | null }) {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const say = (s: string) => setLog((l) => [...l, s]);
  const run = async (source: 'afltables' | 'footywire') => {
    setBusy(true); setLog([]);
    try {
      if (source === 'afltables') {
        say('Fetching all 18 clubs from AFL Tables…');
        const r = await fetch(`/api/stats/sync?source=afltables&season=${season}`).then((x) => x.json());
        say(r.error ? `Failed: ${r.error}` : `Stored ${r.stored} player-games.`);
      } else {
        let from: number | null = 0;
        while (from != null) {
          const r: { error?: string; stored: number; next: number | null; total: number } = await fetch(`/api/stats/sync?source=footywire&season=${season}&from=${from}&n=20`).then((x) => x.json());
          if (r.error) { say(`Failed: ${r.error}`); break; }
          say(`Matches ${from + 1}–${Math.min(from + 20, r.total)} of ${r.total}: ${r.stored} player-games.`);
          from = r.next;
        }
      }
      say('Done. Refresh to see the comparison.');
    } finally { setBusy(false); }
  };
  return (
    <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, gridColumn: '1 / -1' }}>
      <h2 className="h2" style={{ fontSize: 18 }}>Stats sources</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Raw match stats from AFL Tables and Footywire, with fantasy points worked out here (kick 3, handball 2, mark 3, tackle 4, hitout 1, goal 6, behind 1, free for 1, free against −3). Compared against the scores the site uses now.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={busy} onClick={() => run('afltables')}>Sync AFL Tables {season}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => run('footywire')}>Sync Footywire {season}</button>
      </div>
      {log.length > 0 && <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{log.join('\n')}</pre>}
      {compare && compare.length > 0 && (
        <table className="squad" style={{ fontSize: 13 }}>
          <thead><tr><th>Source</th><th style={{ textAlign: 'right' }}>Player-games</th><th style={{ textAlign: 'right' }}>Linked to players</th><th style={{ textAlign: 'right' }}>Compared</th><th style={{ textAlign: 'right' }}>Exact match</th><th style={{ textAlign: 'right' }}>= official AF</th></tr></thead>
          <tbody>
            {compare.map((c) => (
              <tr key={c.source}>
                <td>{c.source === 'afltables' ? 'AFL Tables' : 'Footywire'}</td>
                <td style={{ textAlign: 'right' }}>{c.lines}</td><td style={{ textAlign: 'right' }}>{c.linked}</td><td style={{ textAlign: 'right' }}>{c.compared}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{c.compared ? `${c.exact} (${Math.round((c.exact / c.compared) * 1000) / 10}%)` : '–'}</td>
                <td style={{ textAlign: 'right' }}>{c.source === 'footywire' ? c.matches_official : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {compare?.some((c) => c.worst?.length) && (
        <details><summary style={{ cursor: 'pointer', fontSize: 13 }}>Biggest differences</summary>
          <ul style={{ fontSize: 12, margin: '6px 0 0', paddingLeft: 18 }}>
            {compare.flatMap((c) => (c.worst ?? []).map((w, i) => <li key={c.source + i}>{c.source}: {w.name} R{w.round} — ours {w.points}, stored {w.score}</li>))}
          </ul>
        </details>
      )}
    </section>
  );
}
