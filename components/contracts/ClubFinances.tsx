// Clubhouse › Finances: the salary cap this season, keeper lock-in for next season, committed salary by season,
// and the club's token bank with every movement in and out.
import { RunButton } from '@/components/contracts/client';
import { getContracts, kt, moneyK } from '@/lib/contracts';
import { createClient } from '@/lib/supabase/server';
import './contracts.css';

export async function ClubFinances({ teamId }: { teamId: number }) {
  const d = await getContracts();
  const s = d.settings;
  const club = d.clubs.get(teamId);
  if (!s || !d.ready || !club) return <section className="kc-card brass"><h2>Contracts aren’t set up yet</h2><p className="kc-sub">Finances appear once the commish starts the shadow season.</p></section>;
  const supabase = await createClient();
  const { data: ledger } = await supabase.from('kc_ledger').select('id, delta, reason, created_at').eq('team_id', teamId).order('created_at', { ascending: false }).limit(40);
  const mine = !!d.me && !d.me.is_guest && d.me.team_id === teamId;
  const canManage = mine || !!d.me?.is_commish;

  const years = Array.from({ length: 5 }, (_, i) => s.season + i);
  const committed = years.map((y) => ({
    y,
    k: d.contracts.filter((c) => c.team_id === teamId && (c.status === 'active' || c.status === 'pending') && c.start_season <= y && c.end_season >= y).reduce((a, c) => a + c.salary_k, 0)
      + d.contracts.filter((c) => c.team_id === teamId && c.dead_season === y).reduce((a, c) => a + c.dead_k, 0),
    cap: y === s.season + 1 ? club.keeperCapNext : s.keeper_cap_k,
  }));
  const rateTotal = d.active.filter((c) => c.team_id === teamId).reduce((t, c) => t + (d.rates.get(c.player_id) ?? 0), 0);
  const nextOver = club.nextSalary - club.keeperCapNext;
  const allow = club.deficitUsed ? 0 : s.deficit_max_k;
  const held = d.claims.filter((c) => c.status === 'pending' && c.buyer_team === teamId).reduce((t, c) => t + c.price_kt, 0)
    + d.myOffers.filter((o) => o.status === 'tabled' && d.me?.team_id === teamId).reduce((t, o) => t + o.sweet_kt, 0);
  const emptySpots = Math.max(0, 33 - club.list.size);
  const draftBudget = Math.max(0, s.season_cap_k - club.salary - emptySpots * s.hold_back_k);

  return (
    <div className="kc-stack">
      <div className="kc-tiles">
        <div className="kc-tile">
          <span>{s.season} salary</span><b>{moneyK(club.salary)}</b>
          <div className="kc-bar"><i className={club.salary > s.season_cap_k ? 'over' : ''} style={{ width: `${Math.min(100, (club.salary / s.season_cap_k) * 100)}%` }} /><s style={{ left: `${(s.tax_line_k / s.season_cap_k) * 100}%` }} /></div>
          <em>{moneyK(s.season_cap_k - club.salary)} room under the {moneyK(s.season_cap_k)} season cap{club.taxKt ? ` · ${kt(club.taxKt)} tax` : ` · tax line ${moneyK(s.tax_line_k)}`}</em>
        </div>
        <div className="kc-tile">
          <span>{s.season + 1} keepers</span><b className={nextOver > 0 ? 'kc-down' : undefined}>{moneyK(club.nextSalary)}</b>
          <div className="kc-bar"><i className={nextOver > 0 ? 'over' : ''} style={{ width: `${Math.min(100, (club.nextSalary / s.season_cap_k) * 100)}%` }} /><s style={{ left: `${(club.keeperCapNext / s.season_cap_k) * 100}%` }} /></div>
          <em>{club.keptNext} of 17 + 1 signed · {nextOver > 0 ? `${moneyK(nextOver)} over` : `${moneyK(-nextOver)} under`} the {moneyK(club.keeperCapNext)} keeper cap</em>
        </div>
        <div className="kc-tile"><span>Bank</span><b>{kt(club.bank)}</b><em>{held ? `${kt(held)} held in clauses and offers` : 'For clauses, offers and fees'}</em></div>
        <div className="kc-tile"><span>List vs market</span><b className={rateTotal >= club.salary ? 'kc-up' : 'kc-down'}>{rateTotal >= club.salary ? '+' : '−'}{moneyK(Math.abs(rateTotal - club.salary))}</b><em>{moneyK(rateTotal)} market value on {moneyK(club.salary)} of salary</em></div>
      </div>

      <div className="kc-row">
        <section className="kc-card kc-main" aria-labelledby="yr-h">
          <h2 id="yr-h">Committed salary by season</h2>
          <p className="kc-sub">Against the keeper cap. Includes extensions, players arriving at season end, and dead money.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
            {committed.map(({ y, k, cap }) => (
              <div key={y}>
                <div className="row-between" style={{ fontSize: 13 }}><strong>{y}{cap !== s.keeper_cap_k ? ' · deficit carried' : ''}</strong><span className="num">{moneyK(k)} / {moneyK(cap)}</span></div>
                <div className="kc-bar" style={{ height: 22, borderRadius: 8 }}><i className={k > cap ? 'over' : ''} style={{ width: `${Math.min(100, (k / s.season_cap_k) * 100)}%`, borderRadius: 8 }} /><s style={{ left: `${(cap / s.season_cap_k) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
        <aside className="kc-side">
          <section className="kc-card" aria-labelledby="lk-h">
            <h2 id="lk-h">{s.season + 1} keeper lock-in</h2>
            <div style={{ marginTop: 8 }}>
              <div className="kc-kv"><span>Signed for {s.season + 1}</span><strong className={club.keptNext > 18 ? 'kc-down' : undefined}>{club.keptNext} / 17 + 1</strong></div>
              <div className="kc-kv"><span>Salary</span><strong>{moneyK(club.nextSalary)}</strong></div>
              <div className="kc-kv"><span>Keeper cap</span><strong>{moneyK(club.keeperCapNext)}</strong></div>
              <div className="kc-kv"><span>Deficit allowed</span><strong>{club.deficitUsed ? 'None (used last year)' : `Up to ${moneyK(s.deficit_max_k)}`}</strong></div>
            </div>
            <p className={`kc-msg ${nextOver <= 0 ? 'ok' : 'err'}`} style={{ marginTop: 10 }}>
              {nextOver <= 0 ? `Under the cap with ${moneyK(-nextOver)} spare.`
                : nextOver <= allow ? `${moneyK(nextOver)} over: allowed as a deficit, but ${s.season + 2}'s keeper cap drops by ${moneyK(nextOver)}.`
                : `${moneyK(nextOver)} over. Keep fewer, release, or let a final-year player walk.`}
            </p>
            {canManage && nextOver > 0 && nextOver <= allow && <div style={{ marginTop: 10 }}><RunButton run="lockin" id={teamId} small kind="dark" label="Lock in with deficit" confirmText={`Lock in ${moneyK(nextOver)} over? ${s.season + 2}'s keeper cap drops by that.`} /></div>}
          </section>
          <section className="kc-card" aria-labelledby="db-h">
            <h2 id="db-h">Draft budget</h2>
            <div className="kc-kv" style={{ borderTop: 0 }}><span>Season cap room</span><strong>{moneyK(s.season_cap_k - club.salary)}</strong></div>
            <div className="kc-kv"><span>Held back ({emptySpots} empty × {moneyK(s.hold_back_k)})</span><strong>−{moneyK(emptySpots * s.hold_back_k)}</strong></div>
            <div className="kc-kv"><span>To spend on draftees</span><strong className="kc-up">{moneyK(draftBudget)}</strong></div>
          </section>
        </aside>
      </div>

      <section className="kc-card" aria-labelledby="led-h">
        <div className="row-between"><h2 id="led-h">Token bank · {kt(club.bank)}</h2><span className="kc-sub">Paper tokens (KT) for the shadow season</span></div>
        <div className="kc-ledger">
          {(ledger ?? []).map((l) => (
            <div key={l.id}>
              <span className="muted">{new Date(l.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
              <span>{l.reason}</span>
              <b className={l.delta >= 0 ? 'kc-up' : 'kc-down'}>{l.delta >= 0 ? '+' : '−'}{Math.abs(l.delta).toLocaleString('en-AU')}</b>
            </div>
          ))}
          {!ledger?.length && <p className="kc-sub">No movements yet.</p>}
        </div>
      </section>
    </div>
  );
}
