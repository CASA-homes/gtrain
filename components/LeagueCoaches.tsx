// League settings (commish): every coach in the league, their club, and when they last signed in. Invited emails that
// haven't signed in yet are listed too.
type Row = { team_id: number | null; club: string | null; email: string; name: string | null; is_commish: boolean; joined_at: string | null; last_sign_in: string | null; status: 'member' | 'invited' };

const when = (iso: string | null) => {
  if (!iso) return 'Never';
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (d < 1) return 'Today';
  if (d < 2) return 'Yesterday';
  if (d < 14) return `${Math.floor(d)} days ago`;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Perth' });
};

export function LeagueCoaches({ rows, clubs }: { rows: Row[]; clubs: { id: number; name: string }[] }) {
  const coached = new Set(rows.filter((r) => r.status === 'member' && r.team_id).map((r) => r.team_id));
  const open = clubs.filter((c) => !coached.has(c.id));
  return (
    <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, gridColumn: '1 / -1' }}>
      <div className="row-between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <h2 className="h2" style={{ fontSize: 18 }}>Coaches</h2>
        <span className="muted" style={{ fontSize: 12 }}>{coached.size} of {clubs.length} clubs have a coach signed in{open.length ? ` · open: ${open.map((c) => c.name).join(', ')}` : ''}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="lc-table">
          <thead><tr><th>Club</th><th>Coach</th><th>Email</th><th>Joined</th><th>Last sign-in</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.status}${r.email}`} className={r.status === 'invited' ? 'inv' : undefined}>
                <td><b>{r.club ?? 'No club'}</b>{r.is_commish && <span className="lc-tag">Commish</span>}</td>
                <td>{r.name ?? <span className="muted">–</span>}</td>
                <td className="muted">{r.email}</td>
                <td className="muted">{r.status === 'invited' ? 'Invited, not signed in' : when(r.joined_at)}</td>
                <td>{r.status === 'invited' ? <span className="muted">–</span> : when(r.last_sign_in)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>Coaches who signed in with an emailed link can set a password any time from the settings cog › Profile.</p>
    </section>
  );
}
