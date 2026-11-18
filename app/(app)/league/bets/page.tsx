import LEAGUE from '@/data/league.json';
import { getLeagueProfile } from '@/lib/league-scope';
import { Group, SubHead } from '@/components/LeagueSubpage';
import { getMe } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { logBet, settleBet, saveFineRule, rerunFines, addFine, fineAction, pledgePrize, prizeAction } from './actions';
import { FINE_KINDS, fineLabel, type FineRule } from '@/lib/fines';
import { COMP_SEASON } from '@/lib/comps';

export const metadata = { title: 'Bets & fines' };
export const dynamic = 'force-dynamic';

const SEASONS = [2027, 2026];
const NICKS = ['Alex', 'Fyfey', 'Healz', 'Jr', 'Pato', 'Rammy', 'Sancho', 'Shaggy', 'Zac'];

type Bet = { id: number; season: number; category: string; subject: string; line: number | null; kind: 'over_under' | 'yes_no' | 'versus'; side_a_label: string; side_b_label: string; side_a: string[]; side_b: string[]; stake: string; result: 'a' | 'b' | 'push' | 'void' | null; actual: string | null; note: string | null; created_by: number };

function Side({ label, who, won, lost }: { label: string; who: string[]; won: boolean; lost: boolean }) {
  return (
    <div className={`bet-side${won ? ' won' : ''}${lost ? ' lost' : ''}`}>
      <span className="bet-side-k">{label}{won ? ' ✓' : ''}</span>
      <span>{who.length ? who.join(', ') : '–'}</span>
    </div>
  );
}

type Fine = { id: string; team_id: number; amount: number; reason: string; season: number; paid: boolean; round: number | null; rule_kind: string | null; prize: boolean; created_at: string };
type Prize = { id: number; season: number; label: string; kt: number; status: 'pledged' | 'paid' | 'cancelled'; team_id: number | null; paid_at: string | null };
type Bank = { sources: Record<string, number>; collected: number; paid: number; pledged: number; balance: number };
const SOURCES: [string, string][] = [['levy', 'Transfer levies (clauses, auctions)'], ['deficit', 'Over-cap deficit fees'], ['extension', 'Extension fees'], ['release', 'Release fees'], ['burned', 'Burned clause matches'], ['games', 'Mini game and comp pots (20% cut)']];
const TABS = [['bets', 'Bets'], ['fines', 'Fines'], ['bank', 'League bank']] as const;

export default async function LeagueBetsPage({ searchParams }: { searchParams: Promise<{ tab?: string; error?: string }> }) {
  const sp = await searchParams;
  const tab = (['bets', 'fines', 'bank'].includes(sp.tab ?? '') ? sp.tab : 'bets') as 'bets' | 'fines' | 'bank';
  const profile = await getLeagueProfile();
  const C = profile.charter;
  const me = await getMe();
  const supabase = await createClient();
  const q = await supabase.from('side_bets').select('*').order('id');
  const ready = !q.error;
  const bets = (q.data ?? []) as Bet[];
  const coach = me && !me.is_guest;
  const canSettle = (b: Bet) => !!me && (me.is_commish || b.created_by === me.team_id);

  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SubHead eyebrow="League" title="Bets & fines" sub={tab === 'bank' ? 'Every KT fee the league collects, and the prizes it pays for' : tab === 'fines' ? 'Automatic round fines and the kitty' : 'Charter section 5 · all bets are a single pint unless stated'} />
      <nav className="bf-tabs" aria-label="Bets and fines">
        {TABS.map(([k, l]) => <Link key={k} href={`/league/bets?tab=${k}`} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}
      </nav>
      {sp.error && <div role="alert" className="bf-alert">{sp.error}</div>}
      {tab === 'fines' && <FinesTab commish={!!me?.is_commish} />}
      {tab === 'bank' && <BankTab commish={!!me?.is_commish} />}
      {tab === 'bets' && <>
      <datalist id="nicks">{NICKS.map((n) => <option key={n} value={n} />)}</datalist>

      {coach && ready && (
        <form action={logBet} className="bet-form">
          <b style={{ fontSize: 15 }}>Log a side bet</b>
          <select name="kind" defaultValue="over_under" aria-label="Type">
            <option value="over_under">Over / under</option>
            <option value="yes_no">Yes / no</option>
            <option value="versus">Coach v coach</option>
          </select>
          <input name="category" list="cats" placeholder="Category (e.g. Fantasy points)" />
          <datalist id="cats">{['Fantasy points', 'Games played', 'Ladder position', 'To make finals', 'Other'].map((c) => <option key={c} value={c} />)}</datalist>
          <input name="subject" required minLength={2} maxLength={160} placeholder="Player or question (e.g. Max Hall)" />
          <input name="line" type="number" step="0.1" placeholder="Line (e.g. 80.5)" />
          <input name="side_a" required list="nicks" placeholder="Over / Yes / coach A (e.g. Fyfey, Pato)" />
          <input name="side_b" list="nicks" placeholder="Under / No / coach B" />
          <input name="stake" maxLength={80} placeholder="Stake (default: a pint)" />
          <select name="season" defaultValue="2027" aria-label="Season">{SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <button className="btn dark" type="submit">Add bet</button>
        </form>
      )}
      {!ready && <p className="muted" style={{ margin: 0 }}>Side bets go live once the commish runs the latest database update.</p>}

      {SEASONS.map((season) => {
        const list = bets.filter((b) => b.season === season);
        const cats = [...new Set(list.map((b) => b.category))];
        const open = list.filter((b) => !b.result).length;
        return (
          <section key={season} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 className="h2" style={{ fontSize: 22 }}>{season} side bets <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>{list.length ? `${list.length} bets · ${open} open` : ''}</span></h2>
            {list.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 14 }}>No bets yet. Get one on the board.</p>}
            {cats.map((cat) => (
              <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="eyebrow">{cat}</span>
                <div className="bet-list">
                  {list.filter((b) => b.category === cat).map((b) => (
                    <article key={b.id} className={`bet-card ${b.result ? 'done' : 'open'}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                        <b>{b.subject}{b.line != null && <span className="bet-line"> {Number(b.line)}</span>}</b>
                        <span className={`bet-status ${b.result ?? 'open'}`}>{!b.result ? 'Open' : b.result === 'void' ? 'Void' : b.result === 'push' ? 'Push' : `${b.result === 'a' ? b.side_a_label : b.side_b_label} wins`}</span>
                      </div>
                      <div className="bet-sides">
                        <Side label={b.side_a_label} who={b.side_a} won={b.result === 'a'} lost={b.result === 'b'} />
                        <Side label={b.side_b_label} who={b.side_b} won={b.result === 'b'} lost={b.result === 'a'} />
                      </div>
                      <span className="muted" style={{ fontSize: 12 }}>{b.stake}{b.actual ? ` · actual: ${b.actual}` : ''}</span>
                      {b.note && <span style={{ fontSize: 12, color: '#a87a22' }}>{b.note}</span>}
                      {canSettle(b) && (
                        <form action={settleBet} className="bet-actions">
                          <input type="hidden" name="id" value={b.id} />
                          {!b.result ? <>
                            <button name="how" value="a">{b.side_a_label} won</button>
                            <button name="how" value="b">{b.side_b_label} won</button>
                            <button name="how" value="push">Push</button>
                            <button name="how" value="void">Void</button>
                          </> : <button name="how" value="reopen">Reopen</button>}
                          <button name="how" value="delete" className="danger">Delete</button>
                        </form>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <Group title="Side games" rows={C.side_games.map((g) => {
          const [nm, ...rest] = g.split(' (');
          return [nm, rest.length ? rest.join(' (').replace(/\)$/, '') : '–'] as [string, string];
        })} />
        <Group title="Fines kitty" note="Fines fund the side-game prizes." rows={[
          ['Captain loophole', `$${C.fines.captain_loop}`],
          ['Zero on field loophole', `$${C.fines.zero_on_field_loop}`],
          ['Lopsided trade', `$${C.fines.lopsided_trade} per offence`],
        ]} />
      </div>
      </>}
    </div>
  );
}

async function teamNames() {
  const supabase = await createClient();
  const { data } = await supabase.from('teams').select('id, name, short_code, is_guest').order('name');
  return (data ?? []).filter((t) => !t.is_guest) as { id: number; name: string; short_code: string }[];
}

async function FinesTab({ commish }: { commish: boolean }) {
  const supabase = await createClient();
  const [rq, fq, lq, teams] = await Promise.all([
    supabase.from('fine_rules').select('*'),
    supabase.from('fines').select('*').eq('season', COMP_SEASON).order('created_at', { ascending: false }),
    supabase.from('score_rounds').select('round, locked_at').eq('comp', 'gtrain').not('locked_at', 'is', null).order('round', { ascending: false }),
    teamNames(),
  ]);
  if (rq.error) return <p className="muted">Fines go live once the latest database update is in.</p>;
  const rules = (rq.data ?? []) as FineRule[];
  const fines = (fq.data ?? []) as Fine[];
  const locked = (lq.data ?? []).map((r) => r.round as number);
  const name = (id: number) => teams.find((t) => t.id === id)?.name ?? `Club ${id}`;
  const kitty = fines.filter((f) => !f.prize && f.paid).reduce((a, f) => a + f.amount, 0) - fines.filter((f) => f.prize).reduce((a, f) => a + f.amount, 0);
  const unpaid = fines.filter((f) => !f.prize && !f.paid).reduce((a, f) => a + f.amount, 0);
  const owed = teams.map((t) => ({ t, n: fines.filter((f) => f.team_id === t.id && !f.prize && !f.paid).reduce((a, f) => a + f.amount, 0) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);

  return (
    <div className="bf-grid">
      <section className="card bf-card" aria-labelledby="fr-h">
        <div className="bf-h"><h2 id="fr-h">Automatic fines</h2><span className="eyebrow">{commish ? 'Commish only · posted when a round locks' : 'Posted when the commish locks a round'}</span></div>
        {FINE_KINDS.map((k) => {
          const r = rules.find((x) => x.kind === k.kind);
          const on = !!r?.active;
          return commish ? (
            <form key={k.kind} action={saveFineRule} className="bf-rule">
              <input type="hidden" name="kind" value={k.kind} />
              <span className="bf-rule-l">{k.label}{k.threshold && <> <input name="threshold" type="number" min={0} max={300} defaultValue={r?.threshold ?? k.threshold.def} className="bf-num" aria-label="Threshold" /></>}{k.prize && <em> prize, paid from the kitty</em>}</span>
              <span className="bf-rule-r">
                <span className="bf-amt">{k.prize ? '+$' : '$'}<input name="amount" type="number" min={1} max={1000} defaultValue={r?.amount ?? (k.kind === 'low_team' || k.prize ? 10 : 5)} className="bf-num" aria-label="Amount" /></span>
                <label className="bf-tog"><input type="checkbox" name="active" defaultChecked={on} /> On</label>
                <button className="btn">Save</button>
              </span>
            </form>
          ) : (
            <div key={k.kind} className="bf-rule">
              <span className="bf-rule-l">{fineLabel(k.kind, r?.threshold)}{k.prize && <em> prize</em>}</span>
              <span className="bf-rule-r">{r ? <><b className={k.prize ? 'bf-plus' : ''}>{k.prize ? '+' : ''}${r.amount}</b><span className={`bf-pill ${on ? 'on' : ''}`}>{on ? 'On' : 'Off'}</span></> : <span className="bf-pill">Off</span>}</span>
            </div>
          );
        })}
        {commish && (
          <div className="bf-acts">
            <form action={rerunFines} className="bf-inline">
              <select name="round" className="input" aria-label="Round" disabled={!locked.length}>{locked.length ? locked.map((r) => <option key={r} value={r}>Round {r} (locked)</option>) : <option>No locked rounds yet</option>}</select>
              <button className="btn" disabled={!locked.length}>Re-run fines</button>
            </form>
            <details className="bf-manual">
              <summary className="btn dark">＋ Manual fine</summary>
              <form action={addFine} className="bf-inline wrap">
                <select name="team" className="input" aria-label="Club">{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                <input name="amount" type="number" min={1} max={1000} placeholder="$" className="input bf-num" aria-label="Amount" required />
                <input name="reason" className="input" placeholder="Lopsided trade" maxLength={120} required aria-label="Reason" />
                <input name="round" type="number" min={0} max={30} placeholder="Rd" className="input bf-num" aria-label="Round" />
                <label className="bf-tog"><input type="checkbox" name="prize" /> Prize</label>
                <button className="btn dark">Add</button>
              </form>
            </details>
          </div>
        )}
      </section>

      <section className="card bf-card" aria-labelledby="fl-h">
        <div className="bf-h"><h2 id="fl-h">Fines ledger</h2><span className="eyebrow">Kitty ${kitty.toLocaleString()} · ${unpaid.toLocaleString()} unpaid</span></div>
        {owed.length > 0 && <div className="bf-owed">{owed.map(({ t, n }) => <span key={t.id}><b>{t.short_code}</b> owes ${n}</span>)}</div>}
        {!fines.length && <p className="muted" style={{ margin: 0, fontSize: 14 }}>No fines yet. Set the rules and they post when the commish locks each round.</p>}
        {fines.map((f) => (
          <div key={f.id} className="bf-row">
            <span><b>{name(f.team_id)}</b> · {f.reason}</span>
            <span className="bf-rule-r">
              {f.prize ? <b className="bf-plus">+${f.amount} prize</b> : <><b>${f.amount}</b><span className={`bf-pill ${f.paid ? 'on' : 'due'}`}>{f.paid ? 'Paid' : 'Unpaid'}</span></>}
              {commish && (
                <form action={fineAction} className="bf-mini">
                  <input type="hidden" name="id" value={f.id} />
                  {!f.prize && <button name="how" value={f.paid ? 'unpaid' : 'paid'}>{f.paid ? 'Undo' : 'Paid'}</button>}
                  <button name="how" value="delete" aria-label="Delete fine">✕</button>
                </form>
              )}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

async function BankTab({ commish }: { commish: boolean }) {
  const supabase = await createClient();
  const [bq, pq, teams] = await Promise.all([supabase.rpc('kc_league_bank'), supabase.from('bank_prizes').select('*').order('created_at', { ascending: false }), teamNames()]);
  if (bq.error) return <p className="muted">The league bank goes live once the latest database update is in.</p>;
  const b = (bq.data ?? { sources: {}, collected: 0, paid: 0, pledged: 0, balance: 0 }) as Bank;
  const prizes = ((pq.data ?? []) as Prize[]).filter((p) => p.status !== 'cancelled');
  const name = (id: number | null) => teams.find((t) => t.id === id)?.name ?? '–';
  const free = b.balance - b.pledged;
  return (
    <section className="card bf-card" aria-labelledby="bk-h">
      <h2 id="bk-h" className="sr-only">League bank</h2>
      <div className="bf-kpis">
        <div><span className="eyebrow">Bank balance</span><b>{b.balance.toLocaleString()} KT</b></div>
        <div><span className="eyebrow">Collected</span><b>{b.collected.toLocaleString()} KT</b></div>
        <div><span className="eyebrow">Pledged to prizes</span><b>{b.pledged.toLocaleString()} KT</b></div>
      </div>
      <span className="eyebrow">Where it came from</span>
      {SOURCES.map(([k, l]) => <div key={k} className="bf-row"><span>{l}</span><b>{(b.sources[k] ?? 0).toLocaleString()} KT</b></div>)}
      {b.paid > 0 && <div className="bf-row"><span>Paid out in prizes</span><b>−{b.paid.toLocaleString()} KT</b></div>}

      <span className="eyebrow" style={{ marginTop: 10 }}>Prizes</span>
      {!prizes.length && <p className="muted" style={{ margin: 0, fontSize: 14 }}>No prizes yet. {commish ? 'Pledge some of the bank to next year’s cup, flag or spoon.' : 'The commish can put the bank up as a prize for next season.'}</p>}
      {prizes.map((p) => (
        <div key={p.id} className="bf-row">
          <span><b>{p.season} {p.label}</b>{p.status === 'paid' ? ` · paid to ${name(p.team_id)}` : ''}</span>
          <span className="bf-rule-r">
            <b>{p.kt.toLocaleString()} KT</b><span className={`bf-pill ${p.status === 'paid' ? 'on' : 'pl'}`}>{p.status === 'paid' ? 'Paid' : 'Pledged'}</span>
            {commish && p.status === 'pledged' && (
              <form action={prizeAction} className="bf-mini">
                <input type="hidden" name="id" value={p.id} />
                <select name="team" aria-label="Winner">{teams.map((t) => <option key={t.id} value={t.id}>{t.short_code}</option>)}</select>
                <button name="how" value="pay">Pay out</button>
                <button name="how" value="cancel" aria-label="Cancel prize">✕</button>
              </form>
            )}
          </span>
        </div>
      ))}
      {commish && (
        <form action={pledgePrize} className="bf-inline wrap" style={{ marginTop: 8 }}>
          <select name="season" className="input" aria-label="Season" defaultValue={COMP_SEASON + 1}>{[COMP_SEASON, COMP_SEASON + 1].map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <input name="label" className="input" list="prize-names" placeholder="Knockout Cup winner" maxLength={80} required aria-label="Prize" />
          <datalist id="prize-names">{['Knockout Cup winner', 'Premiership', 'Minor premiers', 'Wooden spoon', 'Rookie Shield winner'].map((x) => <option key={x} value={x} />)}</datalist>
          <input name="kt" type="number" min={1} max={Math.max(1, free)} placeholder="KT" className="input bf-num" required aria-label="KT" />
          <button className="btn dark">Pledge prize</button>
        </form>
      )}
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>{free.toLocaleString()} KT free to pledge. When the prize is won, the commish pays it out and the KT lands in that club’s bank.</p>
    </section>
  );
}
