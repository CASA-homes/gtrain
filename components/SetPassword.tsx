'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function SetPassword() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'ok' } | { kind: 'error'; msg: string }>({ kind: 'idle' });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setState({ kind: 'error', msg: 'Use at least 8 characters.' });
    if (pw !== pw2) return setState({ kind: 'error', msg: 'The two passwords don’t match.' });
    setState({ kind: 'saving' });
    const { error } = await createClient().auth.updateUser({ password: pw });
    if (error) return setState({ kind: 'error', msg: error.message });
    setPw(''); setPw2(''); setState({ kind: 'ok' });
  };
  return (
    <form onSubmit={save} style={{ display: 'grid', gap: 8 }}>
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>New password
        <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', font: 'inherit' }} />
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Type it again
        <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', font: 'inherit' }} />
      </label>
      <button type="submit" className="btn" disabled={state.kind === 'saving'} style={{ justifySelf: 'start' }}>{state.kind === 'saving' ? 'Saving…' : 'Save password'}</button>
      <span role="status" style={{ fontSize: 13, color: state.kind === 'error' ? '#b5462a' : state.kind === 'ok' ? '#1f6b3a' : 'transparent' }}>
        {state.kind === 'error' ? state.msg : state.kind === 'ok' ? 'Saved. Next time, choose “Sign in with a password” on the login screen.' : '.'}
      </span>
    </form>
  );
}
