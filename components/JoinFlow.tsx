'use client';
// Join a league by invite code: sign up (email, password, emailed 6-digit code) or log in, pick your club, then wait for
// the commish to approve.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Club = { id: number; name: string; short_code: string; coach: string | null; open: boolean };
type Step = 'account' | 'code' | 'club' | 'done';

export function JoinFlow({ code, league, clubs, signedIn, status }: {
  code: string; league: string; clubs: Club[]; signedIn: boolean; status: 'member' | 'pending' | null;
}) {
  const [step, setStep] = useState<Step>(status ? 'done' : signedIn ? 'club' : 'account');
  const [done, setDone] = useState<'member' | 'pending' | null>(status);
  const [have, setHave] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [otp, setOtp] = useState('');
  const [team, setTeam] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sb = createClient();

  const account = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    const clean = email.trim().toLowerCase();
    if (have) {
      setBusy(true);
      const { error } = await sb.auth.signInWithPassword({ email: clean, password: pw });
      setBusy(false);
      if (error) return setErr('Wrong email or password. New here? Choose “I’m new”.');
      return setStep('club');
    }
    if (pw.length < 8) return setErr('Use at least 8 characters for your password.');
    if (pw !== pw2) return setErr('The two passwords don’t match.');
    setBusy(true);
    const { error } = await sb.auth.signInWithOtp({ email: clean, options: { emailRedirectTo: `${window.location.origin}/join/${code}` } });
    setBusy(false);
    if (error) return setErr(error.message);
    setStep('code');
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    const token = otp.replace(/\D/g, '');
    if (token.length < 6) return;
    setBusy(true);
    const { error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'email' });
    if (error) { setBusy(false); return setErr('That code didn’t work. Check it, or go back and send a fresh one.'); }
    const { error: pwErr } = await sb.auth.updateUser({ password: pw, data: name.trim() ? { full_name: name.trim() } : undefined });
    setBusy(false);
    if (pwErr) setErr(`Signed in, but your password didn’t save (${pwErr.message}). You can set it later from the lock icon.`);
    setStep('club');
  };

  const claim = async () => {
    if (!team) return;
    setBusy(true); setErr(null);
    const { data, error } = await sb.rpc('join_request', { p_code: code, p_team: team });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone(data === 'member' ? 'member' : 'pending'); setStep('done');
  };

  const open = clubs.filter((c) => c.open);
  return (
    <div className="lg" style={{ maxWidth: 440 }}>
      <div>
        <span className="kl-eyebrow" style={{ display: 'block' }}>Join a league</span>
        <h1 style={{ font: '800 32px/1.05 var(--display, inherit)', textTransform: 'uppercase', margin: '4px 0 0' }}>{league}</h1>
      </div>

      {step === 'account' && (
        <form onSubmit={account} className="lg" style={{ gap: 8 }}>
          <div className="lg-tabs" role="tablist" aria-label="New or existing account">
            <button type="button" role="tab" aria-selected={!have} onClick={() => { setHave(false); setErr(null); }}>I’m new</button>
            <button type="button" role="tab" aria-selected={have} onClick={() => { setHave(true); setErr(null); }}>I have an account</button>
          </div>
          {!have && (<>
            <label className="lg-lab" htmlFor="j-nm">Your name</label>
            <input id="j-nm" className="lg-in" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" />
          </>)}
          <label className="lg-lab" htmlFor="j-em">Email</label>
          <input id="j-em" className="lg-in" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
          <label className="lg-lab" htmlFor="j-pw">{have ? 'Password' : 'Choose a password'}</label>
          <input id="j-pw" className="lg-in" type="password" autoComplete={have ? 'current-password' : 'new-password'} required value={pw} onChange={(e) => setPw(e.target.value)} />
          {!have && (<>
            <label className="lg-lab" htmlFor="j-pw2">Type it again</label>
            <input id="j-pw2" className="lg-in" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </>)}
          <button type="submit" className="lg-btn" disabled={busy}><i aria-hidden="true" />{busy ? 'One moment…' : have ? 'Log in' : 'Email me a code'}</button>
          {err ? <span role="status" className="lg-err">{err}</span> : <span className="lg-note">{have ? 'Then pick your club.' : 'We’ll email a 6-digit code to confirm it’s you, then you pick your club.'}</span>}
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verify} className="lg" style={{ gap: 8 }}>
          <div className="lg-ok"><i aria-hidden="true">✓</i><span><b>Check your inbox.</b> Enter the 6-digit code we sent to {email.trim().toLowerCase()}.</span></div>
          <div className="lg-row">
            <input className="lg-in lg-mono" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" autoFocus aria-label="6-digit code" />
            <button type="submit" className="lg-btn" disabled={busy}>{busy ? 'Checking…' : 'Next'}</button>
          </div>
          {err && <span role="status" className="lg-err">{err}</span>}
          <button type="button" className="lg-alt" onClick={() => { setStep('account'); setErr(null); }}>Wrong email? Go back</button>
        </form>
      )}

      {step === 'club' && (
        <div className="lg" style={{ gap: 8 }}>
          <span className="lg-lab">Which club is yours?</span>
          {open.length === 0 && <span className="lg-note">Every club already has a coach. Ask your commish to free one up.</span>}
          <div className="jn-clubs" role="radiogroup" aria-label="Your club">
            {open.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={team === c.id} className={team === c.id ? 'on' : undefined} onClick={() => setTeam(c.id)}>
                <b>{c.name}</b>{c.coach && <span>{c.coach}</span>}
              </button>
            ))}
          </div>
          <button type="button" className="lg-btn" disabled={!team || busy} onClick={claim}><i aria-hidden="true" />{busy ? 'Sending…' : 'Ask to join'}</button>
          {err && <span role="status" className="lg-err">{err}</span>}
          <span className="lg-note">Your commish approves it, then you’re in.</span>
        </div>
      )}

      {step === 'done' && (
        done === 'member'
          ? <div className="lg"><div className="lg-ok"><i aria-hidden="true">✓</i><span><b>You’re in {league}.</b></span></div><a className="lg-btn" href="/clubhouse"><i aria-hidden="true" />Go to your clubhouse</a></div>
          : <div className="lg"><div className="lg-ok"><i aria-hidden="true">✓</i><span><b>Request sent.</b> Your commish will approve you shortly. Come back to keeperhq.au and log in once they have.</span></div></div>
      )}
    </div>
  );
}
