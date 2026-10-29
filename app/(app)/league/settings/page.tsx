import LEAGUE from '@/data/league.json';
import { Group, SubHead } from '@/components/LeagueSubpage';

export const metadata = { title: 'League settings' };

// Mirrors the league settings on Keeper (keeperfantasy.com/afl/288126/rules), plus G-Train's own house rules.
const C = LEAGUE.charter;
const tag = (t: string) => <span style={{ font: '600 11px var(--mono)', color: '#a87a22', background: '#fbf3dc', borderRadius: 6, padding: '1px 6px', marginLeft: 6, whiteSpace: 'nowrap' }}>{t}</span>;
const NEW = tag('NEW FOR 2027');

const SCORING: [string, number][] = [['Kick', 3], ['Handball', 2], ['Mark', 3], ['Tackle', 4], ['Hitout', 1], ['Goal', 6], ['Behind', 1], ['Free for', 1], ['Free against', -3]];

export default function LeagueSettingsPage() {
  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SubHead eyebrow="Settings" title="League settings" sub="10 teams · keeper league · head-to-head points · AFL Fantasy scoring" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <Group title="Team structure" rows={[
          ['Squad size', '33 players: 18 starters, 4 emergencies, 11 bench'],
          ['On field', '5 DEF · 7 MID · 1 RUC · 5 FWD'],
          ['Emergencies', 'One per line: DEF, MID, RUC, FWD'],
          ['Utility', <>A fifth emergency who covers only the positions he holds, as the last-chance cover{NEW}</>],
          ['Injury / rookie / veteran lists', 'None'],
        ]} />
        <Group title="Scoring" rows={[
          ['System', 'Points, standard AFL Fantasy'],
          ['Formula', <span style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>{SCORING.map(([k, v]) => <span key={k}>{k} <b>{v > 0 ? `+${v}` : v}</b></span>)}</span>],
          ['Captains', 'Captain and vice-captain, both 2×'],
          ['Captain rule', 'If the captain plays under 25% time on ground, the vice-captain scores double and the captain counts as normal'],
          ['TOG threshold', `${C.emergency_tog_threshold}: a starter under this is replaced by his emergency, only if the emergency scored more`],
          ['Dual positions', 'An emergency with two or three positions can cover any of them'],
          ['Utility cover', <>If the line emergency can’t help (e.g. a Sunday late out after your DEF emergency scored poorly), the utility comes on if he holds that position. Covers one starter{NEW}</>],
          ['Emergency loophole', 'No: emergencies can’t cover an empty lineup slot'],
          ['Lockout', 'Rolling: each player locks when his game starts'],
        ]} />
        <Group title="Season" rows={[
          ['Early bye rounds', 'Opening Round scores used'],
          ['Mid-season byes', 'No scoring adjustments'],
          ['Ladder tiebreak', 'Total points'],
          ['Finals', '6 teams over 3 weeks · no wildcard, no consolation finals'],
          ['League medal', 'G-Train Medal: 3 votes, weighted voting'],
        ]} />
        <Group title="Player positions" rows={[
          ['Positions', 'Set by AFL Fantasy / Champion Data at season start'],
          ['In-season changes', 'Industry updates, every 6 weeks'],
          ['Triple-position players', 'Yes'],
          ['Positionless / custom', 'No'],
        ]} />
        <Group title="Transactions" rows={[
          ['Allowed', 'Trades only, no waivers or free agency'],
          ['Acquisitions', 'Unlimited, season and week'],
          ['Trade review', 'Commissioner decision, trades stay open 2 days'],
          ['Processing', '12:00pm AEDT'],
          ['Deadline', 'None'],
          ['Draft-day trades', `Allowed. ${C.trading.draft_trade_window}`],
          ['Lopsided trades', C.trading.lopsided_veto],
        ]} />
        <Group title="Keepers & draft" rows={[
          ['Keepers', '17 minimum, 18 maximum'],
          ['Rookie rule', C.keepers.rookie_rule],
          ['Pick trading', 'Enabled, picks tradeable through 2028'],
          ['Draft', '16 rounds · round 16 is the keeper/rookie round'],
          ['Mid-season draft order', C.ladder.mid_season_draft_order],
          ['End-of-season draft order', C.ladder.end_of_season_draft_order],
          ['Next draft', `${LEAGUE.league.next_draft.season} · ${LEAGUE.league.next_draft.date}`],
        ]} />
        <Group title="Fines" rows={[
          ['Captain loophole', `$${C.fines.captain_loop}`],
          ['Zero on field loophole', `$${C.fines.zero_on_field_loop}`],
          ['Lopsided trade', `$${C.fines.lopsided_trade} per offence`],
        ]} />
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>From the league’s settings on Keeper, plus G-Train house rules. Items tagged “New for 2027” apply once lineups and scoring move to this site.</p>
    </div>
  );
}
