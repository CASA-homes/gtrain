'use client';
import Link from 'next/link';
import { useState } from 'react';

type Row = { id: number; name: string; positions: string[]; club: string; owner: string; age: number | null; [k: string]: unknown };
type Res = { title: string; answer: string; columns: string[]; sortBy: string; rows: Row[] } | { error: string };

const LABEL: Record<string, string> = {
  avg26: '’26 avg', avg25: '’25 avg', avg24: '’24 avg', jump: 'Jump', last3: 'L3', last5: 'L5', last8: 'L8', trend: 'Trend', secondHalf: '2nd half',
  max: 'Best', tons: '100s', games26: '’26 g', games25: '’25 g', tog: 'TOG %', cba: 'CBA %', age: 'Age', value: 'Value', potential: 'Pot.',
};
const EXAMPLES = ['Which player had the biggest jump in average?', 'Who’s trending up at an exciting rate?', 'Best free-agent forwards under 25', 'Most improved defenders on my list'];

export function AskPlayers() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res | null>(null);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setQ(question); setBusy(true); setRes(null);
    try {
      const r = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: question }) });
      setRes(await r.json());
    } catch { setRes({ error: 'Couldn’t reach the assistant. Try again.' }); }
    setBusy(false);
  };

  return (
    <section className="card ask-box">
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} style={{ display: 'flex', gap: 8 }}>
        <span className="ask-spark" aria-hidden>✦</span>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} placeholder="Ask about players… e.g. who’s trending up at an exciting rate?" aria-label="Ask the player assistant" style={{ flex: 1, minWidth: 0 }} />
        <button className="btn dark" type="submit" disabled={busy}>{busy ? 'Thinking…' : 'Ask'}</button>
      </form>
      {!res && !busy && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {EXAMPLES.map((x) => <button key={x} type="button" className="ask-chip" onClick={() => ask(x)}>{x}</button>)}
        </div>
      )}
      {res && 'error' in res && <p style={{ margin: 0, color: '#a3271c', fontSize: 14 }}>{res.error}</p>}
      {res && !('error' in res) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <b style={{ fontSize: 15 }}>{res.title}</b>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{res.answer}</p>
          {res.rows.length > 0 && (
            <div className="table-box">
              <table className="squad">
                <thead><tr><th style={{ width: 32 }}>#</th><th>Player</th><th>Pos</th><th>Club</th><th>Owner</th>{res.columns.map((c) => <th key={c} style={{ textAlign: 'right' }}>{LABEL[c] ?? c}</th>)}</tr></thead>
                <tbody>
                  {res.rows.map((r, i) => (
                    <tr key={r.id}>
                      <td className="mono muted">{i + 1}</td>
                      <td style={{ whiteSpace: 'nowrap' }}><Link href={`/players/${r.id}`}>{r.name}</Link></td>
                      <td className="mono" style={{ fontSize: 12 }}>{r.positions.join('/')}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{r.club}</td>
                      <td className="muted" style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{r.owner}</td>
                      {res.columns.map((c) => { const v = r[c]; return <td key={c} className="mono" style={{ textAlign: 'right', fontWeight: c === res.sortBy ? 700 : 400 }}>{v == null ? '–' : c === 'jump' || c === 'trend' ? `${(v as number) > 0 ? '+' : ''}${v}` : String(v)}</td>; })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button type="button" className="ask-chip" style={{ alignSelf: 'flex-start' }} onClick={() => { setRes(null); setQ(''); }}>Clear</button>
        </div>
      )}
    </section>
  );
}
