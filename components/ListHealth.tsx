'use client';
import { useState } from 'react';

type Report = {
  grade?: string; headline?: string; window?: string;
  keepers?: { core?: string[]; keep?: string[]; bubble?: string[]; letGo?: string[] };
  rookie?: string; strengths?: string[]; holes?: string[]; draftPlan?: string[]; tradeIdeas?: string[]; futurePicks?: string;
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

  const run = async (passcode?: string, fresh = false) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/list-health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId, code: passcode, fresh }) });
      const j = await r.json();
      if (j.needCode) { setGate({ error: passcode ? j.error ?? 'Wrong code.' : undefined }); setCode(''); }
      else if (j.error) { setGate(null); setErr(j.error); }
      else { setGate(null); setReport(j.report); }
    } catch { setErr('Couldn’t reach the assistant. Try again.'); }
    setBusy(false);
  };

  const k = report?.keepers;
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
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="ask-spark" style={{ width: 30, height: 30, fontSize: 14 }} aria-hidden>✦</span><span className="eyebrow">List health report</span></span>
        {report && <button type="button" className="ask-chip" disabled={busy} onClick={() => run(undefined, true)}>{busy ? 'Working…' : 'Refresh'}</button>}
      </div>

      {!report && (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>An AI read on {teamName}’s list: who to keep, where it’s strong, where the holes are, and what to target with each pick.</p>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <List title="Strengths" items={report.strengths} tone="good" />
            <List title="Holes" items={report.holes} tone="bad" />
          </div>
          {k && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="eyebrow">Keeper blend</span>
              {k.core?.length ? <span style={{ fontSize: 14 }}><b>Core:</b> {k.core.join(', ')}</span> : null}
              {k.keep?.length ? <span style={{ fontSize: 14 }}><b>Keep:</b> {k.keep.join(', ')}</span> : null}
              <List title="On the bubble" items={k.bubble} />
              <List title="Let go or sell" items={k.letGo} tone="bad" />
              {report.rookie && <span style={{ fontSize: 14 }}><b>Rookie slot:</b> {report.rookie}</span>}
            </div>
          )}
          <List title="Draft plan" items={report.draftPlan} />
          <List title="Trade ideas" items={report.tradeIdeas} />
          {report.futurePicks && <span style={{ fontSize: 14 }}><b>Future picks:</b> {report.futurePicks}</span>}
          <span style={{ fontSize: 11 }} className="muted">AI-written from the site’s numbers (2026 scoring, 2027 projections, picks, draft pool). A second opinion, not gospel.</span>
        </>
      )}
    </div>
  );
}
