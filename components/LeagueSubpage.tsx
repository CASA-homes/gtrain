import Link from 'next/link';
import type { ReactNode } from 'react';

export function SubHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '22px 24px', background: 'var(--ink)', color: 'var(--cream)', borderRadius: 18 }}>
      <Link href="/league" style={{ font: '500 12px var(--mono)', letterSpacing: '.14em', textTransform: 'uppercase', color: '#9ccb84', textDecoration: 'none' }}>← The League · {eyebrow}</Link>
      <h1 style={{ font: '900 44px/.95 var(--display)', textTransform: 'uppercase' }}>{title}</h1>
      <span style={{ color: '#b9c0b8' }}>{sub}</span>
    </header>
  );
}

export function Group({ title, note, rows }: { title: string; note?: ReactNode; rows: [string, ReactNode][] }) {
  return (
    <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 className="h2" style={{ fontSize: 18 }}>{title}</h2>
      {note && <p className="muted" style={{ fontSize: 13, margin: 0 }}>{note}</p>}
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 34%) 1fr', gap: '8px 16px', margin: 0, fontSize: 14 }}>
        {rows.map(([k, v]) => [<dt key={k + 'k'} className="muted">{k}</dt>, <dd key={k + 'v'} style={{ margin: 0 }}>{v}</dd>])}
      </dl>
    </section>
  );
}
