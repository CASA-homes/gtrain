'use client';
// Sign-in page actions for someone who isn't signed in: Start your league / Log in.
// New leagues can't be created yet, so "Start your league" explains that rather than showing a form that does nothing.
import { useEffect, useState } from 'react';
import { LoginForm } from '@/components/LoginForm';

type Pane = 'choose' | 'login' | 'start';

export function Gate({ linkError }: { linkError: boolean }) {
  const [pane, setPane] = useState<Pane>(linkError ? 'login' : 'choose');
  // The header's Log in / Start a league buttons switch panes too.
  useEffect(() => {
    const on = (e: Event) => setPane((e as CustomEvent<Pane>).detail);
    window.addEventListener('kl-gate', on);
    return () => window.removeEventListener('kl-gate', on);
  }, []);
  const back = <button type="button" className="kl-link" onClick={() => setPane('choose')}>← Back</button>;
  if (pane === 'login') return <div className="kl-gate"><LoginForm linkError={linkError} /><p className="kl-note">{back}</p></div>;
  if (pane === 'start') return (
    <div className="kl-gate">
      <div className="kl-soon"><b>New leagues are coming soon.</b> Keeper HQ is invite-only for now. If your league is already here, ask your commish to add your email, then log in.</div>
      <p className="kl-note">{back} · <button type="button" className="kl-link" onClick={() => setPane('login')}>Log in</button></p>
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
