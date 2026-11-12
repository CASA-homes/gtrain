'use client';
// Sign-in page actions for someone who isn't signed in: Start your league / Log in.
// Start your league: sign up with any email, then the setup wizard (/setup) creates the league and makes you commish.
import { useEffect, useState } from 'react';
import { LoginForm } from '@/components/LoginForm';

type Pane = 'choose' | 'login' | 'start';

export function Gate({ linkError, signedIn = false }: { linkError: boolean; signedIn?: boolean }) {
  const [pane, setPane] = useState<Pane>(linkError ? 'login' : 'choose');
  // The header's Log in / Start a league buttons switch panes too.
  useEffect(() => {
    const on = (e: Event) => setPane((e as CustomEvent<Pane>).detail);
    window.addEventListener('kl-gate', on);
    return () => window.removeEventListener('kl-gate', on);
  }, []);
  const back = <button type="button" className="kl-link" onClick={() => setPane('choose')}>← Back</button>;
  if (pane === 'login') return <div className="kl-gate"><LoginForm linkError={linkError} /><p className="kl-note">{back}</p></div>;
  if (pane === 'start' && signedIn) return (
    <div className="kl-gate">
      <a href="/setup" className="kl-btn"><i />Set up your league</a>
      <p className="kl-note">You’re signed in. Set up the league, add the clubs and invite your coaches. {back}</p>
    </div>
  );
  if (pane === 'start') return (
    <div className="kl-gate">
      <p className="kl-note" style={{ marginTop: 0 }}><b>Start your league.</b> Enter your email and we’ll send a sign-in link. Then you set up the league, add the clubs and invite your coaches. You’ll be the commish.</p>
      <LoginForm mode="start" />
      <p className="kl-note">{back} · Already in a league? <button type="button" className="kl-link" onClick={() => setPane('login')}>Log in</button></p>
    </div>
  );
  return (
    <div className="kl-gate">
      <div className="kl-two">
        <button type="button" className="kl-btn" onClick={() => setPane('start')}><i />Start your league</button>
        <button type="button" className="kl-btn ghost" onClick={() => setPane('login')}>Log in</button>
      </div>
      <p className="kl-note">Got an invite from your commish? Log in with that email. No password needed.</p>
    </div>
  );
}

export function GateLink({ to, className, children }: { to: Pane; className?: string; children: React.ReactNode }) {
  return <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent('kl-gate', { detail: to }))}>{children}</button>;
}
