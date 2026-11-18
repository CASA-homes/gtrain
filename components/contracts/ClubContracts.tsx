// A club's contracts, shown in the Clubhouse under "Contracts". Cap and lock-in at the top, then anything waiting on
// the coach (a clause paid on one of their players, offers on their pending free agents), final-year decisions, the
// full filterable list, committed salary by season and players not yet on contract.
import Link from 'next/link';
import { DraftRequest, KcClock, LockAllButton, RunButton } from '@/components/contracts/client';
import { ContractsTour, TourButton } from '@/components/contracts/ContractsTour';
import { RookiePicker } from '@/components/contracts/finance-client';
import { ContractsTable, type BuyInfo, type CtRow, type CtStatus } from '@/components/contracts/ContractsTable';
import { clauseKt, inSetup, moneyK, releaseCost, valueTrend, getContracts, isFinalYear, kt, money, playerAge, yearsLeft, type Contract } from '@/lib/contracts';
import './contracts.css';

export async function ClubContracts({ teamId }: { teamId: number }) {
  const d = await getContracts();
  const s = d.settings;
  const club = d.clubs.get(teamId);
  if (!s || !d.ready || !club) {
    return (
      <section className="kc-card brass">
        <h2>Contracts aren’t set up yet</h2>
        <p className="kc-sub">The commish sets every keeper on a contract to start the shadow season. {d.me?.is_commish ? <Link href="/contracts/admin">Set it up</Link> : null}</p>
      </section>
    );
  }
  const mine = !!d.me && !d.me.is_guest && d.me.team_id === teamId;
  // Only the club's own coach acts on its contracts. The commish fixes things from League › Overrides.
  const canManage = mine;
  const setup = inSetup(s);
  const windowOpen = !!s.window_open && !!s.window_closes_at && new Date(s.window_closes_at) > new Date();
  const team = (id: number | null) => d.teams.find((t) => t.id === id)?.name ?? '—';
  const name = (pid: number) => d.players.get(pid)?.name ?? `Player ${pid}`;

  const contracts = d.active.filter((c) => c.team_id === teamId);
  const pendingClaim = new Map(d.claims.filter((c) => c.status === 'pending').map((c) => [c.contract_id, c]));
  const leaving = new Map(d.pending.filter((p) => p.team_id !== teamId).map((p) => [p.player_id, p]));
  const ownNext = new Map(d.pending.filter((p) => p.team_id === teamId).map((p) => [p.player_id, p]));
  const faOf = new Map(d.freeAgents.filter((f) => f.kind === 'pending').map((f) => [f.player_id, f]));
  const openAuction = new Set(d.auctions.filter((a) => a.seller_team === teamId).map((a) => a.contract_id));

  const statusOf = (c: Contract): [CtStatus, string] => {
    const cl = pendingClaim.get(c.id);
    if (cl) return ['claim', `Clause paid by ${team(cl.buyer_team)}`];
    const lv = leaving.get(c.player_id);
    if (lv) return ['moving', `Joins ${team(lv.team_id)} in ${s.season + 1}`];
    const fa = faOf.get(c.player_id);
    if (fa) return ['pending', `Pending FA · ${fa.offers} offer${fa.offers === 1 ? '' : 's'}`];
    const ext = ownNext.get(c.player_id);
    if (isFinalYear(s, c) && ext) return ['extended', `Extended to ${ext.end_season}`];
    if (isFinalYear(s, c) && c.how === 'draft') return ['draft', 'Draft deal · 1 season'];
    if (isFinalYear(s, c)) return ['final', 'Final year'];
    if (c.rookie) return ['rookie', `Rookie deal · ${yearsLeft(s, c)} yrs`];
    return ['contract', `${yearsLeft(s, c)} yrs left`];
  };

  const rows: CtRow[] = contracts.map((c) => {
    const p = d.players.get(c.player_id); const rate = d.rates.get(c.player_id) ?? 0; const ext = ownNext.get(c.player_id);
    const [status, statusLabel] = statusOf(c);
    return {
      id: c.id, playerId: c.player_id, name: p?.full_name ?? p?.name ?? `Player ${c.player_id}`, positions: p?.positions ?? [], club: p?.afl_club ?? null,
      age: playerAge(p), avg: p?.average ?? null, games: p?.games ?? 0, salary: c.salary_k, base: c.base_k, rate,
      start: c.start_season, end: c.end_season, yearsLeft: yearsLeft(s, c), provisional: !!c.provisional, tier: c.tier, clause: clauseKt(s, c, rate, d.pendingFa.has(c.player_id)),
      status, statusLabel, homeGrown: c.home_grown, extEnd: ext?.end_season ?? null, extSalary: ext?.salary_k ?? null,
      onAuction: openAuction.has(c.id), lockedUntil: c.locked_until, ...(() => { const rc = releaseCost(s, c); return { dead: rc.now, deadLater: rc.later, deadYears: rc.laterYears, releaseFee: rc.fee }; })(),
      trend: valueTrend(p),
      tone: status === 'pending' || status === 'moving' || status === 'claim' ? 'red' : status === 'final' || status === 'draft' ? 'amber' : null,
    };
  });

  const draftRequests = contracts.filter((c) => c.status === 'active' && c.draft_review);
  const incomingClaims = d.claims.filter((c) => c.status === 'pending' && c.seller_team === teamId);
  const outgoingClaims = d.claims.filter((c) => c.status === 'pending' && c.buyer_team === teamId);
  const myPendingFas = d.freeAgents.filter((f) => f.kind === 'pending' && f.ex_team === teamId);
  const arriving = d.pending.filter((p) => p.team_id === teamId && !contracts.some((c) => c.player_id === p.player_id));
  const departing = [...leaving.values()].filter((p) => contracts.some((c) => c.player_id === p.player_id));

  const years = Array.from({ length: 5 }, (_, i) => s.season + i);
  // Rookie slot: this season only, locked from player drop day.
  const rookie = contracts.find((c) => c.rookie_slot_season === s.season) ?? null;
  const rookieLocked = !!s.rookie_lock_at && new Date(s.rookie_lock_at) <= new Date() && !d.me?.is_commish;
  const dropDay = s.rookie_lock_at ? new Date(s.rookie_lock_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Perth' }) : null;
  const rookieOptions = contracts.filter((c) => (d.players.get(c.player_id)?.career_games ?? 99) <= 10 && c.start_season <= s.season && c.end_season >= s.season)
    .sort((a, b) => b.salary_k - a.salary_k)
    .map((c) => { const p = d.players.get(c.player_id); return { id: c.player_id, label: `${p?.name ?? `Player ${c.player_id}`} · ${p?.career_games ?? 0} games · ${money(c.salary_k)} off cap` }; });
  // Another coach looking at this club can bid on release clauses.
  const viewer = d.me && !d.me.is_guest && !mine ? d.clubs.get(d.me.team_id) : null;
  const buy: BuyInfo | null = viewer && d.me ? {
    dropOptions: [...viewer.list].map((id) => { const p = d.players.get(id); const c = d.byPlayer.get(id); return { id, sal: c?.salary_k ?? 0, label: `${p?.name ?? id}${c ? ` · $${c.salary_k}k to ${c.end_season}` : ' · no contract'}` }; }).sort((a, b) => a.sal - b.sal).map(({ id, label }) => ({ id, label })),
    bank: viewer.bank, windowOpen, maxBuys: s.max_buys, nextSeason: s.season, seasonCap: s.season_cap_k, clubName: club.team.name,
    used: d.claims.filter((c) => c.buyer_team === d.me!.team_id && c.status !== 'cancelled' && (!s.window_opened_at || c.created_at >= s.window_opened_at)).length,
    capRoomNext: s.season_cap_k - viewer.salary,
  } : null;
  const uncontracted = [...club.list].filter((pid) => !d.byPlayer.has(pid)).map((pid) => d.players.get(pid)).filter((p): p is NonNullable<typeof p> => !!p);
  // One-year deals (final year, yellow) sit with the rest of the signed list, keeping their yellow fill.
  const underContract = [...rows.filter((r) => !r.tone), ...rows.filter((r) => r.tone === 'amber')];
  const outRows: CtRow[] = [
    ...rows.filter((r) => r.tone === 'red'),
    ...uncontracted.map((p) => ({
      id: -p.id, playerId: p.id, name: p.full_name ?? p.name, positions: p.positions ?? [], club: p.afl_club ?? null, age: playerAge(p), avg: p.average ?? null,
      games: p.games ?? 0, salary: null, base: 0, rate: d.rates.get(p.id) ?? 0, start: null, end: null, yearsLeft: 0, tier: 'standard' as const, clause: null,
      status: 'none' as const, statusLabel: setup ? 'Unsigned · expires on deadline day' : 'No contract · free agent at season end', homeGrown: false, extEnd: null, extSalary: null, onAuction: false, dead: 0,
      trend: valueTrend(p), tone: 'red' as const,
    })).sort((a, b) => b.rate - a.rate),
  ];

  const provCount = contracts.filter((c) => c.provisional).length;
  const deadline = s.setup_until ? new Date(s.setup_until).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Perth' }) : '';
  const room = club.keeperCapNow - club.salary;
  const faDay = (s.fa_day ? new Date(`${s.fa_day}T12:00:00+08:00`) : new Date(`${s.season + 1}-01-01T12:00:00+08:00`)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Perth' });

  return (
    <div className="kc-stack">
      {mine && <ContractsTour setup={setup} keeperCap={s.keeper_cap_k} softCap={s.season_cap_k - s.keeper_cap_k} deadline={deadline || 'deadline day'} showButton={!setup} />}
      <section className="kc-card cs-card" aria-labelledby="cs-h" data-tour="setup">
        <div className="cs-head">
          <h2 id="cs-h">Contract summary</h2>
          <details className="cs-info">
            <summary aria-label="How contracts work">i</summary>
            <div className="cs-pop">
              {setup ? <>
                <p>Every player starts unsigned. Offer contracts (length and clause) to the players you want for {s.season} and beyond: they become your <b>17 + 1 keepers</b>.</p>
                <p>Anyone still unsigned <b>expires on deadline day{deadline ? `, ${deadline}` : ''}</b>. Until then everything is provisional with no KT fees, so undo and try alternatives freely. Lock a contract to make it final.</p>
              </> : <p>Keep 17 + 1 under the {moneyK(club.keeperCapNow)} keeper cap. Final-year players can be extended; anyone not re-signed becomes a pending free agent when the mid-season window closes.</p>}
              {mine && <TourButton className="kc-btn small" />}
            </div>
          </details>
          {setup && deadline && <span className="fn-pill brass cs-dl">Deadline {deadline}</span>}
          {mine && setup && provCount > 0 && <span className="cs-lock"><LockAllButton teamId={teamId} count={provCount} /></span>}
        </div>
        <div className="cs-grid">
          <div className="cs-k"><span>Keeper spots</span><b className={contracts.length > 18 ? 'kc-down' : undefined}>{contracts.length}<small> / 17 + 1</small></b>{setup && provCount > 0 && <em>{provCount} provisional</em>}</div>
          <div className="cs-k"><span>Expiring {s.season}</span><b>{contracts.filter((c) => c.end_season <= s.season).length}</b><em>final year</em></div>
          <div className="cs-k"><span>{s.season + 1} and beyond</span><b>{contracts.filter((c) => c.end_season > s.season).length}</b><em>through {s.season + 1}+</em></div>
          <div className="cs-k"><span>Rookies</span><b>{contracts.filter((c) => c.rookie || c.rookie_slot_season === s.season).length}</b><em>on contract</em></div>
          <div className="cs-k"><span>{s.season} salary</span><b>{moneyK(club.salary)}<small> / {moneyK(club.keeperCapNow)}</small></b><em className={room < 0 ? 'kc-down' : 'kc-up'}>{room < 0 ? `${moneyK(-room)} over` : `${moneyK(room)} room`}</em></div>
        </div>
      </section>
      {canManage && incomingClaims.length > 0 && (
        <section className="kc-card warn" aria-labelledby="clm-h">
          <h2 id="clm-h">Release clause paid · decide within 24 hours</h2>
          <p className="kc-sub">Match by paying the same amount (it’s burned, the buyer is refunded, and his clause steps up a level, with salary to suit). Or let him go: you get the fee less the {s.levy_pct}% levy now, he plays out {s.season} with you, then moves.</p>
          {incomingClaims.map((c) => {
            const con = d.active.find((x) => x.id === c.contract_id);
            return (
              <div key={c.id} className="kc-kv" style={{ alignItems: 'center', flexWrap: 'wrap', paddingTop: 12 }}>
                <span style={{ color: 'var(--ink)' }}><b>{name(c.player_id)}</b> · {team(c.buyer_team)} paid {kt(c.price_kt)} · {con ? `${money(con.salary_k)} to ${con.end_season}` : ''} · <KcClock endsAt={c.expires_at} /> left</span>
                <span style={{ display: 'inline-flex', gap: 8 }}>
                  <RunButton run="match" id={c.id} small kind="dark" label={`Match · ${kt(c.price_kt)}`} disabled={club.bank < c.price_kt} confirmText={`Pay ${kt(c.price_kt)} to keep ${name(c.player_id)}? His clause goes up a level and his salary with it.`} />
                  <RunButton run="complete" id={c.id} small kind="plain" label="Let him go" confirmText={`Let ${name(c.player_id)} go? You get ${kt(c.price_kt - Math.floor((c.price_kt * s.levy_pct) / 100))} now and he moves at season end.`} />
                </span>
              </div>
            );
          })}
        </section>
      )}

      {canManage && myPendingFas.length > 0 && (
        <section className="kc-card" aria-labelledby="pfa-h">
          <div className="row-between"><h2 id="pfa-h">Pending free agents · offers in</h2><span className="kc-sub">Each new top offer gives you 48 hours to match it (he stays on the same terms) or let him go (you get the fee, he finishes {s.season} with you and moves on Free Agent Day, {faDay}). No answer in 48 hours and he goes.</span></div>
          {myPendingFas.map((f) => {
            const offers = d.offersOnMine.filter((o) => o.fa_id === f.id);
            const top = offers.find((o) => o.id === f.match_offer) ?? null;
            return (
              <div key={f.id} style={{ marginTop: 14 }}>
                <div className="row-between"><strong>{name(f.player_id)}</strong><span className="kc-sub">Market {money(d.rates.get(f.player_id) ?? 0)} · {offers.length} offer{offers.length === 1 ? '' : 's'}</span></div>
                {!top ? <p className="kc-sub">No offers yet. If nobody bids, he’s an open free agent from Free Agent Day.</p> : (
                  <div className="kc-match">
                    <div className="kc-match-top">
                      <span><b>{team(top.team_id)}</b> offers {top.years} × {money(top.salary_k)} · {top.tier === 'none' ? 'no clause' : top.tier === 'high' ? 'high clause' : 'standard clause'} · <b>{kt(top.sweet_kt)}</b> fee to you</span>
                      {f.match_by && <span className="kc-tag std">Match within <KcClock endsAt={f.match_by} /></span>}
                    </div>
                    <div className="kc-match-acts">
                      <RunButton run="complete-fa" id={top.id} small kind="plain" label={`Let him go · +${kt(top.sweet_kt)}`} confirmText={`${name(f.player_id)} signs with ${team(top.team_id)}. You get the ${kt(top.sweet_kt)} fee now, he plays out ${s.season} with you, then moves on Free Agent Day.`} />
                      <RunButton run="match-fa" id={f.id} small kind="sage" label={`Match · ${top.years} × ${money(top.salary_k)}`} confirmText={`Keep ${name(f.player_id)} on ${team(top.team_id)}’s terms: ${top.years} year${top.years > 1 ? 's' : ''} at ${money(top.salary_k)} from ${s.season + 1}. No fee changes hands.`} />
                    </div>
                    {offers.length > 1 && <p className="kc-sub" style={{ margin: 0 }}>{offers.length - 1} lower offer{offers.length > 2 ? 's' : ''} refunded whichever way you go.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {(arriving.length > 0 || departing.length > 0 || outgoingClaims.length > 0) && (
        <section className="kc-card" aria-labelledby="mv-h">
          <h2 id="mv-h">Moving at season end</h2>
          <div className="kc-grid" style={{ marginTop: 10 }}>
            {arriving.map((p) => <div key={`a${p.id}`} className="kc-kv"><span>In: <b style={{ color: 'var(--ink)' }}>{name(p.player_id)}</b></span><strong className="kc-up">{money(p.salary_k)} to {p.end_season}</strong></div>)}
            {departing.map((p) => <div key={`d${p.id}`} className="kc-kv"><span>Out: <b style={{ color: 'var(--ink)' }}>{name(p.player_id)}</b> to {team(p.team_id)}</span><strong className="kc-down">{money(p.salary_k)}</strong></div>)}
            {outgoingClaims.map((c) => <div key={`c${c.id}`} className="kc-kv"><span>Clause paid: <b style={{ color: 'var(--ink)' }}>{name(c.player_id)}</b>, waiting on {team(c.seller_team)}</span><strong><KcClock endsAt={c.expires_at} /></strong></div>)}
          </div>
        </section>
      )}


      {mine && draftRequests.length > 0 && (
        <section className="kc-card brass" aria-labelledby="dr-h">
          <div className="row-between">
            <h2 id="dr-h">Contract requests</h2>
            <span className="fn-pill brass">{draftRequests.length} draftee{draftRequests.length === 1 ? '' : 's'}</span>
          </div>
          <p className="kc-sub" style={{ margin: '4px 0 10px' }}>Your draftees have no clause until the mid-season window. Set each one before it opens, or he defaults to a standard clause priced off his market value then.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {draftRequests.map((c) => (
              <DraftRequest key={c.id} contractId={c.id} name={name(c.player_id)} rookie={c.rookie} base={c.base_k} rate={d.rates.get(c.player_id) ?? 0}
                years={`${c.end_season - c.start_season + 1} yr${c.end_season > c.start_season ? 's' : ''} to ${c.end_season}`} settings={s} />
            ))}
          </div>
        </section>
      )}

      <section className="kc-card ct2-card" aria-labelledby="ct-h" data-tour="contracts">
        <div className="row-between" style={{ marginBottom: 10 }}>
          <h2 id="ct-h">Contracts</h2>
          {windowOpen && <span className="kc-tag exp">Window open · clause levels locked</span>}
        </div>
        <ContractsTable title="Under contract" note="Everyone signed, including extensions. Light yellow: one-year deal or final year, re-sign before it runs out." rows={underContract} settings={s} years={years} canManage={canManage} mine={mine} windowOpen={windowOpen} buy={buy} />
      </section>

      <section className="kc-card rk-card" id="rookie" aria-labelledby="rk-h" data-tour="rookie">
        <div className="row-between">
          <h2 id="rk-h">{s.season} rookie slot</h2>
          <span className={`fn-pill ${rookieLocked ? 'dn' : 'brass'}`}>{rookieLocked ? 'Locked' : dropDay ? `Locks ${dropDay}` : 'Cap-free'}</span>
        </div>
        <p className="kc-sub" style={{ margin: '4px 0 10px' }}>
          {rookie ? <><b style={{ color: 'var(--ink)' }}>{name(rookie.player_id)}</b> · {money(rookie.salary_k)} off your cap this season.</> : 'Empty. Pick one player with 10 or fewer games; his salary doesn’t count to your cap this season.'}
          {' '}Set before player drop day{dropDay ? ` (${dropDay})` : ''}.
        </p>
        {canManage && <RookiePicker season={s.season} current={rookie?.player_id ?? null} options={rookieOptions} locked={rookieLocked} />}
      </section>

      <section className="kc-card ct2-card" aria-label="Expiring and free agents" data-tour="unsigned">
        <ContractsTable title={setup ? 'Unsigned & expiring' : 'Expiring & free agents'} note={setup ? 'Light red: unsigned. Tap a player to offer him a contract.' : 'Light red: free agent, under six months or leaving.'} rows={outRows} settings={s} years={years} canManage={canManage} mine={mine} windowOpen={windowOpen} buy={buy} empty="Nobody expiring." />
        <p className="kc-sub" style={{ marginTop: 10 }}>Draft day prices: top 10 picks $30k, rest of R1 and R2 $25k, R3 $20k, R4 $15k, R5+ $10k. Rookies (10 or fewer games) half that, on 2 years; established players on 1. No clause until the mid-season window. {mine && <Link href={`/clubhouse/${teamId}?view=finances`}>Cap &amp; lock-in →</Link>}</p>
      </section>
    </div>
  );
}
