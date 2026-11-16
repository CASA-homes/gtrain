// Overrides › Contracts (commish): clubs still over the keeper cap past the deficit limit, and every recent contract
// change with void / restore / edit, so a mistake can be reverted.
import Link from 'next/link';
import { getContracts, moneyK } from '@/lib/contracts';
import { createClient } from '@/lib/supabase/server';
import { ContractOverrideRow } from '@/components/league/ContractOverrideRow';
import '@/components/contracts/contracts.css';

type Row = { id: number; player_id: number; team_id: number; salary_k: number; start_season: number; end_season: number; tier: string; how: string; status: string; updated_at: string; clause_kt: number | null };

export async function ContractOverrides() {
  const d = await getContracts();
  const s = d.settings;
  if (!s) return <p className="kc-sub">Contracts aren’t set up yet.</p>;
  const supabase = await createClient();
  const { data } = await supabase.from('kc_contracts').select('id, player_id, team_id, salary_k, start_season, end_season, tier, how, status, updated_at, clause_kt')
    .order('updated_at', { ascending: false }).limit(40);
  const rows = (data ?? []) as Row[];
  const team = (id: number) => d.teams.find((t) => t.id === id)?.short_code ?? '—';
  const name = (pid: number) => d.players.get(pid)?.name ?? `Player ${pid}`;
  const next = s.season + 1;
  const breaches = [...d.clubs.values()].map((c) => ({ c, over: c.salary - c.keeperCapNow })).filter((x) => x.over > 0).sort((a, b) => b.over - a.over);
  const ago = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

  return (
    <div className="co">
      <section className="kc-card">
        <div className="row-between"><h2>Over the {s.season} keeper cap</h2><span className="kc-sub">Deficit up to {moneyK(s.deficit_max_k)} for {s.deficit_fee_kt.toLocaleString('en-AU')} KT</span></div>
        <p className="kc-sub">On deadline day a club can carry up to {moneyK(s.deficit_max_k)} over as a deficit (fee {s.deficit_fee_kt.toLocaleString('en-AU')} KT, and {next}’s keeper cap drops by the amount). Anything more and, if they haven’t released, traded or sold a player, you release one.</p>
        {breaches.length ? breaches.map(({ c, over }) => {
          const big = over > (c.deficitUsed ? 0 : s.deficit_max_k);
          const covering = d.active.filter((x) => x.team_id === c.team.id && x.end_season >= s.season && x.rookie_slot_season !== s.season).sort((a, b) => b.salary_k - a.salary_k).slice(0, 6);
          return (
            <details key={c.team.id} className="co-club">
              <summary><b>{c.team.name}</b><span className={big ? 'kc-down' : 'kc-up'}>{moneyK(over)} over · {big ? 'must fix' : 'deficit allowed'}</span></summary>
              {covering.map((x) => (
                <div key={x.id} className="co-row"><span><b>{name(x.player_id)}</b><small>{moneyK(x.salary_k)} to {x.end_season}</small></span>
                  <ContractOverrideRow id={x.id} status={x.status} salary={x.salary_k} end={x.end_season} canRelease /></div>
              ))}
            </details>
          );
        }) : <p className="kc-sub">Every club is under the {next} keeper cap.</p>}
      </section>

      <section className="kc-card">
        <div className="row-between"><h2>Recent contract changes</h2><Link href="/contracts/admin" className="kc-sub">Contract settings →</Link></div>
        <p className="kc-sub">Void a signing or extension, restore a released or voided contract, or fix the salary and end season.</p>
        {rows.map((r) => (
          <div key={r.id} className="co-row">
            <span><b>{name(r.player_id)}</b> <small>{team(r.team_id)} · {r.how.replace('_', ' ')} · {moneyK(r.salary_k)} {r.start_season}–{r.end_season} · {r.tier}{r.clause_kt ? ` · clause ${r.clause_kt.toLocaleString('en-AU')} KT` : ''} · <i className={`co-st ${r.status}`}>{r.status}</i> · {ago(r.updated_at)}</small></span>
            <ContractOverrideRow id={r.id} status={r.status} salary={r.salary_k} end={r.end_season} />
          </div>
        ))}
      </section>
    </div>
  );
}
