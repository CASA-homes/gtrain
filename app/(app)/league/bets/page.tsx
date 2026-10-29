import LEAGUE from '@/data/league.json';
import { Group, SubHead } from '@/components/LeagueSubpage';
import { getLeague, getMe } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { logBet, settleBet } from './actions';

export const metadata = { title: 'League bets' };
export const dynamic = 'force-dynamic';

const C = LEAGUE.charter;
const SEASONS = [2027, 2026];

type Bet = { id: number; season: number; title: string; team_a: number; team_b: number | null; stake: string; status: 'open' | 'settled' | 'void'; winner_id: number | null; created_by: number; created_at: string };

export default async function LeagueBetsPage() {
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  const supabase = await createClient();
  const q = await supabase.from('side_bets').select('*').order('created_at', { ascending: false });
  const ready = !q.error;
  const bets = (q.data ?? []) as Bet[];
  const name = (id: number | null) => (id ? league.teams.find((t) => t.id === id)?.name ?? '–' : 'The field');
  const coach = me && !me.is_guest;
  const canSettle = (b: Bet) => !!me && (me.is_commish || [b.team_a, b.team_b].includes(me.team_id));

  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SubHead eyebrow="Bets" title="League bets" sub="Side bets, side games and the fines kitty · a single pint unless stated" />

      {coach && ready && (
        <form action={logBet} className="bet-form">
          <b style={{ fontSize: 15 }}>Log a side bet</b>
          <input name="title" required minLength={3} maxLength={200} placeholder="e.g. Bodega finish above Muzza on the ladder" />
          <select name="opponent" defaultValue="">
            <option value="">Against… (or the whole league)</option>
            {league.teams.filter((t) => t.id !== me!.team_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input name="stake" maxLength={80} placeholder="Stake (default: a pint)" />
          <select name="season" defaultValue="2027">{SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <button className="btn dark" type="submit">Add bet</button>
        </form>
      )}
      {!ready && <p className="muted" style={{ margin: 0 }}>Side bets go live once the commish runs the latest database update.</p>}

      {SEASONS.map((season) => {
        const list = bets.filter((b) => b.season === season);
        return (
          <section key={season} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 className="h2" style={{ fontSize: 20 }}>{season} side bets <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>{list.length ? `${list.filter((b) => b.status === 'open').length} open · ${list.length} total` : ''}</span></h2>
            {list.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>{season === 2026 ? 'No 2026 side bets were recorded on the site. Tell the commish any that are still owed and they can go up here.' : 'No bets yet. Get one on the board.'}</p>
            ) : (
              <div className="bet-list">
                {list.map((b) => (
                  <article key={b.id} className={`bet-card ${b.status}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                      <b>{b.title}</b>
                      <span className="bet-status">{b.status === 'open' ? 'Open' : b.status === 'void' ? 'Void' : `${name(b.winner_id)} won`}</span>
                    </div>
                    <span className="muted" style={{ fontSize: 13 }}>{name(b.team_a)} v {name(b.team_b)} · {b.stake}</span>
                    {canSettle(b) && (
                      <form action={settleBet} className="bet-actions">
                        <input type="hidden" name="id" value={b.id} />
                        {b.status === 'open' ? <>
                          <button name="how" value={b.team_a}>{name(b.team_a)} won</button>
                          {b.team_b && <button name="how" value={b.team_b}>{name(b.team_b)} won</button>}
                          <button name="how" value="void">Void</button>
                        </> : <button name="how" value="reopen">Reopen</button>}
                        {(me!.is_commish || b.created_by === me!.team_id) && <button name="how" value="delete" className="danger">Delete</button>}
                      </form>
                    )}
                  </article>
                ))}
              </div>
            )}
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
