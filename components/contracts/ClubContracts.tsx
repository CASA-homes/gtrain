// A club's contracts, shown in the Clubhouse under "Contracts". Cap and lock-in at the top, then anything waiting on
// the coach (a clause paid on one of their players, offers on their pending free agents), final-year decisions, the
// full filterable list, committed salary by season and players not yet on contract.
import Link from 'next/link';
import { KcClock, RunButton } from '@/components/contracts/client';
import { RookiePicker } from '@/components/contracts/finance-client';
import { ContractsTable, type BuyInfo, type CtRow, type CtStatus } from '@/components/contracts/ContractsTable';
import { clauseKt, valueTrend, getContracts, isFinalYear, kt, money, playerAge, yearsLeft, type Contract } from '@/lib/contracts';
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
      start: c.start_season, end: c.end_season, yearsLeft: yearsLeft(s, c), tier: c.tier, clause: clauseKt(s, c, rate, d.pendingFa.has(c.player_id)),
      status, statusLabel, homeGrown: c.home_grown, extEnd: ext?.end_season ?? null, extSalary: ext?.salary_k ?? null,
      onAuction: openAuction.has(c.id), dead: Math.min(Math.floor((yearsLeft(s, c) * c.salary_k) / 2), c.salary_k),
      trend: valueTrend(p),
      tone: status === 'pending' || status === 'moving' || status === 'claim' ? 'red' : status === 'final' || status === 'draft' ? 'amber' : null,
    };
  });

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
    bank: viewer.bank, windowOpen, maxBuys: s.max_buys, nextSeason: s.season + 1, seasonCap: s.season_cap_k, clubName: club.team.name,
    used: d.claims.filter((c) => c.buyer_team === d.me!.team_id && c.status !== 'cancelled' && (!s.window_opened_at || c.created_at >= s.window_opened_at)).length,
    capRoomNext: s.season_cap_k - viewer.nextSalary,
  } : null;
  const uncontracted = [...club.list].filter((pid) => !d.byPlayer.has(pid)).map((pid) => d.players.get(pid)).filter((p): p is NonNullable<typeof p> => !!p);
  const underContract = rows.filter((r) => !r.tone);
  const outRows: CtRow[] = [
    ...rows.filter((r) => r.tone === 'red'), ...rows.filter((r) => r.tone === 'amber'),
    ...uncontracted.map((p) => ({
      id: -p.id, playerId: p.id, name: p.full_name ?? p.name, positions: p.positions ?? [], club: p.afl_club ?? null, age: playerAge(p), avg: p.average ?? null,
      games: p.games ?? 0, salary: null, base: 0, rate: d.rates.get(p.id) ?? 0, start: null, end: null, yearsLeft: 0, tier: 'standard' as const, clause: null,
      status: 'none' as const, statusLabel: 'No contract · free agent at season end', homeGrown: false, extEnd: null, extSalary: null, onAuction: false, dead: 0,
      trend: valueTrend(p), tone: 'red' as const,
    })).sort((a, b) => b.rate - a.rate),
  ];

  return (
    <div className="kc-stack">
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
          <div className="row-between"><h2 id="pfa-h">Pending free agents · offers in</h2><span className="kc-sub">Accept one: you get the fee now, he finishes {s.season} with you, then moves. Accept none and he goes to open free agency at season end.</span></div>
          {myPendingFas.map((f) => {
            const offers = d.offersOnMine.filter((o) => o.fa_id === f.id);
            return (
              <div key={f.id} style={{ marginTop: 14 }}>
                <div className="row-between"><strong>{name(f.player_id)}</strong><span className="kc-sub">Market {money(d.rates.get(f.player_id) ?? 0)} · {offers.length} offer{offers.length === 1 ? '' : 's'}</span></div>
                {offers.length === 0 ? <p className="kc-sub">No offers yet.</p> : (
                  <div className="kc-table-box"><table className="kc-table">
                    <thead><tr><th>From</th><th className="r">Contract</th><th>Clause</th><th className="r">Fee to you</th><th>Picks</th><th className="r">Score</th><th><span className="sr-only">Accept</span></th></tr></thead>
                    <tbody>{offers.map((o, i) => (
                      <tr key={o.id}>
                        <td className="name">{team(o.team_id)}{i === 0 ? <span className="kc-tag high" style={{ marginLeft: 6 }}>Best</span> : null}</td>
                        <td className="r">{o.years} × {money(o.salary_k)}</td>
                        <td className="meta">{o.tier === 'none' ? 'No clause' : o.tier === 'high' ? 'High' : 'Standard'}</td>
                        <td className="r" style={{ fontWeight: 700 }}>{kt(o.sweet_kt)}</td>
                        <td className="meta">{o.pick_ids.length ? `${o.pick_ids.length} pick${o.pick_ids.length > 1 ? 's' : ''} (noted)` : '—'}</td>
                        <td className="r">{o.score}</td>
                        <td className="r"><RunButton run="accept" id={o.id} small kind="sage" label="Accept" confirmText={`Accept ${team(o.team_id)}'s offer? You get ${kt(o.sweet_kt)} now and ${name(f.player_id)} moves at season end.`} /></td>
                      </tr>
                    ))}</tbody>
                  </table></div>
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


      <section className="kc-card ct2-card" aria-labelledby="ct-h">
        <div className="row-between" style={{ marginBottom: 10 }}>
          <h2 id="ct-h">Contracts</h2>
          {windowOpen && <span className="kc-tag exp">Window open · clause levels locked</span>}
        </div>
        <ContractsTable title="Under contract" note="Signed beyond this season, including extensions." rows={underContract} settings={s} years={years} canManage={canManage} mine={mine} windowOpen={windowOpen} buy={buy} />
      </section>

      <section className="kc-card rk-card" id="rookie" aria-labelledby="rk-h">
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

      <section className="kc-card ct2-card" aria-label="Expiring and free agents">
        <ContractsTable title="Expiring & free agents" note="Light red: free agent, under six months or leaving. Light yellow: final year, extend before mid-season." rows={outRows} settings={s} years={years} canManage={canManage} mine={mine} windowOpen={windowOpen} buy={buy} empty="Nobody expiring." />
        <p className="kc-sub" style={{ marginTop: 10 }}>Draft day prices: R1 $32k, R2 $24k, R3 $18k, R4+ $12k. Rookies (10 or fewer games) half that. {mine && <Link href={`/clubhouse/${teamId}?view=finances`}>Cap &amp; lock-in →</Link>}</p>
      </section>
    </div>
  );
}
