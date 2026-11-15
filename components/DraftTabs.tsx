import Link from 'next/link';
import { C } from '@/lib/ratings';

const TABS = [
  ['picks', 'League picks', '/draft'],
  ['centre', 'Draft Centre', '/draft/centre'],
  ['msd', 'Mid-season draft', '/draft/msd'],
  ['mock', '2027 mock draft', '/draft/mock'],
  ['review', 'AFL draft review', '/draft/history'],
  ['crystal', 'Crystal ball', '/draft/crystal-ball'],
] as const;
type Key = (typeof TABS)[number][0];

// Mobile: four sections. Draft Centre holds the mid-season and mock drafts; Draft Data holds the AFL draft review.
const GROUPS: { key: string; label: string; href: string; keys: Key[]; subs?: [Key, string, string][] }[] = [
  { key: 'home', label: 'Draft Home', href: '/draft', keys: ['picks'] },
  { key: 'centre', label: 'Draft Centre', href: '/draft/centre', keys: ['centre', 'msd', 'mock'],
    subs: [['centre', 'Centre', '/draft/centre'], ['msd', 'Mid-season', '/draft/msd'], ['mock', 'Mock draft', '/draft/mock']] },
  { key: 'data', label: 'Draft Data', href: '/draft/history', keys: ['review'], subs: [['review', 'AFL draft review', '/draft/history']] },
  { key: 'crystal', label: 'Crystal Ball', href: '/draft/crystal-ball', keys: ['crystal'] },
];

/** Section switcher for the draft area. */
export function DraftTabs({ active, showCrystal = true }: { active: Key; showCrystal?: boolean }) {
  const group = GROUPS.find((g) => g.keys.includes(active));
  return (
    <>
      <div role="tablist" aria-label="Draft section" className="dt-desk" style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: 'var(--line)', gap: 2, flexWrap: 'wrap' }}>
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
      <div className="dt-mob">
        <nav role="tablist" aria-label="Draft section" className="dt-four">
          {GROUPS.filter((g) => g.key !== 'crystal' || showCrystal).map((g) => (
            <Link key={g.key} href={g.href} role="tab" aria-selected={g === group} className={g === group ? 'on' : undefined}>
              {g.label}
            </Link>
          ))}
        </nav>
        {group?.subs && group.subs.length > 1 && (
          <nav aria-label={`${group.label} pages`} className="dt-subs">
            {group.subs.map(([k, label, href]) => (
              <Link key={k} href={href} aria-current={k === active ? 'page' : undefined} className={k === active ? 'on' : undefined}>{label}</Link>
            ))}
          </nav>
        )}
      </div>
    </>
  );
}
