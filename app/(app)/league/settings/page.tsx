import LEAGUE from '@/data/league.json';
import { Group, SubHead } from '@/components/LeagueSubpage';

export const metadata = { title: 'League settings' };

const C = LEAGUE.charter;
const soon = <span style={{ font: '600 11px var(--mono)', color: '#a87a22', background: '#fbf3dc', borderRadius: 6, padding: '1px 6px', marginLeft: 6 }}>FROM 2027</span>;

export default function LeagueSettingsPage() {
  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SubHead eyebrow="Settings" title="League settings" sub={`${C.teams} coaches · ${C.format.toLowerCase()} · ${LEAGUE.league.scoring.toLowerCase()}`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <Group title="Scoring & lineups" rows={[
          ['Scoring', LEAGUE.league.scoring],
          ['On field', <>18: 5 DEF · 7 MID · 1 RUC · 5 FWD</>],
          ['Bench', 'Emergencies, one per positional line'],
          ['Captain', <>Captain scores double, plus a vice-captain{soon}</>],
          ['Emergencies', <>If a starter plays under {C.emergency_tog_threshold} time on ground, your emergency in the same positional line comes on</>],
          ['Lockout', `${C.lockout}: each player locks when his game starts`],
          ['Lineups set on', <>G-Train clubhouse{soon}</>],
          ['Positions', C.positions],
        ]} />
        <Group title="Season & ladder" rows={[
          ['Format', C.format],
          ['Ladder tiebreak', C.ladder.tiebreak],
          ['Early byes', C.byes.early],
          ['Mid-season byes', C.byes.mid_season],
          ['Mid-season draft order', C.ladder.mid_season_draft_order],
          ['End-of-season draft order', C.ladder.end_of_season_draft_order],
        ]} />
        <Group title="List & keepers" rows={[
          ['Squad size', `${C.squad_size} players`],
          ['Keepers', `Up to ${C.keepers.max}`],
          ['Rookie slot', `${C.keepers.rookie_slot}: ${C.keepers.rookie_rule}`],
          ['Draft', '16 rounds · round 16 is the keeper/rookie round'],
          ['Next draft', `${LEAGUE.league.next_draft.season} · ${LEAGUE.league.next_draft.date}`],
        ]} />
        <Group title="Trading" rows={[
          ['Deadline', C.trading.deadline],
          ['Approval', C.trading.approval],
          ['Draft-day trades', `${C.trading.live_draft_trades ? 'Allowed' : 'Not allowed'}. ${C.trading.draft_trade_window}`],
          ['Lopsided trades', C.trading.lopsided_veto],
        ]} />
        <Group title="Fines" rows={[
          ['Captain loophole', `$${C.fines.captain_loop}`],
          ['Zero on field loophole', `$${C.fines.zero_on_field_loop}`],
          ['Lopsided trade', `$${C.fines.lopsided_trade} per offence`],
        ]} />
      </div>
    </div>
  );
}
