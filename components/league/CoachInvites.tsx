'use client';
// League settings › Coaches & invites (commish only): add a coach's email and their club; they sign in at keeperhq.au
// with that email and land in this league. Removing someone takes away their access to this league.
import { useEffect, useState, useTransition } from 'react';
import { listInvites, removeInvite, saveInvite, type InviteRow } from '@/app/(app)/league/settings/actions';

export function CoachInvites({ teams, leagueName }: { teams: { id: number; name: string }[]; leagueName: string }) {
  const [rows, setRows] = useState<InviteRow[] | null>(null);
  const [email, setEmail] = useState('');
  const [team, setTeam] = useState<string>('');
  const [commish, setCommish] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const load = () => start(async () => { const r = await listInvites(); setRows(r.rows); if (!r.ok) setMsg({ ok: false, text: r.error ?? 'Couldn’t load invites.' }); });
  useEffect(load, []);
  const teamName = (id: number | null) => (id == null ? 'No club' : teams.find((t) => t.id === id)?.name ?? `Club ${id}`);
  const taken = new Set((rows ?? []).map((r) => r.team_id).filter((x): x is number => x != null));
  const invite = `You're invited to ${leagueName} on Keeper HQ. Sign in at https://www.keeperhq.au with this email address: we'll send you a login link.`;

  return (
    <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h2 className="h2" style={{ fontSize: 18 }}>Coaches &amp; invites</h2>
        <span className="muted" style={{ fontSize: 13 }}>Only emails on this list can sign in to {leagueName}.</span>
      </div>
      <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
        onSubmit={(e) => { e.preventDefault(); start(async () => {
          const r = await saveInvite(email, team ? Number(team) : null, commish);
          if (!r.ok) { setMsg({ ok: false, text: r.error ?? 'Couldn’t save.' }); return; }
          setMsg({ ok: true, text: `${email.trim().toLowerCase()} can now sign in. Send them the invite below.` }); setEmail(''); setTeam(''); setCommish(false); load();
        }); }}>
        <input className="input" type="email" required placeholder="coach@email.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Coach’s email" style={{ flex: '2 1 220px', minWidth: 0 }} />
        <select className="input" required value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Their club" style={{ flex: '1 1 160px', minWidth: 0 }}>
          <option value="">Pick their club</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{taken.has(t.id) ? ' (has a coach)' : ''}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><input type="checkbox" checked={commish} onChange={(e) => setCommish(e.target.checked)} />Co-commish</label>
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Add coach'}</button>
      </form>
      {msg && <div role="status" style={{ fontSize: 13.5, color: msg.ok ? 'var(--g5)' : 'var(--red-fg)' }}>{msg.text}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, background: 'var(--sunk)', borderRadius: 12, padding: '10px 12px' }}>
        <span style={{ flex: '1 1 260px' }}>{invite}</span>
        <button type="button" className="btn ghost" onClick={() => { navigator.clipboard?.writeText(invite).then(() => setMsg({ ok: true, text: 'Invite message copied.' })).catch(() => {}); }}>Copy invite</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}><th style={{ padding: '6px 4px' }}>Email</th><th>Club</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows == null && <tr><td colSpan={5} className="muted" style={{ padding: 8 }}>Loading…</td></tr>}
            {rows?.map((r) => (
              <tr key={r.email} style={{ borderTop: '1px solid var(--line-soft)' }}>
                <td style={{ padding: '8px 4px', wordBreak: 'break-all' }}>{r.email}</td>
                <td>{teamName(r.team_id)}</td>
                <td>{r.is_commish ? 'Commish' : 'Coach'}</td>
                <td><span style={{ fontSize: 12, fontWeight: 600, color: r.joined ? 'var(--g5)' : 'var(--muted)' }}>{r.joined ? 'Joined' : 'Invited'}</span></td>
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="btn ghost" disabled={pending} style={{ fontSize: 12 }} onClick={() => {
                    if (!window.confirm(`Remove ${r.email} from ${leagueName}? They won’t be able to sign in to it.`)) return;
                    start(async () => { const x = await removeInvite(r.email); setMsg(x.ok ? { ok: true, text: `${r.email} removed.` } : { ok: false, text: x.error ?? 'Couldn’t remove.' }); load(); });
                  }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
