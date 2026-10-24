'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Simple line icons (24px grid, stroked) used for the phone menu.
const ICONS: Record<string, React.ReactNode> = {
  clubhouse: <><path d="M3.5 10.5 12 4l8.5 6.5" /><path d="M5.5 9v10.5h13V9" /><path d="M10 19.5v-5h4v5" /></>,
  players: <><circle cx="12" cy="8" r="3.6" /><path d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6" /></>,
  market: <><path d="m13.2 4.6 6.2 6.2" /><path d="m10.2 7.6 6.2 6.2" /><path d="m11.7 6.1 6.2 6.2" /><path d="m12.4 11.3-7.6 7.6a1.4 1.4 0 0 0 2 2l7.6-7.6" /><path d="M13 20.5h7.5" /></>,
  league: <><path d="M7.5 3.5v17M16.5 3.5v17" /><path d="M7.5 7.5h9M7.5 12h9M7.5 16.5h9" /></>,
  rankings: <><path d="M4 20.5h16" /><path d="M9 20.5V9.5h6v11" /><path d="M4.5 20.5v-6h4.5M15 20.5v-8h4.5v8" /><path d="m12 3.6.8 1.6 1.7.2-1.3 1.2.3 1.7-1.5-.8-1.5.8.3-1.7-1.3-1.2 1.7-.2Z" /></>,
  draft: <><path d="M9.5 6.5h10M9.5 12h10M9.5 17.5h10" /><circle cx="5" cy="6.5" r="1.1" /><circle cx="5" cy="12" r="1.1" /><circle cx="5" cy="17.5" r="1.1" /></>,
  signout: <><path d="M14 4.5H6.5v15H14" /><path d="M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5" /></>,
};
const Icon = ({ name }: { name: string }) => (
  <svg className="nav-ico" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
);

const LINKS = [
  { href: '/clubhouse', label: 'Clubhouse', icon: 'clubhouse' },
  { href: '/players', label: 'Players', icon: 'players' },
  { href: '/market', label: 'Market', icon: 'market' },
  { href: '/league', label: 'League', icon: 'league' },
  { href: '/rankings', label: 'Rankings', icon: 'rankings' },
  { href: '/draft', label: 'Draft', icon: 'draft' },
];

export function Nav({ myTeamId, shortCode }: { myTeamId: number; shortCode: string }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="G-Train">
      <div className="nav-in">
        <Link href="/" className="nav-brand">
          <span>GT</span>
          <span style={{ fontWeight: 600, fontSize: 15 }}>G-Train</span>
        </Link>
        <div className="nav-links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-label={l.label} title={l.label} aria-current={path.startsWith(l.href) ? 'page' : undefined}>
              <Icon name={l.icon} /><span className="nav-label">{l.label}</span>
            </Link>
          ))}
        </div>
        <Link href={`/clubhouse/${myTeamId}`} className="nav-me" aria-label="My club">
          <span>{shortCode}</span><em>My club</em>
        </Link>
        <form action="/auth/signout" method="post" className="nav-out">
          <button type="submit" aria-label="Sign out" title="Sign out"><Icon name="signout" /><span className="nav-label">Sign out</span></button>
        </form>
      </div>
    </nav>
  );
}
