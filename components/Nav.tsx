'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/clubhouse', label: 'Clubhouse' },
  { href: '/players', label: 'Players' },
  { href: '/market', label: 'Market' },
  { href: '/league', label: 'League' },
  { href: '/rankings', label: 'Rankings' },
  { href: '/draft', label: 'Draft' },
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
            <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? 'page' : undefined}>
              {l.label}
            </Link>
          ))}
        </div>
        <Link href={`/clubhouse/${myTeamId}`} className="nav-me">
          <span>{shortCode}</span>My club
        </Link>
        <form action="/auth/signout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </div>
    </nav>
  );
}
