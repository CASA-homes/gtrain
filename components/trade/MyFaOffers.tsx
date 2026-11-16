// Trademarket: your free-agent contract offers while they wait on a decision, plus recent results.
import Link from 'next/link';
import { getContracts, money } from '@/lib/contracts';
import { createClient } from '@/lib/supabase/server';
import { WithdrawOffer } from '@/components/trade/WithdrawOffer';

export async function MyFaOffers() {
  const d = await getContracts();
  if (!d.me || d.me.is_guest) return null;
  const supabase = await createClient();
  const { data: recent } = await supabase.from('kc_offers').select('id, player_id, years, salary_k, tier, status, updated_at')
    .eq('team_id', d.me.team_id).in('status', ['won', 'lost']).order('updated_at', { ascending: false }).limit(5);
  const tabled = d.myOffers;
  if (!tabled.length && !(recent ?? []).length) return null;
  const team = (id: number | null) => d.teams.find((t) => t.id === id)?.name ?? 'free agency';
  const name = (pid: number) => d.players.get(pid)?.name ?? `Player ${pid}`;
  const clause = (t: string) => (t === 'none' ? 'no clause' : `${t} clause`);
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-labelledby="fao-h">
      <div className="row-between"><h2 id="fao-h" className="h2" style={{ fontSize: 20 }}>Your free-agent offers</h2><span className="muted" style={{ fontSize: 13 }}>Waiting on a decision. Raise it, or cancel it to get any KT back.</span></div>
      {tabled.map((o) => {
        const f = d.freeAgents.find((x) => x.id === o.fa_id);
        const pid = f?.player_id ?? 0;
        const rivals = Math.max(0, (f?.offers ?? 1) - 1);
        return (
          <div key={o.id} className="card" style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span><Link href={`/players/${pid}`}><b>{name(pid)}</b></Link> <span className="muted">· {f?.kind === 'open' ? 'free agent' : `from ${team(f?.ex_team ?? null)}`}</span></span>
              <span className="muted" style={{ fontSize: 13 }}>
                {o.years} yr{o.years > 1 ? 's' : ''} × {money(o.salary_k)} · {clause(o.tier)}{o.sweet_kt ? ` · +${o.sweet_kt} KT held` : ''}{o.pick_ids.length ? ` · +${o.pick_ids.length} pick${o.pick_ids.length > 1 ? 's' : ''}` : ''} · score {o.score}
              </span>
            </span>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="pill" style={{ background: '#f1e8a8', color: '#5b4a10' }}>Waiting{rivals ? ` · ${rivals} rival offer${rivals > 1 ? 's' : ''}` : ''}</span>
              {f?.closes_at && <span className="muted" style={{ fontSize: 12 }}>Closes {new Date(f.closes_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Perth' })}</span>}
              <Link href={`/contracts/offer/${o.fa_id}`} className="btn">Review / raise</Link>
              <WithdrawOffer offerId={o.id} name={name(pid)} sweet={o.sweet_kt} />
            </span>
          </div>
        );
      })}
      {(recent ?? []).map((o) => (
        <div key={o.id} className="card" style={{ padding: '10px 18px', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', opacity: 0.8 }}>
          <span><b>{name(o.player_id)}</b> <span className="muted">· {o.years} yr{o.years > 1 ? 's' : ''} × {money(o.salary_k)}</span></span>
          <span className="pill" style={o.status === 'won' ? { background: '#1f6b3a', color: '#fff' } : { background: '#f3c2b9', color: '#7a1d12' }}>{o.status === 'won' ? 'Signed' : 'Lost out'}</span>
        </div>
      ))}
    </section>
  );
}
