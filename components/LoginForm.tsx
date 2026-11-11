'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; email: string; codeError?: string; checking?: boolean } | { kind: 'error'; message: string };

export function LoginForm({ linkError }: { linkError?: boolean }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [state, setState] = useState<State>(linkError
    ? { kind: 'error', message: 'That link has expired or was already used. Enter your email for a fresh one.' }
    : { kind: 'idle' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    setState({ kind: 'sending' });
    const supabase = createClient();
    const { data: allowed, error: checkErr } = await supabase.rpc('email_is_allowed', { check_email: clean });
    if (checkErr) return setState({ kind: 'error', message: 'Could not reach the league server. Try again in a minute.' });
    if (!allowed) return setState({ kind: 'error', message: 'That email isn’t on the league list. Ask the commish to add it.' });
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) return setState({ kind: 'error', message: error.message });
    setState({ kind: 'sent', email: clean });
  }

  // A code works anywhere, including the home-screen app on iPhone, which keeps its own sign-in separate from Safari.
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind !== 'sent') return;
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return;
    setState({ ...state, checking: true, codeError: undefined });
    const { error } = await createClient().auth.verifyOtp({ email: state.email, token, type: 'email' });
    if (error) return setState({ ...state, checking: false, codeError: 'That code didn’t work. Check it, or send a fresh email.' });
    window.location.href = '/clubhouse';
  }

  if (state.kind === 'sent') {
    return (
      <div className="lg">
        <div className="lg-ok"><i aria-hidden="true">✓</i><span><b>Check your inbox.</b> We sent a sign-in link to {state.email}. Tap it on this device.</span></div>
        <details className="lg-code">
          <summary>Email has a 6-digit code?</summary>
          <form onSubmit={verify} className="lg-row">
            <label htmlFor="code" className="sr-only">6-digit code</label>
            <input id="code" className="lg-in lg-mono" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
            <button type="submit" className="lg-btn" disabled={state.checking}>{state.checking ? 'Checking…' : 'Sign in'}</button>
          </form>
        </details>
        {state.codeError && <span role="status" className="lg-err">{state.codeError}</span>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="lg">
      <label htmlFor="email" className="lg-lab">Email</label>
      <input id="email" className="lg-in" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
      <button type="submit" className="lg-btn" disabled={state.kind === 'sending'}><i aria-hidden="true" />{state.kind === 'sending' ? 'Sending…' : 'Send sign-in link'}</button>
      <span role="status" className={state.kind === 'error' ? 'lg-err' : 'lg-note'}>
        {state.kind === 'error' ? state.message : 'No password needed. New coach? Ask your commish for an invite.'}
      </span>
    </form>
  );
}
