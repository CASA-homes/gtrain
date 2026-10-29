import LEAGUE from '@/data/league.json';
import { Group, SubHead } from '@/components/LeagueSubpage';
import { getMe } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { logBet, settleBet } from './actions';

export const metadata = { title: 'League bets' };
export const dynamic = 'force-dynamic';

const C = LEAGUE.charter;
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

export default async function LeagueBetsPage() {
  const me = await getMe();
  const supabase = await createClient();
  const q = await supabase.from('side_bets').select('*').order('id');
  const ready = !q.error;
  const bets = (q.data ?? []) as Bet[];
  const coach = me && !me.is_guest;
  const canSettle = (b: Bet) => !!me && (me.is_commish || b.created_by === me.team_id);

  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SubHead eyebrow="Bets" title="League bets" sub="Charter section 5 · all bets are a single pint unless stated" />
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
    </div>
  );
}
