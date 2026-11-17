// Header for the Trademarket "All" pages: breadcrumb back to the market home, title and a line of context.
import Link from 'next/link';
import type { ReactNode } from 'react';

const TABS = [
  ['auctions', 'Auctions'], ['clauses', 'Release clauses'], ['free-agents', 'Free agents'], ['listings', 'Trade block'], ['transactions', 'Transactions'],
] as const;

export function MarketSub({ title, sub, tab, children }: { title: string; sub?: ReactNode; tab: (typeof TABS)[number][0]; children?: ReactNode }) {
  return (
    <div className="th-head" style={{ alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="th-crumb"><Link href="/market">← Trademarket</Link> / {title}</span>
        <h1>{title}</h1>
        {sub && <p style={{ maxWidth: '78ch' }}>{sub}</p>}
        <nav className="th-pills" aria-label="Market sections" style={{ marginTop: 12 }}>
          {TABS.map(([k, l]) => <Link key={k} href={`/market/${k}`} className="th-pill" aria-current={k === tab ? 'page' : undefined}>{l}</Link>)}
        </nav>
      </div>
      {children}
    </div>
  );
}
