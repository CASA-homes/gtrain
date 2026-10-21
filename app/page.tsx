import Link from 'next/link';
import { LoginForm } from '@/components/LoginForm';
import { getMe } from '@/lib/data';
import styles from './landing.module.css';

export const dynamic = 'force-dynamic';

export default async function Landing({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [me, sp] = await Promise.all([getMe(), searchParams]);

  return (
    <main className={styles.hero}>
      <div aria-hidden="true" className={styles.streaks}>
        <i /><i /><i /><i />
      </div>
      <div className={styles.inner}>
        <div className={styles.collage}>
          <div className={styles.glow} aria-hidden="true" />
          {/* eslint-disable @next/next/no-img-element */}
          <img src="/landing/player2.png" alt="" className={styles.p2} />
          <img src="/landing/player1.png" alt="Fraser Gehrig" className={styles.p1} />
          <img src="/landing/player3.png" alt="" className={styles.p3} />
          <img src="/landing/player4.png" alt="" className={styles.p4} />
        </div>
        <div className={styles.copy}>
          <div className={styles.mark}>
            <span>GT</span>
            <i aria-hidden="true" />
            <small>Est. 2022<br />10 coaches</small>
          </div>
          <h1 className={styles.lockup}>
            <span>G-Train</span>
            <span>Fantasy</span>
            <span>Keeper</span>
          </h1>
          {me ? (
            <Link href="/clubhouse" className={styles.enter}>
              Enter the clubhouse
              <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10 H15 M11 6 L15 10 L11 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Link>
          ) : (
            <LoginForm linkError={sp.error === 'link'} />
          )}
        </div>
      </div>
    </main>
  );
}
