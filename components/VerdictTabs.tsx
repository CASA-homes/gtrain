'use client';
import { useState, type ReactNode } from 'react';

const TABS = ['Season verdict', 'Squad summary', 'Draft outlook'] as const;

/** The dark verdict card with three small headers that switch the body. */
export function VerdictTabs({ panels }: { panels: [ReactNode, ReactNode, ReactNode] }) {
  const [tab, setTab] = useState(0);
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--ink)', color: '#f4f2ea', border: 0 }}>
      <div role="tablist" aria-label="Verdict" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TABS.map((t, i) => (
          <button key={t} type="button" role="tab" aria-selected={tab === i} onClick={() => setTab(i)}
            style={{
              font: '500 10px var(--mono)', letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer',
              padding: '5px 10px', borderRadius: 999, border: '1px solid',
              borderColor: tab === i ? '#f4f2ea' : '#3c463e', background: tab === i ? '#f4f2ea' : 'transparent', color: tab === i ? 'var(--ink)' : '#b9c4b6',
            }}>
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel">{panels[tab]}</div>
    </div>
  );
}
