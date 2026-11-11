import Link from 'next/link';
import { LoginForm } from '@/components/LoginForm';
import { KeeperMark, KeeperWordmark } from '@/components/KeeperMark';
import { getMe } from '@/lib/data';
import { getLeagueName, leagueTitle } from '@/lib/league-name';
import styles from './landing.module.css';

export const dynamic = 'force-dynamic';

function OvalLines({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 400 300" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6">
        <ellipse cx="200" cy="150" rx="190" ry="140" /><rect x="160" y="110" width="80" height="80" />
        <circle cx="200" cy="150" r="40" /><circle cx="200" cy="150" r="5" />
        <path d="M10 150 A 90 90 0 0 1 100 60 M10 150 A 90 90 0 0 0 100 240 M390 150 A 90 90 0 0 0 300 60 M390 150 A 90 90 0 0 1 300 240" />
      </g>
    </svg>
  );
}

export default async function Landing({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [me, sp, leagueName] = await Promise.all([getMe(), searchParams, getLeagueName()]);

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <OvalLines className={styles.oval} />
        <div className={styles.brand}>
          <KeeperMark size={56} />
          <KeeperWordmark sub={leagueTitle(leagueName)} />
        </div>
        <h1 className={styles.head}>Keep 18.<br />Draft the rest.<br /><b>Build a dynasty.</b></h1>
        <div className={styles.facts} aria-label="League facts">
          <div><b>10</b><span>Clubs</span></div>
          <div><b>18</b><span>Keepers</span></div>
          <div><b>33</b><span>List spots</span></div>
        </div>
      </section>
      <section className={styles.side}>
        <div className={styles.card}>
          {me ? (
            <>
              <h2>Welcome back, coach</h2>
              <p>You’re signed in.</p>
              <Link href="/live" className={styles.enter}>
                Enter Matchday
                <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10 H15 M11 6 L15 10 L11 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
            </>
          ) : (
            <>
              <h2>Sign in</h2>
              <p>Enter the email your commish added to the {leagueTitle(leagueName)}. We’ll send you a sign-in link.</p>
              <LoginForm linkError={sp.error === 'link'} />
            </>
          )}
          <div className={styles.foot}><span>Home of the G-Train Medal</span><span>Knockout Cup</span><span>Est. 2022</span></div>
        </div>
      </section>
    </main>
  );
}
