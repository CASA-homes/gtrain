'use client';
// Email sign-in landing page. The email button opens this page, and it only signs in once the person taps the button.
// Email scanners (Outlook Safe Links and others) open links automatically but never click, so they can't use up the code.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type EmailOtpType = 'email' | 'signup' | 'magiclink' | 'recovery' | 'invite' | 'email_change';
const TYPES: EmailOtpType[] = ['email', 'signup', 'magiclink', 'recovery', 'invite', 'email_change'];

/** Pull ?next= out of the redirect address we gave Supabase, keeping it on this site. */
function nextFrom(redirectTo: string | null): string {
  if (!redirectTo) return '/clubhouse';
  try {
    const n = new URL(redirectTo, window.location.origin).searchParams.get('next') ?? '';
    return /^\/[A-Za-z0-9/_-]*$/.test(n) && !n.startsWith('//') ? n : '/clubhouse';
  } catch {
    return '/clubhouse';
  }
}

export default function ConfirmPage() {
  const [params, setParams] = useState<{ hash: string; type: EmailOtpType; next: string } | null>(null);
  const [state, setState] = useState<'ready' | 'busy' | 'error' | 'missing'>('ready');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const hash = q.get('token_hash');
    const t = (q.get('type') ?? 'email') as EmailOtpType;
    if (!hash) return setState('missing');
    setParams({ hash, type: TYPES.includes(t) ? t : 'email', next: nextFrom(q.get('redirect_to')) });
  }, []);

  async function go() {
    if (!params) return;
    setState('busy');
    const { error } = await createClient().auth.verifyOtp({ token_hash: params.hash, type: params.type });
    if (error) return setState('error');
    window.location.href = params.next;
  }

  const dead = state === 'error' || state === 'missing';
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#f3f4ef' }}>
      <div style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 16, padding: '28px 24px', boxShadow: '0 1px 3px rgba(0,0,0,.06)', textAlign: 'center' }}>
        <div style={{ fontWeight: 800, letterSpacing: '.02em', fontSize: 15 }}>KEEPER<span style={{ color: '#b08d4a' }}>HQ</span></div>
        <h1 style={{ fontSize: 22, margin: '18px 0 8px', color: '#1f2a24' }}>{dead ? 'This link has expired' : 'Sign in to Keeper HQ'}</h1>
        <p style={{ fontSize: 14, color: '#5d6b62', margin: '0 0 20px', lineHeight: 1.5 }}>
          {dead
            ? 'It was already used or is too old. Use the 6-digit code from the same email, or go back and request a new one.'
            : 'Tap below to finish signing in on this device.'}
        </p>
        {dead ? (
          <a href="/" style={{ display: 'block', padding: '12px 16px', borderRadius: 10, background: '#2f5a43', color: '#fff', fontWeight: 700, textDecoration: 'none' }}>Back to Keeper HQ</a>
        ) : (
          <button onClick={go} disabled={!params || state === 'busy'}
            style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: 0, background: '#2f5a43', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: !params || state === 'busy' ? 0.6 : 1 }}>
            {state === 'busy' ? 'Signing in…' : 'Sign in'}
          </button>
        )}
      </div>
    </main>
  );
}
