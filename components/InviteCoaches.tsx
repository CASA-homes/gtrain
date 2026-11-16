'use client';
// League settings (commish): the league's invite link/code, reset it, and approve or decline coaches who asked to join.
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';

type Admin = { code: string | null; requests: { id: number; email: string; team_id: number | null; club: string | null; at: string }[]; open: { id: number; name: string }[] };

export function InviteCoaches({ admin }: { admin: Admin }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<number, number>>({});
  const link = admin.code ? `https://keeperhq.au/join/${admin.code}` : '';
  const sb = createClient();
  const act = (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => start(async () => {
    const { error } = await fn();
    setMsg(error ? error.message : ok);
    if (!error) router.refresh();
  });
  return (
    <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, gridColumn: '1 / -1' }}>
      <div className="row-between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <h2 className="h2" style={{ fontSize: 18 }}>Invite coaches</h2>
        {admin.requests.length > 0 && <span className="pill" style={{ background: '#f1e8a8', color: '#5b4a10' }}>{admin.requests.length} waiting</span>}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Share this link (or the code) in your group chat. New coaches sign up, pick their club, and you approve them here.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <code style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--sunk, #f2f3ef)', fontSize: 15, fontWeight: 700, letterSpacing: '.04em' }}>{admin.code ?? '—'}</code>
        <button type="button" className="btn" onClick={() => { navigator.clipboard?.writeText(link).then(() => setMsg('Invite link copied.')); }}>Copy invite link</button>
        <button type="button" className="btn" disabled={pending} onClick={() => { if (confirm('Make a new code? The old link stops working.')) act(() => sb.rpc('join_reset_code'), 'New code made. Share the new link.'); }}>New code</button>
      </div>
      <span className="muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>{link}</span>
      {admin.requests.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {admin.requests.map((r) => (
            <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 12 }}>
              <span style={{ flex: '1 1 220px', fontSize: 14 }}><b>{r.email}</b> <span className="muted">wants {r.club ?? 'a club'}</span></span>
              <select value={pick[r.id] ?? r.team_id ?? ''} onChange={(e) => setPick({ ...pick, [r.id]: Number(e.target.value) })} style={{ padding: '6px 8px', borderRadius: 8 }} aria-label="Club for this coach">
                {r.team_id && !admin.open.some((o) => o.id === r.team_id) && <option value={r.team_id}>{r.club} (taken)</option>}
                {admin.open.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <button type="button" className="btn" disabled={pending} style={{ background: '#2f5d46', color: '#fff', borderColor: '#2f5d46' }}
                onClick={() => act(() => sb.rpc('join_decide', { p_id: r.id, p_approve: true, p_team: pick[r.id] ?? r.team_id }), `${r.email} approved.`)}>Approve</button>
              <button type="button" className="btn" disabled={pending} onClick={() => act(() => sb.rpc('join_decide', { p_id: r.id, p_approve: false }), `${r.email} declined.`)}>Decline</button>
            </div>
          ))}
        </div>
      )}
      {msg && <span role="status" style={{ fontSize: 13 }}>{msg}</span>}
    </section>
  );
}
