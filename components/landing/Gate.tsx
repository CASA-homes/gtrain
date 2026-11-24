'use client';
// Sign-in page actions for someone who isn't signed in: Start your league / Log in.
// "Start your league" makes an account (no invite needed) and goes on to /start.
import { useEffect, useState } from 'react';
import { LoginForm } from '@/components/LoginForm';

type Pane = 'choose' | 'login' | 'signup' | 'start';

const legal = (
  <p className="kl-note" style={{ marginTop: 14, fontSize: 12, opacity: 0.8 }}>
    <a href="/terms" className="kl-link">Terms</a> · <a href="/privacy" className="kl-link">Privacy</a>
  </p>
);

export function Gate({ linkError, start = false }: { linkError: boolean; start?: boolean }) {
  const [pane, setPane] = useState<Pane>(linkError ? 'login' : start ? 'start' : 'choose');
  // The header's Log in / Start a league buttons switch panes too.
  useEffect(() => {
    const on = (e: Event) => setPane((e as CustomEvent<Pane>).detail);
    window.addEventListener('kl-gate', on);
    return () => window.removeEventListener('kl-gate', on);
  }, []);
  const back = <button type="button" className="kl-link" onClick={() => setPane('choose')}>← Back</button>;
  if (pane === 'login' || pane === 'signup') return <div className="kl-gate"><LoginForm key={pane} linkError={linkError} initialMode={pane === 'signup' ? 'signup' : 'login'} /><p className="kl-note">{back}</p>{legal}</div>;
  if (pane === 'start') return (
    <div className="kl-gate">
      <p className="kl-note" style={{ margin: '0 0 10px' }}><b>Start your league.</b> Make an account, name your league and clubs, then invite your coaches. It takes about two minutes.</p>
      <LoginForm founder next="/start" initialMode="signup" />
      <p className="kl-note">{back}</p>
      {legal}
    </div>
  );
  return (
    <div className="kl-gate choose">
      <div className="kl-two">
        <button type="button" className="kl-btn" onClick={() => setPane('start')}><i />Start your league</button>
        <button type="button" className="kl-btn ghost" onClick={() => setPane('login')}>Log in</button>
      </div>
      <p className="kl-note">Got an invite from your commish? <button type="button" className="kl-link" onClick={() => setPane('signup')}>Sign up</button> with that email to set your password.</p>
      {legal}
    </div>
  );
}

export function GateLink({ to, className, children }: { to: Pane; className?: string; children: React.ReactNode }) {
  return <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent('kl-gate', { detail: to }))}>{children}</button>;
}
