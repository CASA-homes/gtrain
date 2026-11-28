// Clubhouse › Finances: the club's money in one place.
//  1. Cap: this season's salary against the keeper hard cap and in-season soft cap, with the cap-free rookie shown.
//     Other coaches see only this panel.
//     A "Future seasons" toggle on the cap card shows committed salary against the keeper cap for 5 seasons.
//  2. Your bank: available KT, shares, savings, offers, loans and net worth, beside the cap card.
//  3. Finances overview: Stock ownership (default), Transactions, Investments and Loans tabs.
//  4. Assistant coach, cap simulator, money by line, lock-in, draft budget and the token ledger.
//  The rookie slot itself is set on the Contracts tab (this season only, before drop day).
import Link from 'next/link';
import { RunButton } from '@/components/contracts/client';
import { CapBar, CapSimulator, CollectDeposits, DepositForm, LoanForm, LoanRespond, type SimPlayer } from '@/components/contracts/finance-client';
import { getContracts, kt, moneyK, playerAge, releaseCost } from '@/lib/contracts';
import { keeperLabel, keeperSpots } from '@/lib/keepers';
import { createClient } from '@/lib/supabase/server';
import './contracts.css';

const LINE_COL: Record<string, string> = { MID: '#2f5d46', DEF: '#7fb08f', FWD: '#c9a04a', RUC: '#a9bcd3' };
type Ledger = { id: number; delta: number; reason: string; created_at: string };
type Deposit = { id: number; team_id: number; amount: number; rate_pct: number; season: number; status: string; created_at: string; term_months?: number; matures_at?: string | null };
type Loan = { id: number; lender: number; borrower: number; amount: number; rate_pct: number; season: number; status: string; created_at: string };

const BUCKETS: [string, RegExp][] = [
  ['Starting bank', /starting bank/i], ['Sales and fees', /sold|transfer fee|compensation|received/i], ['Refunds', /refund/i],
  ['Players bought', /clause paid|won auction|offer held|trade: paid|matched/i], ['Deposits', /term deposit/i], ['Loans', /loan/i], ['Fees and fines', /fee|fine/i],
];
const bucket = (r: string) => BUCKETS.find(([, re]) => re.test(r))?.[0] ?? 'Other';

export async function ClubFinances({ teamId }: { teamId: number }) {
  const d = await getContracts();
  const s = d.settings;
  const club = d.clubs.get(teamId);
  if (!s || !d.ready || !club) return <section className="kc-card brass"><h2>Contracts aren’t set up yet</h2><p className="kc-sub">Finances appear once the commish starts the shadow season.</p></section>;
  const supabase = await createClient();
  const [{ data: ledgerQ }, { data: depQ }, { data: loanQ }] = await Promise.all([
    supabase.from('kc_ledger').select('id, delta, reason, created_at').eq('team_id', teamId).order('created_at', { ascending: false }).limit(300),
    supabase.from('kc_deposits').select('*').eq('team_id', teamId).order('created_at', { ascending: false }),
    supabase.from('kc_loans').select('*').or(`lender.eq.${teamId},borrower.eq.${teamId}`).order('created_at', { ascending: false }),
  ]);
  const ledger = (ledgerQ ?? []) as Ledger[];
  const deposits = (depQ ?? []) as Deposit[];
  const loans = (loanQ ?? []) as Loan[];
  const mine = !!d.me && !d.me.is_guest && d.me.team_id === teamId;
  const canManage = mine;
  const team = (id: number) => d.teams.find((t) => t.id === id)?.name ?? '—';
  const name = (pid: number) => d.players.get(pid)?.full_name ?? d.players.get(pid)?.name ?? `Player ${pid}`;
  const season = s.season;
  const deadThisSeason = club.dead + d.deadLater.filter((x) => x.team_id === club.team.id && x.season === season).reduce((a, x) => a + x.amount_k, 0);
  const contracts = d.contracts.filter((c) => c.team_id === teamId && (c.status === 'active' || c.status === 'pending'));
  const covers = (y: number) => contracts.filter((c) => c.start_season <= y && c.end_season >= y);

  // Cap
  const rookieNow = covers(season).find((c) => c.rookie_slot_season === season);
  // Deadline day checks the coming season against the keeper cap.
  const nextOver = club.salary - club.keeperCapNow;
  const allow = club.deficitUsed ? 0 : s.deficit_max_k;

  // Investments
  const flows = new Map<string, number>();
  for (const l of ledger) flows.set(bucket(l.reason), (flows.get(bucket(l.reason)) ?? 0) + l.delta);
  const openDeps = deposits.filter((x) => x.status === 'open');
  const locked = openDeps.reduce((t, x) => t + x.amount, 0);
  const depReturn = openDeps.reduce((t, x) => t + Math.floor((x.amount * x.rate_pct) / 100), 0);
  const lent = loans.filter((l) => l.status === 'active' && l.lender === teamId);
  const owed = loans.filter((l) => l.status === 'active' && l.borrower === teamId);
  const dueBack = lent.reduce((t, l) => t + l.amount + Math.floor((l.amount * l.rate_pct) / 100), 0);
  const dueOut = owed.reduce((t, l) => t + l.amount + Math.floor((l.amount * l.rate_pct) / 100), 0);
  const offersIn = loans.filter((l) => l.status === 'offered' && l.borrower === teamId);
  const offersOut = loans.filter((l) => l.status === 'offered' && l.lender === teamId);
  const netWorth = club.bank + locked + depReturn + dueBack - dueOut;
  const heldInOffers = d.myOffers.reduce((t, o) => t + (o.sweet_kt ?? 0), 0);
  const earned = ledger.filter((l) => l.delta > 0).reduce((t, l) => t + l.delta, 0);
  const spent = -ledger.filter((l) => l.delta < 0).reduce((t, l) => t + l.delta, 0);
  // Running balance after each entry (newest first), working back from the bank.
  const balAfter: number[] = []; { let b = club.bank; for (const l of ledger) { balAfter.push(b); b -= l.delta; } }
  const setupNow = !!s.setup_until && new Date(s.setup_until) > new Date();
  const buysLeft = Math.max(0, s.max_buys - d.claims.filter((c) => c.buyer_team === teamId && c.status !== 'cancelled' && (!s.window_opened_at || c.created_at >= s.window_opened_at)).length);

  // Rookie slot candidates: 10 or fewer games, contract covering this season.
  const rookieLocked = !!s.rookie_lock_at && new Date(s.rookie_lock_at) <= new Date();
  const candidates = covers(season).filter((c) => (d.players.get(c.player_id)?.career_games ?? 99) <= 10).sort((a, b) => b.salary_k - a.salary_k);

  // Money by line, runway
  const byLine = new Map<string, number>();
  for (const c of covers(season)) { if (c.rookie_slot_season === season) continue; const l = d.players.get(c.player_id)?.positions[0] ?? 'MID'; byLine.set(l, (byLine.get(l) ?? 0) + c.salary_k); }
  const lineTotal = [...byLine.values()].reduce((a, b) => a + b, 0) || 1;
  const top3 = covers(season).filter((c) => c.rookie_slot_season !== season).map((c) => c.salary_k).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  const rateTotal = d.active.filter((c) => c.team_id === teamId).reduce((t, c) => t + (d.rates.get(c.player_id) ?? 0), 0);
  const years = Array.from({ length: 5 }, (_, i) => season + i);
  const committed = years.map((y) => ({
    y, k: covers(y).filter((c) => c.rookie_slot_season !== y).reduce((a, c) => a + c.salary_k, 0) + d.contracts.filter((c) => c.team_id === teamId && c.dead_season === y).reduce((a, c) => a + c.dead_k, 0)
      + d.deadLater.filter((x) => x.team_id === teamId && x.season === y).reduce((a, x) => a + x.amount_k, 0),
    cap: y === season ? club.keeperCapNow : y === season + 1 ? club.keeperCapNext : s.keeper_cap_k,
  }));
  const emptySpots = Math.max(0, 33 - club.list.size);
  const draftBudget = Math.max(0, s.season_cap_k - club.salary - emptySpots * s.hold_back_k);

  // Simulator inputs
  const sim: SimPlayer[] = d.active.filter((c) => c.team_id === teamId).map((c) => {
    const p = d.players.get(c.player_id); const nx = covers(season + 1).find((x) => x.player_id === c.player_id);
    const ext = d.pending.find((x) => x.player_id === c.player_id && x.team_id === teamId);
    const rc = releaseCost(s, c); const rate = d.rates.get(c.player_id) ?? 0;
    return { id: c.player_id, name: p?.full_name ?? p?.name ?? '', pos: p?.positions.join('/') ?? '', age: playerAge(p),
      cur: c.rookie_slot_season === season ? 0 : c.salary_k, next: nx ? nx.salary_k : null, end: ext ? ext.end_season : c.end_season,
      final: false, rate, deadNow: rc.now, deadLater: rc.later, fee: rc.fee, extPrice: 0 };
  });
  // Out of contract on the list: off by default; switch on to sign him at his market value.
  const contractedIds = new Set(sim.map((x) => x.id));
  for (const id of club.list) {
    if (contractedIds.has(id)) continue;
    const p = d.players.get(id); const rate = d.rates.get(id) ?? 0;
    sim.push({ id, name: p?.full_name ?? p?.name ?? '', pos: p?.positions.join('/') ?? '', age: playerAge(p), cur: 0, next: null, end: season,
      final: true, rate, deadNow: 0, deadLater: 0, fee: 0, extPrice: Math.round(rate * 1.03) });
  }

  // Assistant coach (rules for now)
  const tips: { t: string; d: string; v: string }[] = [];
  const bestRookie = candidates[0];
  if (!rookieNow && !rookieLocked && bestRookie) tips.push({ t: `Make ${name(bestRookie.player_id)} your ${season} rookie`, d: `${d.players.get(bestRookie.player_id)?.career_games ?? 0} games, so he qualifies. His ${moneyK(bestRookie.salary_k)} comes off your cap this season. Set it on the Contracts tab before drop day.`, v: `+${moneyK(bestRookie.salary_k)}` });
  if (nextOver > 0) {
    const cut = covers(season + 1).filter((c) => c.rookie_slot_season !== season + 1).sort((a, b) => ((d.rates.get(a.player_id) ?? 0) - a.salary_k) - ((d.rates.get(b.player_id) ?? 0) - b.salary_k))[0];
    if (cut) tips.push({ t: `Move on ${name(cut.player_id)}`, d: `Your most overpaid keeper: ${moneyK(cut.salary_k)} against a ${moneyK(d.rates.get(cut.player_id) ?? 0)} market value. Trade or release to clear ${s.season + 1} room.`, v: `+${moneyK(cut.salary_k)}` });
  }
  if (club.bank >= 200 && !openDeps.length) tips.push({ t: 'Put idle KT to work', d: `A ${kt(Math.floor(club.bank / 2))} one-year term deposit returns 10%.`, v: `+${kt(Math.floor((Math.floor(club.bank / 2) * 10) / 100))}` });

  return (
    <div className="kc-stack fin-page">
      <div className={`fn-top${mine ? ' two' : ''}`}>
      <section className="kc-card fn-hero fn-capcard" aria-labelledby="cap-h">
        <input type="radio" name="fn-cap" id="fn-c1" defaultChecked hidden />
        <input type="radio" name="fn-cap" id="fn-c2" hidden />
        <div className="fn-caphead">
          <h2 id="cap-h" className="eyebrow" style={{ margin: 0 }}>{season} salary cap</h2>
          {mine && <div className="fn-capseg" role="tablist" aria-label="Cap view"><label htmlFor="fn-c1" role="tab">This season</label><label htmlFor="fn-c2" role="tab">Future seasons</label></div>}
          <span className={`fn-pill ${club.salary > s.season_cap_k ? 'dn' : 'up'}`}>{moneyK(s.season_cap_k - club.salary)} room</span>
        </div>
        <div className="fn-cap1">
          <div className="fn-big"><b>{moneyK(club.salary)}</b><span>of {moneyK(s.season_cap_k)}</span></div>
          <CapBar salary={club.salary} rookie={rookieNow?.salary_k ?? 0} keeperCap={s.keeper_cap_k} seasonCap={s.season_cap_k} taxLine={s.tax_line_k} label="salary" dead={deadThisSeason} />
          <div className="fn-kpis">
            <div><span>{season} keepers</span><b className={nextOver > 0 ? 'dn' : ''}>{nextOver > 0 ? `${moneyK(nextOver)} over` : `${moneyK(-nextOver)} under`}</b></div>
            <div><span>Rookie slot</span><b className="brass">{rookieNow ? (d.players.get(rookieNow.player_id)?.name ?? '—') : 'Empty'}{canManage && !rookieLocked && <> · <Link href={`/clubhouse/${teamId}?view=contracts#rookie`} className="fn-set">{rookieNow ? 'Change' : 'Set'}</Link></>}</b></div>
            <div><span>Squad value</span><b className={rateTotal >= club.salary ? '' : 'dn'}>{moneyK(rateTotal)}</b></div>
          </div>
        </div>
        {mine && (
          <div className="fn-cap2">
            <div className="row-between kc-sub"><span>Committed salary against the keeper cap</span><span>5 seasons</span></div>
            <div className="fn-runway">
              {committed.map(({ y, k, cap }) => (
                <div key={y}><b>{y}</b><span className="fn-rbar"><i className={k > cap ? 'dn' : ''} style={{ width: `${Math.min(100, (k / s.season_cap_k) * 100)}%` }} /><s style={{ left: `${(cap / s.season_cap_k) * 100}%` }} /></span><em>{moneyK(k)} <span>/ {moneyK(cap)}</span></em></div>
              ))}
            </div>
          </div>
        )}
      </section>

      {mine && (
      <section className="kc-card fn-bank" aria-labelledby="bk-h">
        <div className="row-between"><h2 id="bk-h">Your bank</h2><span className="kc-sub">1 KT = $1k</span></div>
        <div className="fn-bank-big"><b>{kt(club.bank)}</b><span>available to spend</span></div>
        <div className="fn-bank-grid three">
          <div><span>Invested</span><b>{kt(0)}</b><em>Shares open soon</em></div>
          <div><span>Savings</span><b>{kt(locked)}</b><em>{openDeps.length ? `${openDeps.length} deposit${openDeps.length > 1 ? 's' : ''} · +${kt(depReturn)} due` : 'No deposits'}</em></div>
          <div><span>Held in offers</span><b>{kt(heldInOffers)}</b><em>{d.myOffers.length ? `${d.myOffers.length} free-agent offer${d.myOffers.length > 1 ? 's' : ''}` : 'No offers tabled'}</em></div>
          <div><span>Lent out</span><b className={dueBack ? 'up' : ''}>{kt(dueBack)}</b><em>{lent.length ? 'back with interest' : 'No loans out'}</em></div>
          <div><span>Debts</span><b className={dueOut ? 'dn' : ''}>{dueOut ? `−${kt(dueOut)}` : kt(0)}</b><em>{owed.length ? `${owed.length} loan${owed.length > 1 ? 's' : ''} · due season end` : 'Nothing owed'}</em></div>
          <div className="nw"><span>Net worth</span><b>{kt(netWorth)}</b><em>bank + savings + lent − debts</em></div>
        </div>
        <p className="fn-bank-note row-between"><span>Clause buys: {buysLeft} of {s.max_buys} left this window · extensions cost {kt(s.ext_fee_kt)}{setupNow ? ' (free until deadline day)' : ''}</span><span style={{ display: 'flex', gap: 12 }}>{d.me?.is_commish && <Link href="/contracts/admin#rf-h">Commish: reset finances →</Link>}<Link href="/market">Trademarket →</Link></span></p>
      </section>
      )}
      </div>

      {!mine ? <p className="kc-sub" style={{ margin: 0, textAlign: 'center' }}>The rest of {club.team.name}’s finances are private to their coach.</p> : <>

      <section className="kc-card fn-tabs fn-overview" aria-labelledby="ov-h">
        <input type="radio" name="fn-tab" id="fn-t4" defaultChecked hidden />
        <input type="radio" name="fn-tab" id="fn-t1" hidden />
        <input type="radio" name="fn-tab" id="fn-t2" hidden />
        <input type="radio" name="fn-tab" id="fn-t3" hidden />
        <div className="fn-ovhead">
          <h2 id="ov-h">Finances overview</h2>
          <div className="fn-tabbar" role="tablist">
            <label htmlFor="fn-t4" role="tab">Stock ownership</label>
            <label htmlFor="fn-t1" role="tab">Transactions</label>
            <label htmlFor="fn-t2" role="tab">Investments</label>
            <label htmlFor="fn-t3" role="tab">Loans{offersIn.length ? <i>{offersIn.length}</i> : null}</label>
          </div>
        </div>

        <div className="fn-pane fn-p4">
          <div className="fn-split four">
            <div><span>Portfolio value</span><b>{kt(0)}</b></div>
            <div><span>You paid</span><b>{kt(0)}</b></div>
            <div><span>Gain</span><b>{kt(0)}</b></div>
            <div><span>If you sold all today</span><b>{kt(0)}</b></div>
          </div>
          <div className="fn-stock-empty">
            <b>No shares yet</b>
            <p>Soon you’ll be able to buy shares in any player with KT: 10 shares per player, up to 5 each. Each share costs his market value, so your shares rise and fall with his form. Sell any time; 10% of the sale goes to the league. Your shares will show here with what you paid, what they’re worth now and your profit.</p>
            <Link href="/market" className="kc-btn small">Browse the player market</Link>
          </div>
        </div>

        <div className="fn-pane fn-p1">
          <div className="fn-split">
            <div><span>Earned</span><b className="up">+{kt(earned)}</b></div>
            <div><span>Spent</span><b className="dn">−{kt(spent)}</b></div>
          </div>
          <div className="kc-ledger fn-ledger">
            {ledger.length ? ledger.map((l, i) => (
              <div key={l.id}><span className="muted">{new Date(l.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span><span>{l.reason}</span><b className={l.delta >= 0 ? 'kc-up' : 'kc-down'}>{l.delta >= 0 ? '+' : '−'}{Math.abs(l.delta).toLocaleString('en-AU')}</b><em>{balAfter[i].toLocaleString('en-AU')}</em></div>
            )) : <p className="kc-sub">No KT moves yet.</p>}
          </div>
        </div>

        <div className="fn-pane fn-p2">
          <div className="fn-net"><div><span>Net worth</span><b>{kt(netWorth)}</b><em>bank + deposits + loans out − loans owed</em></div></div>
          <div className="fn-split">
            <div><span>In the bank</span><b>{kt(club.bank)}</b></div>
            <div><span>Locked in deposits</span><b>{kt(locked)}</b></div>
          </div>
          <div className="fn-product" style={{ marginTop: 12 }}>
            <div className="row-between"><b>Term deposits</b><span className="fn-pill up">4–25%</span></div>
            <p className="kc-sub">Lock KT away for 6 months (+4%), 1 year (+10%) or 2 years (+25%). You can’t touch it until it matures; the longer you lock it, the better the return.</p>
            {deposits.length ? deposits.map((x) => (
              <div key={x.id} className="fn-dep">
                <span><b>{kt(x.amount)}</b><small>{x.status === 'open' ? `${x.term_months === 6 ? '6 months' : x.term_months === 24 ? '2 years' : '1 year'} · ${x.matures_at ? (new Date(x.matures_at) <= new Date() ? 'matured' : `matures ${new Date(x.matures_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`) : `released at end of ${x.season}`}` : 'Paid out'}</small></span>
                {mine && x.status === 'open' && x.matures_at && new Date(x.matures_at) <= new Date() && <CollectDeposits />}
                <strong className={x.status === 'open' ? 'kc-up' : undefined}>{x.status === 'open' ? '→ ' : ''}{kt(x.amount + Math.floor((x.amount * x.rate_pct) / 100))}<small>+{x.rate_pct}%</small></strong>
              </div>
            )) : <p className="kc-sub" style={{ margin: '6px 0' }}>No deposits yet.</p>}
            {mine && <DepositForm bank={club.bank} />}
          </div>
        </div>

        <div className="fn-pane fn-p3">
          <div className="fn-split">
            <div><span>Lent out</span><b className="up">{kt(lent.reduce((t, l) => t + l.amount, 0))}</b></div>
            <div><span>Owed</span><b className={owed.length ? 'dn' : ''}>{kt(owed.reduce((t, l) => t + l.amount, 0))}</b></div>
          </div>
          <div className="fn-product" style={{ marginTop: 12 }}>
            <div className="row-between"><b>Loans</b><span className="fn-pill">up to {s.loan_max_pct}%</span></div>
            <p className="kc-sub">Lend KT to another club. They accept, the KT moves, and it’s repaid with interest at season end. Borrowers can go into the red.</p>
            {offersIn.map((l) => <div key={l.id} className="fn-loan"><span><b>{team(l.lender)}</b> offers {kt(l.amount)} at {l.rate_pct}%</span>{mine && <span style={{ display: 'flex', gap: 6 }}><LoanRespond id={l.id} accept label="Accept" /><LoanRespond id={l.id} accept={false} label="Decline" kind="plain" /></span>}</div>)}
            {offersOut.map((l) => <div key={l.id} className="fn-loan"><span>Offered {kt(l.amount)} to <b>{team(l.borrower)}</b> at {l.rate_pct}%</span>{mine && <LoanRespond id={l.id} accept={false} label="Withdraw" kind="plain" />}</div>)}
            {lent.map((l) => <div key={l.id} className="kc-kv"><span>Lent to {team(l.borrower)} · repaid end of {l.season}</span><strong className="kc-up">{kt(l.amount + Math.floor((l.amount * l.rate_pct) / 100))} due</strong></div>)}
            {owed.map((l) => <div key={l.id} className="kc-kv"><span>Owed to {team(l.lender)} · due end of {l.season}</span><strong className="kc-down">{kt(l.amount + Math.floor((l.amount * l.rate_pct) / 100))}</strong></div>)}
            {loans.filter((l) => l.status === 'repaid').map((l) => <div key={l.id} className="kc-kv"><span className="muted">{l.lender === teamId ? `Lent to ${team(l.borrower)}` : `Borrowed from ${team(l.lender)}`} · repaid</span><strong className="muted">{kt(l.amount)}</strong></div>)}
            {!offersIn.length && !offersOut.length && !lent.length && !owed.length && <p className="kc-sub" style={{ margin: '6px 0' }}>No loans.</p>}
            {mine && <LoanForm bank={club.bank} teams={d.teams.filter((t) => t.id !== teamId).map((t) => ({ id: t.id, name: t.name }))} maxRate={s.loan_max_pct} />}
          </div>
        </div>
      </section>

      <section className="kc-card fn-coach" aria-labelledby="ac-h">
        <div className="fn-coach-head"><span className="fn-ac">AC</span><div><h2 id="ac-h">Assistant coach</h2><span className="kc-sub">{tips.length ? `${tips.length} suggestion${tips.length > 1 ? 's' : ''} for your cap` : 'Nothing urgent. Your cap is in good shape.'}</span></div></div>
        {tips.map((t) => (
          <div key={t.t} className="fn-tip"><b>{t.t}</b><em>{t.v}</em><p>{t.d}</p></div>
        ))}
        <div className="fn-ask" aria-disabled="true"><span>Ask: “Can I fit Daicos next year?”</span><em>Chat coming soon</em></div>
      </section>

      <details className="kc-card fn-simbox" open>
        <summary><h2>Cap simulator</h2><span className="kc-sub">Test moves for your {season + 1} lock-in</span></summary>
        <CapSimulator players={sim} keeperCap={club.keeperCapNow} seasonCap={s.season_cap_k} salaryNow={club.salary} nextSalary={club.nextSalary} kept={club.keptNow} deficitMax={allow} season={season} bank={club.bank} deadNow={deadThisSeason} />
      </details>

      <section className="kc-card" aria-labelledby="ln-h">
        <div className="row-between"><h2 id="ln-h">Where the money goes</h2><span className="kc-sub">{season} by line</span></div>
        <div className="fn-stack">{[...byLine.entries()].sort((a, b) => b[1] - a[1]).map(([l, v]) => <i key={l} style={{ width: `${(v / lineTotal) * 100}%`, background: LINE_COL[l] ?? '#999' }} title={`${l} ${moneyK(v)}`} />)}</div>
        <div className="fn-leg">{[...byLine.entries()].sort((a, b) => b[1] - a[1]).map(([l, v]) => <span key={l}><i style={{ background: LINE_COL[l] ?? '#999' }} /><b>{l}</b> {moneyK(v)} · {Math.round((v / lineTotal) * 100)}%</span>)}</div>
        <div className="fn-split" style={{ marginTop: 12 }}>
          <div><span>Top 3 salaries</span><b>{moneyK(top3)} · {Math.round((top3 / Math.max(1, club.salary)) * 100)}%</b></div>
          <div><span>Value vs market</span><b className={rateTotal >= club.salary ? 'up' : 'dn'}>{rateTotal >= club.salary ? '+' : '−'}{moneyK(Math.abs(rateTotal - club.salary))}</b></div>
          <div><span>Dead money</span><b>{moneyK(club.dead)}</b></div>
        </div>
      </section>


      <div className="fn-two-col">
        <section className="kc-card" aria-labelledby="lk-h">
          <h2 id="lk-h">{season + 1} keeper lock-in</h2>
          <div style={{ marginTop: 8 }}>
            <div className="kc-kv"><span>Signed for {season}</span><strong className={club.keptNow > keeperSpots(s) ? 'kc-down' : undefined}>{club.keptNow} / {keeperLabel(s)}</strong></div>
            <div className="kc-kv"><span>Salary (rookie excluded)</span><strong>{moneyK(club.salary)}</strong></div>
            <div className="kc-kv"><span>Keeper cap</span><strong>{moneyK(club.keeperCapNow)}</strong></div>
            <div className="kc-kv"><span>Deficit allowed</span><strong>{club.deficitUsed ? 'None (used last year)' : `Up to ${moneyK(s.deficit_max_k)}`}</strong></div>
          </div>
          <p className={`kc-msg ${nextOver <= 0 ? 'ok' : 'err'}`} style={{ marginTop: 10 }}>
            {nextOver <= 0 ? `Under the cap with ${moneyK(-nextOver)} spare.` : nextOver <= allow ? `⚠ ${moneyK(nextOver)} over. On deadline day (17 Feb) you can carry it as a deficit for ${kt(s.deficit_fee_kt)}, and ${season + 2}'s keeper cap drops by ${moneyK(nextOver)}.` : `⚠ ${moneyK(nextOver)} over. The most you can carry is ${moneyK(allow)}. Release, trade or sell a player before deadline day (17 Feb), or the commish will release one.`}
          </p>
          {canManage && nextOver > 0 && nextOver <= allow && <div style={{ marginTop: 10 }}><RunButton run="lockin" id={teamId} small kind="dark" label={`Take the deficit · ${kt(s.deficit_fee_kt)}`} confirmText={`Carry ${moneyK(nextOver)} over as a deficit? It costs ${kt(s.deficit_fee_kt)} and ${season + 2}'s keeper cap drops by ${moneyK(nextOver)}.`} /></div>}
        </section>
        <section className="kc-card" aria-labelledby="db-h">
          <h2 id="db-h">Draft budget</h2>
          <div className="kc-kv" style={{ borderTop: 0 }}><span>Season cap room</span><strong>{moneyK(s.season_cap_k - club.salary)}</strong></div>
          <div className="kc-kv"><span>Held back ({emptySpots} empty × {moneyK(s.hold_back_k)})</span><strong>−{moneyK(emptySpots * s.hold_back_k)}</strong></div>
          <div className="kc-kv"><span>To spend on draftees</span><strong className="kc-up">{moneyK(draftBudget)}</strong></div>
        </section>
      </div>

      <section className="kc-card" aria-labelledby="led-h">
        <div className="row-between"><h2 id="led-h">Token ledger · {kt(club.bank)}</h2><Link href="/market" className="kc-sub">Trademarket →</Link></div>
        <div className="kc-ledger">
          {ledger.slice(0, 40).map((l) => (
            <div key={l.id}><span className="muted">{new Date(l.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span><span>{l.reason}</span><b className={l.delta >= 0 ? 'kc-up' : 'kc-down'}>{l.delta >= 0 ? '+' : '−'}{Math.abs(l.delta).toLocaleString('en-AU')}</b></div>
          ))}
          {!ledger.length && <p className="kc-sub">No movements yet.</p>}
        </div>
      </section>
      </>}
    </div>
  );
}
