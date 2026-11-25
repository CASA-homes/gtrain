import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSiteAdmin, PRO_PER_COACH } from '@/lib/plan';
import { setLeaguePlan } from './actions';

export const metadata = { title: 'League plans' };
export const dynamic = 'force-dynamic';

type Row = { league_id: number; name: string; created_at: string; coaches: number; plan: 'free' | 'pro'; founding: boolean; pro_until: string | null; is_pro: boolean; note: string | null };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Perth' });
const ymd = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600e3).toISOString().slice(0, 10);

/** Site admin only: every league on Keeper HQ and its plan, with a Free / Pro switch. */
export default async function LeaguePlansPage() {
  if (!(await isSiteAdmin())) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_league_plans');
  const rows = (data ?? []) as Row[];
  const pro = rows.filter((r) => r.is_pro);
  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="eyebrow">Site admin</span>
        <h1 className="h1" style={{ margin: 0 }}>League plans</h1>
        <p className="muted" style={{ margin: 0 }}>
          {rows.length} league{rows.length === 1 ? '' : 's'} · {pro.length} on Pro ({pro.filter((r) => r.founding).length} founding) ·
          paid Pro would be ${pro.filter((r) => !r.founding).reduce((t, r) => t + r.coaches * PRO_PER_COACH, 0)} a season at ${PRO_PER_COACH} a coach.
          Leagues created before Round 1, 2027 are founding leagues: Pro free to the end of 2027.
        </p>
      </header>
      {error && <p className="card" style={{ padding: 12, color: '#a23d27' }}>Couldn’t load plans: {error.message}</p>}
      <div className="card table-box" style={{ padding: 0 }}>
        <table className="admin-plans">
          <thead><tr><th>League</th><th>Created</th><th>Coaches</th><th>Plan</th><th>Change</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.league_id}>
                <td><b>{r.name}</b><div className="muted" style={{ fontSize: 12 }}>#{r.league_id}{r.note ? ` · ${r.note}` : ''}</div></td>
                <td className="mono">{day(r.created_at)}</td>
                <td className="mono">{r.coaches}</td>
                <td>
                  <span className={`plan-pill ${r.is_pro ? '' : r.plan === 'pro' ? 'lapsed' : 'free'}`}>
                    {r.is_pro ? `Pro${r.founding ? ' · founding' : ''}` : r.plan === 'pro' ? 'Pro · lapsed' : 'Free'}
                  </span>
                  {r.pro_until && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>until {day(r.pro_until)}</div>}
                </td>
                <td>
                  <form action={setLeaguePlan}>
                    <input type="hidden" name="league" value={r.league_id} />
                    <select name="plan" defaultValue={r.plan} className="input" aria-label={`Plan for ${r.name}`} style={{ width: 90 }}>
                      <option value="free">Free</option><option value="pro">Pro</option>
                    </select>
                    <label className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>Pro until
                      <input type="date" name="until" defaultValue={r.pro_until ? ymd(r.pro_until) : ''} className="input" style={{ width: 150 }} />
                    </label>
                    <input name="note" placeholder="Note (optional)" className="input" style={{ width: 170 }} aria-label="Note" />
                    <button type="submit" className="btn dark">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>Pro with no date runs until you change it. Setting Free clears the date. Nothing is deleted when a league drops to Free: Pro features lock until it’s Pro again.</p>
    </div>
  );
}
