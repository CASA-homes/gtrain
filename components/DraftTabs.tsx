import Link from 'next/link';

const TABS = [
  ['picks', 'League picks', '/draft'],
  ['centre', 'Draft Centre', '/draft/centre'],
  ['msd', 'Mid-season draft', '/draft/msd'],
  ['mock', '2027 mock draft', '/draft/mock'],
  ['review', 'AFL draft review', '/draft/history'],
  ['crystal', 'Crystal ball', '/draft/crystal-ball'],
] as const;
type Key = (typeof TABS)[number][0];

// Four sections on every screen size. Draft Centre holds the mid-season and mock drafts; Draft Data holds the AFL draft review.
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
      <div className="dt-mob">
        <nav role="tablist" aria-label="Draft section" className="dt-four">
          {GROUPS.filter((g) => g.key !== 'crystal' || showCrystal).map((g) => (
            <Link key={g.key} href={g.href} role="tab" aria-selected={g === group} className={`${g === group ? 'on' : ''}${g.key === 'crystal' ? ' gold' : ''}`.trim() || undefined}>
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
