'use client';
import { useState } from 'react';

type PathKey = 'winNow' | 'balanced' | 'regenerate';
type PickPlan = { pick?: string; target?: string; line?: string; examples?: string[]; why?: string };
type PathReport = { summary?: string; keepers?: { keep?: string[]; letGo?: string[] }; rookie?: string; picks?: PickPlan[]; trades?: string[]; risk?: string };
type Report = {
  grade?: string; headline?: string; window?: string; verdict?: string; strengths?: string[]; holes?: string[];
  paths?: Partial<Record<PathKey, PathReport>>; futurePicks?: string; recommended?: PathKey[]; phase?: string;
};

const PATHS: { key: PathKey; name: string; blurb: string }[] = [
  { key: 'winNow', name: 'Win now', blurb: 'Points for 2027–28' },
  { key: 'balanced', name: 'Balanced', blurb: 'Contend and top up' },
  { key: 'regenerate', name: 'Regenerate', blurb: 'Build for 2029+' },
];
const TARGET_COLOUR: Record<string, string> = {
  'Win-now asset': '#d4a62a', 'List-hole filler': '#c46a2f', 'Best available': '#4f6b8a', 'Young upside': '#4f9a5f', 'Best rookie': '#1f6b3a',
};

const gradeColour = (g = '') => (g.startsWith('A') ? '#1f6b3a' : g.startsWith('B') ? '#4f9a5f' : g.startsWith('C') ? '#a87a22' : '#c8352b');

function List({ title, items, tone }: { title: string; items?: string[]; tone?: 'good' | 'bad' }) {
  if (!items?.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="eyebrow" style={{ color: tone === 'good' ? '#1f6b3a' : tone === 'bad' ? '#a3271c' : undefined }}>{title}</span>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 14, lineHeight: 1.45 }}>
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  );
}

export function ListHealth({ teamId, teamName }: { teamId: number; teamName: string }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [gate, setGate] = useState<{ error?: string } | null>(null);
  const [code, setCode] = useState('');
  const [tab, setTab] = useState<PathKey | null>(null);

  const run = async (passcode?: string, fresh = false) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/list-health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId, code: passcode, fresh }) });
      const j = await r.json();
      if (j.needCode) { setGate({ error: passcode ? j.error ?? 'Wrong code.' : undefined }); setCode(''); }
      else if (j.error) { setGate(null); setErr(j.error); }
      else { setGate(null); setReport(j.report); setTab(j.report?.recommended?.[0] ?? 'balanced'); }
    } catch { setErr('Couldn’t reach the assistant. Try again.'); }
    setBusy(false);
  };

  const rec = report?.recommended ?? [];
  const active = tab ?? rec[0] ?? 'balanced';
  const path = report?.paths?.[active];
  return (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid #d9e6d2', background: 'linear-gradient(180deg, #f6faf3, #fff)' }}>
      {gate && (
        <div className="logo-modal" role="dialog" aria-modal="true" aria-label="Enter passcode" onClick={(e) => { if (e.target === e.currentTarget) setGate(null); }}>
          <form className="logo-modal-card" style={{ width: 280 }} onSubmit={(e) => { e.preventDefault(); run(code); }}>
            <b style={{ fontSize: 16 }}>Passcode</b>
            <span className="muted" style={{ fontSize: 13 }}>Enter the code to use the assistant. You’ll only need it once on this device.</span>
            <input className="input" autoFocus inputMode="numeric" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} aria-label="Passcode"
              style={{ width: '100%', textAlign: 'center', fontSize: 22, letterSpacing: '.3em', fontFamily: 'var(--mono)' }} />
            {gate.error && <span style={{ color: '#a3271c', fontSize: 13 }}>{gate.error}</span>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
              <button type="button" className="btn" onClick={() => setGate(null)}>Cancel</button>
              <button type="submit" className="btn dark" disabled={busy || !code}>{busy ? 'Checking…' : 'Unlock'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="row-between" style={{ gap: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="ask-spark" style={{ width: 30, height: 30, fontSize: 14 }} aria-hidden>✦</span><span className="eyebrow">List assessment</span></span>
        {report && <button type="button" className="ask-chip" disabled={busy} onClick={() => run(undefined, true)}>{busy ? 'Working…' : 'Refresh'}</button>}
      </div>

      {!report && (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>An AI assessment of {teamName}’s list with three paths (win now, balanced, regenerate): who to keep on each, and what type of player to target with each of your first five picks.</p>
          <button type="button" className="btn dark" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => run()}>{busy ? 'Writing the report… (about 20 sec)' : 'Generate report'}</button>
        </>
      )}
      {err && <p style={{ margin: 0, color: '#a3271c', fontSize: 14 }}>{err}</p>}

      {report && (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ font: '900 34px/1 var(--display)', color: gradeColour(report.grade), minWidth: 52, textAlign: 'center' }}>{report.grade ?? '–'}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <b style={{ fontSize: 15, lineHeight: 1.35 }}>{report.headline}</b>
              {report.window && <span className="muted" style={{ fontSize: 13 }}>{report.window}</span>}
            </div>
          </div>
          {report.verdict && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{report.verdict}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <List title="Strengths" items={report.strengths} tone="good" />
            <List title="Holes" items={report.holes} tone="bad" />
          </div>

          <div role="tablist" aria-label="List paths" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            {PATHS.map((p) => {
              const on = p.key === active, r = rec.indexOf(p.key);
              return (
                <button key={p.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(p.key)}
                  style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 10, cursor: 'pointer', color: 'inherit', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
                    border: on ? '2px solid var(--ink)' : '1px solid var(--line)', background: on ? '#fff' : 'transparent' }}>
                  <b style={{ fontSize: 14 }}>{p.name}</b>
                  <span className="muted" style={{ fontSize: 11 }}>{p.blurb}</span>
                  <span style={{ fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '.04em', color: r === 0 ? '#1f6b3a' : r === 1 ? '#4f9a5f' : '#8d978e' }}>
                    {r === 0 ? 'BEST FIT' : r === 1 ? 'ALSO SUITS' : 'LESS SUITED'}
                  </span>
                </button>
              );
            })}
          </div>

          {path ? (
            <div role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {path.summary && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{path.summary}</p>}
              {path.picks?.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="eyebrow">First five picks</span>
                  {path.picks.slice(0, 5).map((pk, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr)', gap: 10, alignItems: 'start', padding: '8px 0', borderTop: i ? '1px solid var(--line)' : 0 }}>
                      <b style={{ fontFamily: 'var(--mono)', fontSize: 15 }}>{pk.pick}</b>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          <b style={{ fontSize: 14, color: TARGET_COLOUR[pk.target ?? ''] ?? 'inherit' }}>{pk.target}</b>
                          {pk.line && pk.line !== 'Any' && <span className="mono muted" style={{ fontSize: 11 }}>{pk.line}</span>}
                        </span>
                        {pk.examples?.length ? <span style={{ fontSize: 13 }}>e.g. {pk.examples.join(', ')}</span> : null}
                        {pk.why && <span className="muted" style={{ fontSize: 13 }}>{pk.why}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <span className="muted" style={{ fontSize: 13 }}>No picks in the next draft.</span>}
              {path.keepers?.keep?.length ? <span style={{ fontSize: 14 }}><b>Keep:</b> {path.keepers.keep.join(', ')}</span> : null}
              <List title="Let go or sell" items={path.keepers?.letGo} tone="bad" />
              {path.rookie && <span style={{ fontSize: 14 }}><b>Rookie slot:</b> {path.rookie}</span>}
              <List title="Trades" items={path.trades} />
              {path.risk && <span style={{ fontSize: 14 }}><b>Risk:</b> {path.risk}</span>}
            </div>
          ) : <span className="muted" style={{ fontSize: 13 }}>This path didn’t come back. Hit Refresh.</span>}
          {report.futurePicks && <span style={{ fontSize: 14 }}><b>Future picks:</b> {report.futurePicks}</span>}
          <span style={{ fontSize: 11 }} className="muted">AI-written from the site’s numbers (2026 scoring, 2027 projections, picks, draft pool). A second opinion, not gospel.</span>
        </>
      )}
    </div>
  );
}
