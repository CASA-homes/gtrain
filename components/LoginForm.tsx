'use client';
// Log in (password, or an emailed link/code) and Sign up (choose a password, confirm with the 6-digit code we email).
// Every coach is pre-added by their commish, so "sign up" means: prove you own the email, then set your password.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Mode = 'login' | 'signup';
type State =
  | { kind: 'idle' } | { kind: 'sending' }
  | { kind: 'sent'; email: string; codeError?: string; checking?: boolean }
  | { kind: 'error'; message: string };

/** founder: someone starting their own league. No league code or invite needed; after signing in they go to `next`. */
export function LoginForm({ linkError, initialMode = 'login', founder = false, next = '/clubhouse' }: { linkError?: boolean; initialMode?: Mode; founder?: boolean; next?: string }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [usePw, setUsePw] = useState(true);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [code, setCode] = useState('');
  const [league, setLeague] = useState('');
  const [state, setState] = useState<State>(linkError
    ? { kind: 'error', message: 'That link has expired or was already used. Enter your email for a fresh one.' }
    : { kind: 'idle' });

  const switchMode = (m: Mode) => { setMode(m); setState({ kind: 'idle' }); setCode(''); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    if (mode === 'signup') {
      if (pw.length < 8) return setState({ kind: 'error', message: 'Use at least 8 characters for your password.' });
      if (pw !== pw2) return setState({ kind: 'error', message: 'The two passwords don’t match.' });
    }
    setState({ kind: 'sending' });
    const supabase = createClient();
    const lc = league.trim().toUpperCase();
    if (founder) {
      // Starting a league: anyone can make an account.
    } else if (mode === 'signup' && lc) {
      const { data: lk } = await supabase.rpc('join_lookup', { p_code: lc });
      if (!lk) return setState({ kind: 'error', message: 'That league code isn’t right. Check it with your commish.' });
    } else {
      const { data: allowed, error: checkErr } = await supabase.rpc('email_is_allowed', { check_email: clean });
      if (checkErr) return setState({ kind: 'error', message: 'Could not reach the league server. Try again in a minute.' });
      if (!allowed) return setState({ kind: 'error', message: mode === 'signup' ? 'Enter the league code your commish sent you.' : 'That email isn’t in a league yet. Tap Sign up and enter your league code.' });
    }
    if (mode === 'login' && usePw) {
      const { error } = await supabase.auth.signInWithPassword({ email: clean, password: pw });
      if (error) return setState({ kind: 'error', message: 'Wrong email or password. No password yet? Tap Sign up to create one.' });
      window.location.href = next;
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ email: clean, options: { emailRedirectTo: `${window.location.origin}/auth/callback${next !== '/clubhouse' ? `?next=${encodeURIComponent(next)}` : ''}` } });
    if (error) return setState({ kind: 'error', message: error.message });
    setState({ kind: 'sent', email: clean });
  }

  // The code works anywhere, including the home-screen app on iPhone, which keeps its own sign-in separate from Safari.
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind !== 'sent') return;
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return;
    setState({ ...state, checking: true, codeError: undefined });
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email: state.email, token, type: 'email' });
    if (error) return setState({ ...state, checking: false, codeError: 'That code didn’t work. Check it, or send a fresh email.' });
    if (mode === 'signup') {
      const { error: pwErr } = await supabase.auth.updateUser({ password: pw });
      if (pwErr) return setState({ ...state, checking: false, codeError: `You’re signed in, but the password didn’t save: ${pwErr.message}. Set it from the lock icon.` });
      if (!founder && league.trim()) { window.location.href = `/join/${encodeURIComponent(league.trim().toUpperCase())}`; return; }
    }
    window.location.href = next;
  }

  const tabs = (
    <div className="lg-tabs" role="tablist" aria-label="Log in or sign up">
      <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchMode('login')}>Log in</button>
      <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => switchMode('signup')}>Sign up</button>
    </div>
  );

  if (state.kind === 'sent') {
    return (
      <div className="lg">
        {tabs}
        <div className="lg-ok"><i aria-hidden="true">✓</i><span><b>Check your inbox.</b> We sent a 6-digit code to {state.email}.{mode === 'signup' ? ' Enter it here to finish setting your password.' : ' Enter it here, or tap the link in the email on this device.'}</span></div>
        <form onSubmit={verify} className="lg-row">
          <label htmlFor="code" className="sr-only">6-digit code</label>
          <input id="code" className="lg-in lg-mono" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus />
          <button type="submit" className="lg-btn" disabled={state.checking}>{state.checking ? 'Checking…' : mode === 'signup' ? 'Finish' : 'Sign in'}</button>
        </form>
        {state.codeError && <span role="status" className="lg-err">{state.codeError}</span>}
        <button type="button" className="lg-alt" onClick={() => setState({ kind: 'idle' })}>Wrong email? Start again</button>
      </div>
    );
  }

  const sending = state.kind === 'sending';
  return (
    <form onSubmit={submit} className="lg">
      {tabs}
      <label htmlFor="email" className="lg-lab">Email</label>
      <input id="email" className="lg-in" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
      {(mode === 'signup' || usePw) && (
        <>
          <label htmlFor="pw" className="lg-lab">{mode === 'signup' ? 'Choose a password' : 'Password'}</label>
          <input id="pw" className="lg-in" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : undefined} value={pw} onChange={(e) => setPw(e.target.value)} />
        </>
      )}
      {mode === 'signup' && (
        <>
          <label htmlFor="pw2" className="lg-lab">Type it again</label>
          <input id="pw2" className="lg-in" type="password" autoComplete="new-password" required minLength={8} value={pw2} onChange={(e) => setPw2(e.target.value)} />
          {!founder && <>
            <label htmlFor="lc" className="lg-lab">League code</label>
            <input id="lc" className="lg-in lg-mono" autoCapitalize="characters" autoComplete="off" value={league} onChange={(e) => setLeague(e.target.value)} placeholder="e.g. GTRAIN-4KX9 (from your commish)" />
          </>}
        </>
      )}
      <button type="submit" className="lg-btn" disabled={sending}><i aria-hidden="true" />
        {sending ? 'One moment…' : mode === 'signup' ? 'Email me a code' : usePw ? 'Log in' : 'Email me a sign-in link'}
      </button>
      {mode === 'signup' && (
        <span className="lg-note" style={{ fontSize: 12 }}>
          By signing up you agree to the <a href="/terms" target="_blank" rel="noopener">Terms of Use</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
        </span>
      )}
      {mode === 'login' && <button type="button" className="lg-alt" onClick={() => { setUsePw(!usePw); setState({ kind: 'idle' }); }}>{usePw ? 'No password? Email me a sign-in link' : 'Log in with a password'}</button>}
      <span role="status" className={state.kind === 'error' ? 'lg-err' : 'lg-note'}>
        {state.kind === 'error' ? state.message
          : founder ? (mode === 'signup' ? 'We’ll email a 6-digit code to confirm it’s you, then you’ll set up your league.' : 'Log in and we’ll take you to league setup.')
          : mode === 'signup' ? 'Enter the league code from your commish (not needed if they added your email). We’ll email a 6-digit code to confirm it’s you.'
          : 'New here? Tap Sign up to create your password.'}
      </span>
    </form>
  );
}
