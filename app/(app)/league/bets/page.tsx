import LEAGUE from '@/data/league.json';
import { Group, SubHead } from '@/components/LeagueSubpage';

export const metadata = { title: 'League bets' };

const C = LEAGUE.charter;

export default function LeagueBetsPage() {
  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SubHead eyebrow="Bets" title="League bets" sub="Side games, side bets and the fines kitty" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <Group title="Side games" rows={C.side_games.map((g, i) => {
          const [name, ...rest] = g.split(' (');
          return [name, rest.length ? rest.join(' (').replace(/\)$/, '') : '–'] as [string, string];
        })} />
        <Group title="Fines kitty" note="Fines fund the side-game prizes." rows={[
          ['Captain loophole', `$${C.fines.captain_loop}`],
          ['Zero on field loophole', `$${C.fines.zero_on_field_loop}`],
          ['Lopsided trade', `$${C.fines.lopsided_trade} per offence`],
        ]} />
        <Group title="Open bets" note="No side bets logged yet. Tell the commish and they'll go up here." rows={[]} />
      </div>
    </div>
  );
}
