'use client';
// Header settings cog: theme, profile, this league, switch league, join another league.
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { switchLeague } from '@/app/actions/league';

export type MyLeague = { id: number; name: string; is_commish: boolean };

export function NavSettings({ leagues, current }: { leagues: MyLeague[]; current: number }) {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [code, setCode] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setDark(document.documentElement.classList.contains('theme-dark')); }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const setTheme = (d: boolean) => {
    setDark(d);
    document.documentElement.classList.toggle('theme-dark', d);
    try { localStorage.setItem('khq_theme', d ? 'dark' : 'light'); } catch { /* private mode */ }
  };
  const here = leagues.find((l) => l.id === current);
  return (
    <div className="nset" ref={ref}>
      <button type="button" className="nset-btn" aria-label="Settings" title="Settings" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
      </button>
      {open && (
        <div className="nset-menu" role="menu">
          <div className="nset-sec">
            <span className="nset-h">Theme</span>
            <div className="nset-seg" role="radiogroup" aria-label="Theme">
              <button type="button" role="radio" aria-checked={!dark} className={!dark ? 'on' : ''} onClick={() => setTheme(false)}>Light</button>
              <button type="button" role="radio" aria-checked={dark} className={dark ? 'on' : ''} onClick={() => setTheme(true)}>Dark</button>
            </div>
          </div>
          <div className="nset-sec">
            <Link href="/account" className="nset-row" onClick={() => setOpen(false)}><b>Profile</b><span>Email and password</span></Link>
            <Link href="/league" className="nset-row" onClick={() => setOpen(false)}><b>My league</b><span>{here?.name ?? 'League'}{here?.is_commish ? ' · commish' : ''}</span></Link>
            {here?.is_commish && <Link href="/league/settings" className="nset-row" onClick={() => setOpen(false)}><b>League settings</b><span>Invite coaches, rules</span></Link>}
          </div>
          {leagues.length > 1 && (
            <div className="nset-sec">
              <span className="nset-h">Switch league</span>
              {leagues.map((l) => (
                <button key={l.id} type="button" className={`nset-row${l.id === current ? ' cur' : ''}`} disabled={pending || l.id === current}
                  onClick={() => start(async () => { const r = await switchLeague(l.id); if (r.ok) { setOpen(false); router.push('/clubhouse'); router.refresh(); } })}>
                  <b>{l.name}</b><span>{l.id === current ? 'Viewing now' : 'Switch'}</span>
                </button>
              ))}
            </div>
          )}
          <form className="nset-sec nset-join" onSubmit={(e) => { e.preventDefault(); const c = code.trim().toUpperCase(); if (c) { setOpen(false); router.push(`/join/${encodeURIComponent(c)}`); } }}>
            <span className="nset-h">Join another league</span>
            <div><input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="League code" autoCapitalize="characters" aria-label="League code" /><button className="btn dark" disabled={!code.trim()}>Join</button></div>
          </form>
          <a href="/start" className="nset-sec nset-row" onClick={() => setOpen(false)}><b>Start a new league</b><span /></a>
          <form action="/auth/signout" method="post" className="nset-sec">
            <button type="submit" className="nset-row"><b>Sign out</b><span /></button>
          </form>
        </div>
      )}
    </div>
  );
}
