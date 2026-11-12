'use client';
import Link from 'next/link';
import { KeeperMark, KeeperWordmark } from '@/components/KeeperMark';
import { usePathname } from 'next/navigation';
import { NavSearch } from '@/components/NavSearch';

// Simple line icons (24px grid, stroked) used for the phone menu.
const ICONS: Record<string, React.ReactNode> = {
  clubhouse: <><path d="M3.5 10.5 12 4l8.5 6.5" /><path d="M5.5 9v10.5h13V9" /><path d="M10 19.5v-5h4v5" /></>,
  players: <><circle cx="12" cy="8" r="3.6" /><path d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6" /></>,
  market: <><path d="M4 8h15M15.5 4.5 19 8l-3.5 3.5" /><path d="M20 16H5M8.5 12.5 5 16l3.5 3.5" /></>,
  league: <><path d="M7.5 3.5v17M16.5 3.5v17" /><path d="M7.5 7.5h9M7.5 12h9M7.5 16.5h9" /></>,
  rankings: <><path d="M4 20.5h16" /><path d="M9 20.5V9.5h6v11" /><path d="M4.5 20.5v-6h4.5M15 20.5v-8h4.5v8" /><path d="m12 3.6.8 1.6 1.7.2-1.3 1.2.3 1.7-1.5-.8-1.5.8.3-1.7-1.3-1.2 1.7-.2Z" /></>,
  draft: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>,
  live: <><path d="M13.5 3 5.5 13.5h6L10.5 21l8-10.5h-6Z" /></>,
  signout: <><path d="M14 4.5H6.5v15H14" /><path d="M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5" /></>,
};
const Icon = ({ name }: { name: string }) => (
  <svg className="nav-ico" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
);

const LINKS = [
  { href: '/clubhouse', label: 'Clubhouse', short: 'Club', icon: 'clubhouse' },
  { href: '/players', label: 'Players', short: 'Players', icon: 'players' },
  { href: '/market', label: 'Trademarket', short: 'Trade', icon: 'market' },
  { href: '/league', label: 'League', short: 'League', icon: 'league' },
  { href: '/rankings', label: 'Rankings', short: 'Ranks', icon: 'rankings' },
  { href: '/draft', label: 'Draft', short: 'Draft', icon: 'draft' },
  { href: '/live', label: 'Matchday', short: 'Match', icon: 'live' },
];

export function Nav({ myTeamId, shortCode, guest = false, logo, leagues = [], leagueId }: { myTeamId: number; shortCode: string; guest?: boolean; logo?: string | null; leagues?: { id: number; name: string }[]; leagueId?: number }) {
  const path = usePathname();
  // League switcher: only when you're in more than one league. Switching goes through /auth/league, which checks membership.
  const switcher = leagues.length > 1 && (
    <label className="nav-league"><span className="sr-only">League</span>
      <select value={leagueId} onChange={(e) => { window.location.href = `/auth/league?id=${e.target.value}&next=${encodeURIComponent(path.startsWith('/clubhouse/') ? '/clubhouse' : path)}`; }}>
        {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </label>
  );
  return (
    <nav className="nav" aria-label="Keeper HQ">
      <div className="nav-in">
        <Link href="/" className="nav-brand">
          <KeeperMark size={30} tile className="nav-mark" />
          <KeeperWordmark />
        </Link>
        <div className="nav-links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-label={l.label} title={l.label} aria-current={path.startsWith(l.href) ? 'page' : undefined}>
              <Icon name={l.icon} /><span className="nav-label">{l.label}</span><span className="nav-short" aria-hidden="true">{l.short}</span>
            </Link>
          ))}
        </div>
        {switcher}
        <NavSearch />
        <Link href={guest ? '/live' : `/clubhouse/${myTeamId}`} className="nav-me" aria-label={guest ? 'Guest' : 'My club'}>
          {logo && !guest
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logo} alt={shortCode} className="nav-me-logo" />
            : <span>{shortCode}</span>}<em>{guest ? 'Guest' : 'My club'}</em>
        </Link>
        <form action="/auth/signout" method="post" className="nav-out">
          <button type="submit" aria-label="Sign out" title="Sign out"><Icon name="signout" /><span className="nav-label">Sign out</span></button>
        </form>
      </div>
    </nav>
  );
}
