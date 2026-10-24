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
    if (!allowed) return setState({ kind: 'error', message: 'That email isn’t on the G-Train list. Ask the commish to add it.' });
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
      <div style={{ width: 'min(380px, 100%)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ font: '600 16px var(--font)' }}>Check your inbox</span>
        <span style={{ color: 'rgb(244 241 230 / .75)', fontSize: 14 }}>
          We sent a sign-in email to {state.email}. Tap the link, or type the 6-digit code from it here.
        </span>
        <form onSubmit={verify} style={{ display: 'flex', gap: 8 }}>
          <label htmlFor="code" className="sr-only">6-digit code</label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456"
            style={{ flex: '1 1 auto', minWidth: 0, minHeight: 48, borderRadius: 99, border: '1px solid rgb(244 241 230 / .3)', background: 'rgb(244 241 230 / .08)', color: 'var(--cream)', padding: '0 18px', font: '500 18px var(--mono)', letterSpacing: '.2em', textAlign: 'center' }} />
          <button type="submit" disabled={state.checking}
            style={{ minHeight: 48, borderRadius: 99, border: 0, background: 'var(--cream)', color: 'var(--ink)', padding: '0 22px', font: '600 15px var(--font)', whiteSpace: 'nowrap' }}>
            {state.checking ? 'Checking…' : 'Sign in'}
          </button>
        </form>
        {state.codeError && <span role="status" style={{ fontSize: 13, color: '#f3c2b9' }}>{state.codeError}</span>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ width: 'min(380px, 100%)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label htmlFor="email" className="sr-only">Email</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          id="email" type="email" autoComplete="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com"
          style={{ flex: '1 1 auto', minWidth: 0, minHeight: 48, borderRadius: 99, border: '1px solid rgb(244 241 230 / .3)', background: 'rgb(244 241 230 / .08)', color: 'var(--cream)', padding: '0 18px', font: '400 15px var(--font)' }}
        />
        <button type="submit" disabled={state.kind === 'sending'}
          style={{ minHeight: 48, borderRadius: 99, border: 0, background: 'var(--cream)', color: 'var(--ink)', padding: '0 22px', font: '600 15px var(--font)', whiteSpace: 'nowrap' }}>
          {state.kind === 'sending' ? 'Sending…' : 'Send link'}
        </button>
      </div>
      <span role="status" style={{ fontSize: 13, color: state.kind === 'error' ? '#f3c2b9' : 'rgb(244 241 230 / .65)', textAlign: 'center' }}>
        {state.kind === 'error' ? state.message : 'Coaches only. We’ll email you a one-tap sign-in link.'}
      </span>
    </form>
  );
}
