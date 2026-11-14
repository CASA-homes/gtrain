// A club's contracts, shown in the Clubhouse under "Contracts". Cap and lock-in at the top, then anything waiting on
// the coach (a clause paid on one of their players, offers on their pending free agents), final-year decisions, the
// full filterable list, committed salary by season and players not yet on contract.
import Link from 'next/link';
import { ExtendControl, KcClock, RunButton } from '@/components/contracts/client';
import { ContractsTable, type CtRow, type CtStatus } from '@/components/contracts/ContractsTable';
import { clauseKt, getContracts, isFinalYear, kt, money, moneyK, playerAge, yearsLeft, type Contract } from '@/lib/contracts';
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
  const canManage = mine || !!d.me?.is_commish;
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
      id: c.id, playerId: c.player_id, name: p?.name ?? `Player ${c.player_id}`, positions: p?.positions ?? [], club: p?.afl_club ?? null,
      age: playerAge(p), avg: p?.average ?? null, games: p?.games ?? 0, salary: c.salary_k, base: c.base_k, rate,
      start: c.start_season, end: c.end_season, yearsLeft: yearsLeft(s, c), tier: c.tier, clause: clauseKt(s, c, rate, d.pendingFa.has(c.player_id)),
      status, statusLabel, homeGrown: c.home_grown, extEnd: ext?.end_season ?? null, extSalary: ext?.salary_k ?? null,
      onAuction: openAuction.has(c.id), dead: Math.min(Math.floor((yearsLeft(s, c) * c.salary_k) / 2), c.salary_k),
    };
  });

  const finalYear = contracts.filter((c) => isFinalYear(s, c) && !ownNext.has(c.player_id) && !leaving.has(c.player_id) && !faOf.has(c.player_id));
  const incomingClaims = d.claims.filter((c) => c.status === 'pending' && c.seller_team === teamId);
  const outgoingClaims = d.claims.filter((c) => c.status === 'pending' && c.buyer_team === teamId);
  const myPendingFas = d.freeAgents.filter((f) => f.kind === 'pending' && f.ex_team === teamId);
  const arriving = d.pending.filter((p) => p.team_id === teamId && !contracts.some((c) => c.player_id === p.player_id));
  const departing = [...leaving.values()].filter((p) => contracts.some((c) => c.player_id === p.player_id));

  const years = Array.from({ length: 5 }, (_, i) => s.season + i);
  const committed = years.map((y) => ({
    y,
    k: d.contracts.filter((c) => c.team_id === teamId && (c.status === 'active' || c.status === 'pending') && c.start_season <= y && c.end_season >= y).reduce((a, c) => a + c.salary_k, 0)
      + d.contracts.filter((c) => c.team_id === teamId && c.dead_season === y).reduce((a, c) => a + c.dead_k, 0),
    cap: y === s.season + 1 ? club.keeperCapNext : s.keeper_cap_k,
  }));
  const totalRate = rows.reduce((t, r) => t + r.rate, 0);
  const nextOver = club.nextSalary - club.keeperCapNext;
  const uncontracted = [...club.list].filter((pid) => !d.byPlayer.has(pid)).map((pid) => d.players.get(pid)).filter((p): p is NonNullable<typeof p> => !!p);
  const emptySpots = Math.max(0, 33 - club.list.size);
  const draftBudget = s.season_cap_k - club.salary - emptySpots * s.hold_back_k;

  return (
    <div className="kc-stack">
      <div className="kc-tiles">
        <div className="kc-tile">
          <span>{s.season} salary</span><b>{moneyK(club.salary)}</b>
          <div className="kc-bar"><i className={club.salary > s.season_cap_k ? 'over' : ''} style={{ width: `${Math.min(100, (club.salary / s.season_cap_k) * 100)}%` }} /><s style={{ left: `${(s.tax_line_k / s.season_cap_k) * 100}%` }} /></div>
          <em>{moneyK(s.season_cap_k - club.salary)} room under the {moneyK(s.season_cap_k)} season cap{club.taxKt ? ` · ${kt(club.taxKt)} tax` : ''}</em>
        </div>
        <div className="kc-tile">
          <span>{s.season + 1} keepers</span><b className={nextOver > 0 ? 'kc-down' : undefined}>{moneyK(club.nextSalary)}</b>
          <div className="kc-bar"><i className={nextOver > 0 ? 'over' : ''} style={{ width: `${Math.min(100, (club.nextSalary / s.season_cap_k) * 100)}%` }} /><s style={{ left: `${(club.keeperCapNext / s.season_cap_k) * 100}%` }} /></div>
          <em>{club.keptNext} of 17 + 1 signed · {nextOver > 0 ? `${moneyK(nextOver)} over` : `${moneyK(-nextOver)} under`} the {moneyK(club.keeperCapNext)} keeper cap</em>
        </div>
        <div className="kc-tile"><span>Bank</span><b>{kt(club.bank)}</b><em>{d.claims.filter((c) => c.status === 'pending' && c.buyer_team === teamId).reduce((t, c) => t + c.price_kt, 0) > 0 ? 'Some held for clauses you’ve paid' : 'Clauses, offers and transfer fees'}</em></div>
        <div className="kc-tile"><span>List vs market</span><b className={totalRate >= club.salary ? 'kc-up' : 'kc-down'}>{totalRate >= club.salary ? '+' : '−'}{moneyK(Math.abs(totalRate - club.salary))}</b><em>{moneyK(totalRate)} market value on {moneyK(club.salary)} of salary</em></div>
      </div>

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

      {finalYear.length > 0 && (
        <section className="kc-card" aria-labelledby="fy-h">
          <div className="row-between">
            <div><h2 id="fy-h">Final year · {finalYear.length} player{finalYear.length > 1 ? 's' : ''}</h2>
              <p className="kc-sub">{d.midseason ? 'Mid-season has passed: these players are pending free agents.' : `Extend before mid-season week or they become pending free agents and rivals can bid. Draftees included. Final-year players have no release clause.`}</p></div>
          </div>
          <div className="kc-grid" style={{ marginTop: 14 }}>
            {finalYear.map((c) => {
              const p = d.players.get(c.player_id); const rate = d.rates.get(c.player_id) ?? 0;
              return (
                <div key={c.id} className="kc-fy">
                  <div className="row-between"><Link href={`/players/${c.player_id}`} style={{ fontSize: 15, fontWeight: 700, color: 'inherit' }}>{p?.name}</Link><span className="muted" style={{ fontSize: 12 }}>{playerAge(p) ?? '–'} · avg {p?.average?.toFixed(1) ?? '–'}</span></div>
                  <div className="kc-kv"><span>Now</span><strong>{money(c.salary_k)}{c.how === 'draft' ? ' · draft deal' : ''}</strong></div>
                  <div className="kc-kv"><span>Market rate</span><strong>{money(rate)}</strong></div>
                  {canManage && !d.midseason ? <ExtendControl contractId={c.id} name={p?.name ?? 'him'} rate={rate} homeGrown={c.home_grown} settings={s} /> : <p className="kc-sub">Not extended.</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="kc-card" aria-labelledby="ct-h">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <div><h2 id="ct-h">Contracts · {contracts.length}</h2><p className="kc-sub">Click a column to sort. Market value is what he’d cost on a new 3-year deal today.</p></div>
          {windowOpen && <span className="kc-tag exp">Mid-season window open · clause levels locked</span>}
        </div>
        <ContractsTable rows={rows} settings={s} years={years} canManage={canManage} mine={mine} windowOpen={windowOpen} />
      </section>

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
            <p className={`kc-msg ${nextOver <= 0 ? 'ok' : nextOver <= (club.deficitUsed ? 0 : s.deficit_max_k) ? 'err' : 'err'}`} style={{ marginTop: 10 }}>
              {nextOver <= 0 ? `Under the cap with ${moneyK(-nextOver)} spare.`
                : nextOver <= (club.deficitUsed ? 0 : s.deficit_max_k) ? `${moneyK(nextOver)} over: allowed as a deficit, but ${s.season + 2}'s keeper cap drops by ${moneyK(nextOver)}.`
                : `${moneyK(nextOver)} over. Keep fewer, release, or let a final-year player walk.`}
            </p>
          </section>
          <section className="kc-card" aria-labelledby="un-h">
            <h2 id="un-h">Not on contract · {uncontracted.length}</h2>
            <p className="kc-sub">Draft day prices: R1 $32k, R2 $24k, R3 $18k, R4+ $12k. Rookies (10 or fewer games) half that. Draft budget: <b>{moneyK(Math.max(0, draftBudget))}</b> after {moneyK(s.hold_back_k)} held back for each of {emptySpots} empty spots.</p>
            <p style={{ fontSize: 13, marginTop: 8 }}>{uncontracted.slice(0, 24).map((p) => p.name).join(', ')}{uncontracted.length > 24 ? '…' : ''}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
