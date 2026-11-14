import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KcHeader } from '@/components/contracts/KcHeader';
import { AuctionControl, ExtendControl, ReleaseButton, TierSelect } from '@/components/contracts/client';
import { clauseKt, floorFor, getContracts, isFinalYear, kt, money, moneyK, playerAge, TIER_LABEL, yearsLeft, type Contract } from '@/lib/contracts';
import { LINES } from '@/lib/ratings';

export const dynamic = 'force-dynamic';

export default async function ClubContracts({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamId = Number(id);
  const d = await getContracts();
  const club = d.clubs.get(teamId);
  if (!club) notFound();
  const s = d.settings;
  const mine = !!d.me && !d.me.is_guest && d.me.team_id === teamId;
  const canManage = mine || !!d.me?.is_commish;
  const windowOpen = !!s?.window_open && !!s.window_closes_at && new Date(s.window_closes_at) > new Date();

  if (!s || !d.ready) {
    return (
      <div className="kc-page">
        <KcHeader settings={s} tab="club" myTeamId={d.me?.team_id} isCommish={d.me?.is_commish} crumb="Keeper HQ / Contracts" title={club.team.name} />
        <div className="kc-wrap"><section className="kc-card brass"><h2>Contracts aren’t set up yet</h2><p className="kc-sub"><Link href="/contracts">Back to Contracts</Link></p></section></div>
      </div>
    );
  }

  const contracts = d.active.filter((c) => c.team_id === teamId).sort((a, b) => b.salary_k - a.salary_k);
  const pendingFor = (c: Contract) => d.pendingByPlayer.get(c.player_id);
  const finalYear = contracts.filter((c) => isFinalYear(s, c));
  const longUsed = d.contracts.filter((c) => c.team_id === teamId && (c.status === 'active' || c.status === 'pending') && c.end_season - c.start_season + 1 >= 4).length;
  const openAuction = new Set(d.auctions.filter((a) => a.seller_team === teamId).map((a) => a.contract_id));
  const exposed = finalYear.reduce((a, c) => a + (pendingFor(c) ? 0 : clauseKt(s, c, d.rates.get(c.player_id) ?? 0) ?? 0), 0);
  const years = Array.from({ length: 5 }, (_, i) => s.season + i);
  const committed = years.map((y) => ({
    y,
    k: d.contracts.filter((c) => c.team_id === teamId && (c.status === 'active' || c.status === 'pending') && c.start_season <= y && c.end_season >= y).reduce((a, c) => a + c.salary_k, 0)
      + d.contracts.filter((c) => c.team_id === teamId && c.dead_season === y).reduce((a, c) => a + c.dead_k, 0),
  }));
  const dead = d.contracts.filter((c) => c.team_id === teamId && c.dead_k > 0 && (c.dead_season ?? 0) >= s.season);
  const uncontracted = [...club.list].filter((pid) => !d.byPlayer.has(pid)).map((pid) => d.players.get(pid)).filter(Boolean);
  const room = s.keeper_cap_k - club.salary;

  return (
    <div className="kc-page">
      <KcHeader settings={s} tab={mine ? 'club' : 'overview'} myTeamId={d.me?.is_guest ? null : d.me?.team_id} isCommish={d.me?.is_commish}
        crumb={`Keeper HQ / Contracts / ${club.team.name}`} title={club.team.name}
        sub={<>{contracts.length} players on contract · {d.seasonLabel}{mine ? '' : ' · view only'}</>}
        kpis={[
          { label: 'Keeper cap', value: moneyK(club.salary), note: club.overKeeper ? `${moneyK(club.overKeeper)} over ${moneyK(s.keeper_cap_k)}` : `${moneyK(room)} room of ${moneyK(s.keeper_cap_k)}`, bad: !!club.overKeeper },
          { label: 'Season cap room', value: moneyK(s.season_cap_k - club.salary), note: club.taxKt ? `${kt(club.taxKt)} luxury tax` : `${moneyK(Math.max(0, s.tax_line_k - club.salary))} before tax line` },
          { label: 'Bank', value: kt(club.bank), note: d.windupCents ? `≈ $${((club.bank * d.windupCents) / 100).toFixed(0)} at wind-up` : undefined },
        ]} />

      <div className="kc-wrap">
        {club.overKeeper > 0 && (
          <section className="kc-card warn">
            <h2>{moneyK(club.overKeeper)} over the keeper cap</h2>
            <p className="kc-sub">Release, trade or auction a player, or extend a final-year player on a cheaper long deal, before keeper lock-in.</p>
          </section>
        )}

        {finalYear.length > 0 && (
          <section className="kc-card" aria-labelledby="fy-h">
            <div className="row-between">
              <div><h2 id="fy-h">Final year · {finalYear.length} player{finalYear.length > 1 ? 's' : ''}</h2>
                <p className="kc-sub">Clauses halve in a player’s final year. Extend to lock him in, or leave him and get paid if someone buys him in a window.</p></div>
              {exposed > 0 && <span className="kc-tag exp">{kt(exposed)} of half-price clauses</span>}
            </div>
            <div className="kc-grid" style={{ marginTop: 14 }}>
              {finalYear.map((c) => {
                const p = d.players.get(c.player_id); const rate = d.rates.get(c.player_id) ?? 0; const ext = pendingFor(c);
                const clause = clauseKt(s, c, rate);
                return (
                  <div key={c.id} style={{ border: '1px solid var(--khq-line)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="row-between"><strong style={{ fontSize: 15 }}>{p?.name}</strong><span className="muted" style={{ fontSize: 12 }}>{playerAge(p) ?? '–'} · avg {p?.average?.toFixed(1) ?? '–'}{c.home_grown ? ' · home-grown' : ''}</span></div>
                    <div className="kc-kv"><span>Now</span><strong>{money(c.salary_k)}</strong></div>
                    <div className="kc-kv"><span>Market rate</span><strong>{money(rate)}</strong></div>
                    <div className="kc-kv"><span>Clause now</span><strong className="kc-down">{clause == null ? 'None' : kt(clause)}</strong></div>
                    {ext ? <p className="kc-msg ok">Extended: {money(ext.salary_k)} a year to {ext.end_season}.</p>
                      : canManage ? <ExtendControl contractId={c.id} name={p?.name ?? 'him'} rate={rate} homeGrown={c.home_grown} settings={s} longUsed={longUsed} />
                      : <p className="kc-sub">Not extended yet.</p>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="kc-card" aria-labelledby="ct-h">
          <div className="row-between"><h2 id="ct-h">Contracts</h2>
            <span className="kc-sub">{longUsed} of {s.long_deal_limit} long-deal slots used{windowOpen ? ' · clauses locked while the window is open' : ''}</span></div>
          <div className="kc-table-box" style={{ marginTop: 8 }}>
            <table className="kc-table" style={{ minWidth: 980 }}>
              <thead><tr>
                <th>Player</th><th className="r">Age</th><th className="r">Avg</th><th className="r">Salary</th><th>{years[0]}–{years[4] % 100}</th>
                <th className="r">Rate</th><th>Clause</th><th className="r">Clause KT</th><th>Status</th>{canManage && <th><span className="sr-only">Actions</span></th>}
              </tr></thead>
              <tbody>
                {contracts.map((c) => {
                  const p = d.players.get(c.player_id); const rate = d.rates.get(c.player_id) ?? 0; const ext = pendingFor(c);
                  const clause = clauseKt(s, c, rate); const fy = isFinalYear(s, c);
                  const tagCls = c.tier === 'none' ? 'safe' : c.tier === 'protected' ? 'rook' : fy && !ext ? 'exp' : c.rookie ? 'rook' : c.tier === 'high' ? 'high' : 'std';
                  const tag = c.tier === 'protected' ? 'Rookie keeper' : fy ? (ext ? 'Extended' : 'Final year') : c.rookie ? 'Rookie deal' : `${yearsLeft(s, c)} yrs left`;
                  const remaining = yearsLeft(s, c) * c.salary_k;
                  return (
                    <tr key={c.id}>
                      <td><Link href={`/players/${c.player_id}`} className="name" style={{ color: 'inherit' }}>{p?.name ?? `Player ${c.player_id}`}</Link>
                        <div className="meta">{p?.positions.join('/')} · {p?.afl_club ?? ''}{c.home_grown ? ' · home-grown' : ''}</div></td>
                      <td className="r">{playerAge(p) ?? '–'}</td>
                      <td className="r">{p?.average?.toFixed(1) ?? '–'}</td>
                      <td className="r" style={{ fontWeight: 700 }}>{money(c.salary_k)}</td>
                      <td><span className="kc-pips" role="img" aria-label={`Contracted to ${ext?.end_season ?? c.end_season}`}>
                        {years.map((y) => <i key={y} className={c.end_season >= y && c.start_season <= y ? 'on' : ext && ext.end_season >= y && ext.start_season <= y ? 'next' : ''} />)}
                      </span></td>
                      <td className="r">{money(rate)}</td>
                      <td>{canManage ? <TierSelect contractId={c.id} tier={c.tier} base={c.base_k} settings={s} locked={windowOpen} /> : <span className={`kc-tag ${c.tier === 'none' ? 'safe' : c.tier === 'high' ? 'high' : 'std'}`}>{TIER_LABEL[c.tier]}</span>}</td>
                      <td className={`r ${fy && clause ? 'kc-down' : ''}`}>{clause == null ? '—' : kt(clause)}</td>
                      <td><span className={`kc-tag ${tagCls}`}>{tag}</span></td>
                      {canManage && <td className="r"><span style={{ display: 'inline-flex', gap: 6, alignItems: 'flex-start' }}>
                        {openAuction.has(c.id) ? <Link href="/contracts/market" className="kc-btn small">On auction</Link> : mine ? <AuctionControl contractId={c.id} name={p?.name ?? 'him'} suggested={Math.round(((clause ?? rate * 100) * 0.4) / 100) * 100} /> : null}
                        <ReleaseButton contractId={c.id} name={p?.name ?? 'him'} dead={Math.min(Math.floor(remaining / 2), c.salary_k)} />
                      </span></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="kc-row">
          <section className="kc-card kc-main" aria-labelledby="yr-h">
            <h2 id="yr-h">Committed salary by season</h2>
            <p className="kc-sub">Against the {moneyK(s.keeper_cap_k)} keeper cap. Includes extensions already signed and dead money.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              {committed.map(({ y, k }) => (
                <div key={y}>
                  <div className="row-between" style={{ fontSize: 13 }}><strong>{y}</strong><span className="num">{moneyK(k)} / {moneyK(s.keeper_cap_k)}</span></div>
                  <div className="kc-bar" style={{ height: 22, borderRadius: 8 }}><i className={k > s.keeper_cap_k ? 'over' : ''} style={{ width: `${Math.min(100, (k / s.season_cap_k) * 100)}%`, borderRadius: 8 }} /><s style={{ left: `${(s.keeper_cap_k / s.season_cap_k) * 100}%` }} /></div>
                </div>
              ))}
            </div>
            {dead.length > 0 && <p className="kc-sub" style={{ marginTop: 12 }}>Dead money: {dead.map((c) => `${d.players.get(c.player_id)?.name ?? 'Player'} ${moneyK(c.dead_k)} (${c.dead_season})`).join(' · ')}</p>}
          </section>

          <aside className="kc-side">
            <section className="kc-card" aria-labelledby="df-h">
              <h2 id="df-h">Depth floor</h2>
              <p className="kc-sub">Fit players on each line. A club can’t be bought below these.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
                {LINES.map((l) => {
                  const n = club.fit[l], f = floorFor(s, l), at = n <= f;
                  return (
                    <div key={l} style={{ borderRadius: 12, padding: 12, background: at ? '#f3ebd9' : 'var(--sunk)', textAlign: 'center' }}>
                      <div className="eyebrow">{l}</div>
                      <div style={{ font: '600 22px var(--font)' }} className="num">{n}</div>
                      <div style={{ fontSize: 11, color: at ? '#6e5220' : 'var(--muted)' }}>floor {f}{at ? ' · protected' : ''}</div>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="kc-card" aria-labelledby="un-h">
              <h2 id="un-h">Not on contract · {uncontracted.length}</h2>
              <p className="kc-sub">This season’s draftees and non-keepers. They go back to the draft pool unless kept. Draft salaries: rookies $16k/$12k/$9k/$6k by round, non-rookies double.</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>{uncontracted.slice(0, 20).map((p) => p!.name).join(', ')}{uncontracted.length > 20 ? '…' : ''}</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
