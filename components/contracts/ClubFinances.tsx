// Clubhouse › Finances: the club's money in one place.
//  1. Cap: this season's salary against the keeper hard cap and in-season soft cap, with the cap-free rookie shown.
//  2. Investments: where KT has come from and gone, term deposits and loans.
//  3. Assistant coach: suggested moves (rules for now; the chat is a template until an AI key is added).
//  4. Rookie slot, cap simulator, money by line, cap runway, lock-in, draft budget and the token ledger.
import Link from 'next/link';
import { RunButton } from '@/components/contracts/client';
import { CapBar, CapSimulator, DepositForm, LoanForm, LoanRespond, RookieAssign, type SimPlayer } from '@/components/contracts/finance-client';
import { getContracts, kt, moneyK } from '@/lib/contracts';
import { createClient } from '@/lib/supabase/server';
import './contracts.css';

const LINE_COL: Record<string, string> = { MID: '#2f5d46', DEF: '#7fb08f', FWD: '#c9a04a', RUC: '#a9bcd3' };
type Ledger = { id: number; delta: number; reason: string; created_at: string };
type Deposit = { id: number; team_id: number; amount: number; rate_pct: number; season: number; status: string; created_at: string };
type Loan = { id: number; lender: number; borrower: number; amount: number; rate_pct: number; season: number; status: string; created_at: string };

const BUCKETS: [string, RegExp][] = [
  ['Starting bank', /starting bank/i], ['Sales and fees', /sold|transfer fee|compensation|received/i], ['Refunds', /refund/i],
  ['Players bought', /clause paid|won auction|offer held|trade: paid|matched/i], ['Deposits', /term deposit/i], ['Loans', /loan/i], ['Tax and fines', /tax|fine/i],
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
  const canManage = mine || !!d.me?.is_commish;
  const team = (id: number) => d.teams.find((t) => t.id === id)?.name ?? '—';
  const name = (pid: number) => d.players.get(pid)?.full_name ?? d.players.get(pid)?.name ?? `Player ${pid}`;
  const season = s.season;
  const contracts = d.contracts.filter((c) => c.team_id === teamId && (c.status === 'active' || c.status === 'pending'));
  const covers = (y: number) => contracts.filter((c) => c.start_season <= y && c.end_season >= y);

  // Cap
  const rookieNow = covers(season).find((c) => c.rookie_slot_season === season);
  const rookieNext = covers(season + 1).find((c) => c.rookie_slot_season === season + 1);
  const nextOver = club.nextSalary - club.keeperCapNext;
  const allow = club.deficitUsed ? 0 : s.deficit_max_k;

  // Investments
  const flows = new Map<string, number>();
  for (const l of ledger) flows.set(bucket(l.reason), (flows.get(bucket(l.reason)) ?? 0) + l.delta);
  const earned = ledger.filter((l) => l.delta > 0 && !/starting bank/i.test(l.reason)).reduce((t, l) => t + l.delta, 0);
  const spent = -ledger.filter((l) => l.delta < 0).reduce((t, l) => t + l.delta, 0);
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

  // Rookie slot candidates (10 or fewer games, contract covering next season or this season)
  const candidates = contracts.filter((c) => (d.players.get(c.player_id)?.career_games ?? 99) <= 10)
    .filter((c, i, a) => a.findIndex((x) => x.player_id === c.player_id) === i)
    .map((c) => ({ c, p: d.players.get(c.player_id), next: covers(season + 1).find((x) => x.player_id === c.player_id) }))
    .sort((a, b) => (b.next?.salary_k ?? 0) - (a.next?.salary_k ?? 0));

  // Money by line, runway
  const byLine = new Map<string, number>();
  for (const c of covers(season)) { if (c.rookie_slot_season === season) continue; const l = d.players.get(c.player_id)?.positions[0] ?? 'MID'; byLine.set(l, (byLine.get(l) ?? 0) + c.salary_k); }
  const lineTotal = [...byLine.values()].reduce((a, b) => a + b, 0) || 1;
  const top3 = covers(season).filter((c) => c.rookie_slot_season !== season).map((c) => c.salary_k).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  const rateTotal = d.active.filter((c) => c.team_id === teamId).reduce((t, c) => t + (d.rates.get(c.player_id) ?? 0), 0);
  const years = Array.from({ length: 5 }, (_, i) => season + i);
  const committed = years.map((y) => ({
    y, k: covers(y).filter((c) => c.rookie_slot_season !== y).reduce((a, c) => a + c.salary_k, 0) + d.contracts.filter((c) => c.team_id === teamId && c.dead_season === y).reduce((a, c) => a + c.dead_k, 0),
    cap: y === season + 1 ? club.keeperCapNext : s.keeper_cap_k,
  }));
  const emptySpots = Math.max(0, 33 - club.list.size);
  const draftBudget = Math.max(0, s.season_cap_k - club.salary - emptySpots * s.hold_back_k);

  // Simulator inputs
  const sim: SimPlayer[] = d.active.filter((c) => c.team_id === teamId).map((c) => {
    const p = d.players.get(c.player_id); const nx = covers(season + 1).find((x) => x.player_id === c.player_id);
    return { id: c.player_id, name: p?.full_name ?? p?.name ?? '', salary: c.salary_k, next: nx ? nx.salary_k : null, final: c.end_season <= season, games: p?.career_games ?? 99,
      rate: d.rates.get(c.player_id) ?? 0, rookieNow: c.rookie_slot_season === season, dead: Math.min(Math.floor(((c.end_season - season + 1) * c.salary_k) / 2), c.salary_k), homeGrown: c.home_grown };
  });

  // Assistant coach (rules for now)
  const tips: { t: string; d: string; v: string }[] = [];
  const bestRookie = candidates.find((x) => x.next && x.next.rookie_slot_season !== season + 1);
  if (!rookieNext && bestRookie?.next) tips.push({ t: `Make ${bestRookie.p?.name ?? 'him'} your ${season + 1} rookie keeper`, d: `${bestRookie.p?.career_games ?? 0} games, so he qualifies. His ${moneyK(bestRookie.next.salary_k)} comes off your ${season + 1} cap.`, v: `+${moneyK(bestRookie.next.salary_k)}` });
  if (nextOver > 0) {
    const cut = covers(season + 1).filter((c) => c.rookie_slot_season !== season + 1).sort((a, b) => ((d.rates.get(a.player_id) ?? 0) - a.salary_k) - ((d.rates.get(b.player_id) ?? 0) - b.salary_k))[0];
    if (cut) tips.push({ t: `Move on ${name(cut.player_id)}`, d: `Your most overpaid keeper: ${moneyK(cut.salary_k)} against a ${moneyK(d.rates.get(cut.player_id) ?? 0)} market value. Trade or release to clear ${s.season + 1} room.`, v: `+${moneyK(cut.salary_k)}` });
  }
  if (club.bank >= 2000 && !openDeps.length) tips.push({ t: 'Put idle KT to work', d: `A ${kt(Math.floor(club.bank / 2 / 100) * 100)} term deposit returns ${s.deposit_pct}% at season end.`, v: `+${kt(Math.floor((Math.floor(club.bank / 2 / 100) * 100 * s.deposit_pct) / 100))}` });

  return (
    <div className="kc-stack">
      <section className="kc-card fn-hero" aria-labelledby="cap-h">
        <div className="row-between"><h2 id="cap-h" className="eyebrow" style={{ margin: 0 }}>{season} salary cap</h2>
          <span className={`fn-pill ${club.salary > s.season_cap_k ? 'dn' : 'up'}`}>{moneyK(s.season_cap_k - club.salary)} room</span></div>
        <div className="fn-big"><b>{moneyK(club.salary)}</b><span>of {moneyK(s.season_cap_k)}</span></div>
        <CapBar salary={club.salary} rookie={rookieNow?.salary_k ?? 0} keeperCap={s.keeper_cap_k} seasonCap={s.season_cap_k} taxLine={s.tax_line_k} label="salary" />
        <div className="fn-kpis">
          <div><span>{season + 1} keepers</span><b className={nextOver > 0 ? 'dn' : ''}>{nextOver > 0 ? `${moneyK(nextOver)} over` : `${moneyK(-nextOver)} under`}</b></div>
          <div><span>Rookie slot</span><b className="brass">{rookieNow ? (d.players.get(rookieNow.player_id)?.name ?? '—') : 'Empty'}</b></div>
          <div><span>Bank</span><b>{kt(club.bank)}</b></div>
        </div>
      </section>

      {!mine ? <p className="kc-sub" style={{ margin: 0, textAlign: 'center' }}>The rest of {club.team.name}’s finances are private to their coach.</p> : <>
      <section className="kc-card" aria-labelledby="inv-h">
        <div className="row-between"><h2 id="inv-h">Investments</h2><span className="kc-sub">Paper tokens (KT)</span></div>
        <div className="fn-net"><div><span>Net worth</span><b>{kt(netWorth)}</b><em>bank + deposits + loans out − loans owed</em></div></div>
        <div className="fn-split">
          <div><span>Earned</span><b className="up">+{kt(earned)}</b></div>
          <div><span>Spent</span><b className="dn">−{kt(spent)}</b></div>
          <div><span>Locked</span><b>{kt(locked)}</b></div>
          <div><span>Lent out</span><b>{kt(lent.reduce((t, l) => t + l.amount, 0))}</b></div>
        </div>
        <div className="fn-flows">
          {BUCKETS.map(([b]) => b).concat('Other').filter((b) => flows.get(b)).map((b) => {
            const v = flows.get(b)!; const w = Math.min(100, (Math.abs(v) / Math.max(...[...flows.values()].map(Math.abs))) * 100);
            return <div key={b}><span>{b}</span><span className="fn-flowbar"><i className={v >= 0 ? 'up' : 'dn'} style={{ width: `${w}%` }} /></span><b className={v >= 0 ? 'up' : 'dn'}>{v >= 0 ? '+' : '−'}{Math.abs(v).toLocaleString('en-AU')}</b></div>;
          })}
        </div>

        <div className="fn-products">
          <div className="fn-product">
            <div className="row-between"><b>Term deposit</b><span className="fn-pill up">{s.deposit_pct}% p.s.</span></div>
            <p className="kc-sub">Lock KT until season end and get it back with {s.deposit_pct}% interest at rollover. You can’t touch it until then.</p>
            {openDeps.map((x) => <div key={x.id} className="kc-kv"><span>{kt(x.amount)} locked</span><strong className="kc-up">→ {kt(x.amount + Math.floor((x.amount * x.rate_pct) / 100))}</strong></div>)}
            {mine && <DepositForm bank={club.bank} rate={s.deposit_pct} />}
          </div>
          <div className="fn-product">
            <div className="row-between"><b>Loans</b><span className="fn-pill">up to {s.loan_max_pct}%</span></div>
            <p className="kc-sub">Lend KT to another club. They accept, the KT moves, and it’s repaid with interest at season end. Borrowers can go into the red.</p>
            {offersIn.map((l) => <div key={l.id} className="fn-loan"><span><b>{team(l.lender)}</b> offers {kt(l.amount)} at {l.rate_pct}%</span>{mine && <span style={{ display: 'flex', gap: 6 }}><LoanRespond id={l.id} accept label="Accept" /><LoanRespond id={l.id} accept={false} label="Decline" kind="plain" /></span>}</div>)}
            {offersOut.map((l) => <div key={l.id} className="fn-loan"><span>Offered {kt(l.amount)} to <b>{team(l.borrower)}</b> at {l.rate_pct}%</span>{mine && <LoanRespond id={l.id} accept={false} label="Withdraw" kind="plain" />}</div>)}
            {lent.map((l) => <div key={l.id} className="kc-kv"><span>Lent to {team(l.borrower)}</span><strong className="kc-up">{kt(l.amount + Math.floor((l.amount * l.rate_pct) / 100))} due</strong></div>)}
            {owed.map((l) => <div key={l.id} className="kc-kv"><span>Owed to {team(l.lender)}</span><strong className="kc-down">{kt(l.amount + Math.floor((l.amount * l.rate_pct) / 100))}</strong></div>)}
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

      <section className="kc-card" aria-labelledby="rk-h">
        <div className="row-between"><h2 id="rk-h">Rookie keeper slot</h2><span className="fn-pill brass">CAP-FREE</span></div>
        <p className="kc-sub">One player with 10 or fewer games. His contract doesn’t count to your cap for his keeper season.</p>
        <div className="kc-kv"><span>{season} rookie</span><strong>{rookieNow ? `${name(rookieNow.player_id)} · ${moneyK(rookieNow.salary_k)} off` : 'None'}</strong></div>
        <div className="kc-kv"><span>{season + 1} rookie</span><strong>{rookieNext ? `${name(rookieNext.player_id)} · ${moneyK(rookieNext.salary_k)} off` : 'Not set'}</strong></div>
        <div className="fn-rk">
          {candidates.length ? candidates.map(({ c, p, next }) => (
            <div key={c.player_id}>
              <span><b>{p?.full_name ?? p?.name}</b><small>{p?.positions.join('/')} · {p?.career_games ?? 0} games · {next ? `${moneyK(next.salary_k)} in ${season + 1}` : `no ${season + 1} contract yet`}</small></span>
              {canManage && next ? <RookieAssign playerId={c.player_id} season={season + 1} on={next.rookie_slot_season === season + 1} label={`Set for ${season + 1}`} /> : null}
            </div>
          )) : <p className="kc-sub">No one on your list has 10 or fewer games.</p>}
        </div>
      </section>

      <details className="kc-card fn-simbox" open>
        <summary><h2>Cap simulator</h2><span className="kc-sub">Test moves for your {season + 1} lock-in</span></summary>
        <CapSimulator players={sim} keeperCap={club.keeperCapNext} nextSalary={club.nextSalary} kept={club.keptNext} deficitMax={allow} homeGrownPct={s.home_grown_pct} seasonCap={s.season_cap_k} season={season} />
      </details>

      <section className="kc-card" aria-labelledby="ln-h">
        <div className="row-between"><h2 id="ln-h">Where the money goes</h2><span className="kc-sub">{season} by line</span></div>
        <div className="fn-stack">{[...byLine.entries()].sort((a, b) => b[1] - a[1]).map(([l, v]) => <i key={l} style={{ width: `${(v / lineTotal) * 100}%`, background: LINE_COL[l] ?? '#999' }} title={`${l} ${moneyK(v)}`} />)}</div>
        <div className="fn-leg">{[...byLine.entries()].sort((a, b) => b[1] - a[1]).map(([l, v]) => <span key={l}><i style={{ background: LINE_COL[l] ?? '#999' }} /><b>{l}</b> {moneyK(v)} · {Math.round((v / lineTotal) * 100)}%</span>)}</div>
        <div className="fn-split" style={{ marginTop: 12 }}>
          <div><span>Top 3 salaries</span><b>{moneyK(top3)} · {Math.round((top3 / Math.max(1, club.salary)) * 100)}%</b></div>
          <div><span>Value vs market</span><b className={rateTotal >= club.salary ? 'up' : 'dn'}>{rateTotal >= club.salary ? '+' : '−'}{moneyK(Math.abs(rateTotal - club.salary))}</b></div>
          <div><span>Dead money</span><b>{moneyK(club.dead)}</b></div>
          <div><span>Luxury tax</span><b>{club.taxKt ? kt(club.taxKt) : 'None'}</b></div>
        </div>
      </section>

      <section className="kc-card" aria-labelledby="yr-h">
        <div className="row-between"><h2 id="yr-h">Cap runway</h2><span className="kc-sub">Committed vs keeper cap</span></div>
        <div className="fn-runway">
          {committed.map(({ y, k, cap }) => (
            <div key={y}><b>{y}</b><span className="fn-rbar"><i className={k > cap ? 'dn' : ''} style={{ width: `${Math.min(100, (k / s.season_cap_k) * 100)}%` }} /><s style={{ left: `${(cap / s.season_cap_k) * 100}%` }} /></span><em>{moneyK(k)} <span>/ {moneyK(cap)}</span></em></div>
          ))}
        </div>
      </section>

      <div className="fn-two-col">
        <section className="kc-card" aria-labelledby="lk-h">
          <h2 id="lk-h">{season + 1} keeper lock-in</h2>
          <div style={{ marginTop: 8 }}>
            <div className="kc-kv"><span>Signed for {season + 1}</span><strong className={club.keptNext > 18 ? 'kc-down' : undefined}>{club.keptNext} / 17 + 1</strong></div>
            <div className="kc-kv"><span>Salary (rookie excluded)</span><strong>{moneyK(club.nextSalary)}</strong></div>
            <div className="kc-kv"><span>Keeper cap</span><strong>{moneyK(club.keeperCapNext)}</strong></div>
            <div className="kc-kv"><span>Deficit allowed</span><strong>{club.deficitUsed ? 'None (used last year)' : `Up to ${moneyK(s.deficit_max_k)}`}</strong></div>
          </div>
          <p className={`kc-msg ${nextOver <= 0 ? 'ok' : 'err'}`} style={{ marginTop: 10 }}>
            {nextOver <= 0 ? `Under the cap with ${moneyK(-nextOver)} spare.` : nextOver <= allow ? `${moneyK(nextOver)} over: allowed as a deficit, but ${season + 2}'s keeper cap drops by ${moneyK(nextOver)}.` : `${moneyK(nextOver)} over. Keep fewer, release, or let a final-year player walk.`}
          </p>
          {canManage && nextOver > 0 && nextOver <= allow && <div style={{ marginTop: 10 }}><RunButton run="lockin" id={teamId} small kind="dark" label="Lock in with deficit" confirmText={`Lock in ${moneyK(nextOver)} over? ${season + 2}'s keeper cap drops by that.`} /></div>}
        </section>
        <section className="kc-card" aria-labelledby="db-h">
          <h2 id="db-h">Draft budget</h2>
          <div className="kc-kv" style={{ borderTop: 0 }}><span>Season cap room</span><strong>{moneyK(s.season_cap_k - club.salary)}</strong></div>
          <div className="kc-kv"><span>Held back ({emptySpots} empty × {moneyK(s.hold_back_k)})</span><strong>−{moneyK(emptySpots * s.hold_back_k)}</strong></div>
          <div className="kc-kv"><span>To spend on draftees</span><strong className="kc-up">{moneyK(draftBudget)}</strong></div>
        </section>
      </div>

      <section className="kc-card" aria-labelledby="led-h">
        <div className="row-between"><h2 id="led-h">Token ledger · {kt(club.bank)}</h2><Link href="/contracts/market" className="kc-sub">Transfer market →</Link></div>
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
