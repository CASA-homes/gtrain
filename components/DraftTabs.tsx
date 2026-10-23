import Link from 'next/link';
import { C } from '@/lib/ratings';

const TABS = [
  ['picks', 'G-Train picks', '/draft'],
  ['review', 'AFL draft review', '/draft/history'],
  ['crystal', 'Crystal ball', '/draft/crystal-ball'],
] as const;

/** Section switcher for the draft area. */
export function DraftTabs({ active, showCrystal = true }: { active: (typeof TABS)[number][0]; showCrystal?: boolean }) {
  return (
    <div role="tablist" aria-label="Draft section" style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: 'var(--line)', gap: 2, flexWrap: 'wrap' }}>
      {TABS.filter(([key]) => key !== 'crystal' || showCrystal).map(([key, label, href]) => {
        const on = key === active;
        return (
          <Link key={key} href={href} role="tab" aria-selected={on}
            style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', background: on ? '#fff' : 'transparent', color: on ? C.ink : C.muted, boxShadow: on ? '0 1px 2px rgb(0 0 0 / .08)' : 'none' }}>
            {key === 'crystal' ? '🔮 ' : ''}{label}
          </Link>
        );
      })}
    </div>
  );
}
