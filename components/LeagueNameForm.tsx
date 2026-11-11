'use client';
import { useState, useTransition } from 'react';
import { setLeagueName } from '@/app/(app)/league/settings/actions';
import { leagueTitle } from '@/lib/league-title';

export function LeagueNameForm({ name, isCommish }: { name: string; isCommish: boolean }) {
  const [value, setValue] = useState(name);
  const [saved, setSaved] = useState(name);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = value.trim() !== saved;

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await setLeagueName(value);
      if (r.ok) { setSaved(value.trim()); setMsg({ ok: true, text: 'Saved. The new name shows across the site.' }); }
      else setMsg({ ok: false, text: r.error ?? 'Could not save.' });
    });
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
      <h2 className="h2" style={{ fontSize: 18 }}>League name</h2>
      {isCommish ? (
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label htmlFor="league-name" className="muted" style={{ fontSize: 13 }}>Shown as “{leagueTitle(value || saved)}” on the League page and the sign-in page.</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="league-name" className="input" style={{ flex: '1 1 auto', minWidth: 0 }} value={value} maxLength={40} onChange={(e) => { setValue(e.target.value); setMsg(null); }} />
            <button type="submit" className="btn dark" disabled={!dirty || pending}>{pending ? 'Saving…' : 'Save'}</button>
          </div>
          {msg && <span role="status" style={{ fontSize: 13, color: msg.ok ? 'var(--g5)' : 'var(--red-fg)' }}>{msg.text}</span>}
        </form>
      ) : (
        <p style={{ margin: 0 }}><b>{leagueTitle(saved)}</b> <span className="muted" style={{ fontSize: 13 }}>· the commish can change this</span></p>
      )}
    </section>
  );
}
