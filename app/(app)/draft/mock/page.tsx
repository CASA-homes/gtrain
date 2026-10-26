import Link from 'next/link';
import { DraftTabs } from '@/components/DraftTabs';
import { MockDraft } from '@/components/MockDraft';
import { getLeague, getMe } from '@/lib/data';
import { age, type PlayerRow } from '@/lib/ratings';
import { projected2027 } from '@/lib/projection';
import { windowFor } from '@/lib/trade-plan';
import { playerBoard, prospectLines, rookieBoard, teamLean, type MockPick, type MockPlayer, type MockTeam } from '@/lib/mock-draft';
import cb from '@/lib/crystal-ball.json';

export const metadata = { title: '2027 mock draft' };
const START_2027 = new Date(2027, 2, 1);

export default async function MockPage() {
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  const teamName = (id: number) => league.teams.find((t) => t.id === id)?.name ?? '';
  const season = (p: PlayerRow, y: number) => (p.hist ?? []).find((h) => h[0] === y);

  const asMock = (p: PlayerRow, kind: 'Released' | 'Free agent'): MockPlayer => {
    const s26 = season(p, 2026), s25 = season(p, 2025);
    const base = { a26: s26 && s26[1] ? s26[2] : p.games ? p.average : null, g26: s26?.[1] ?? p.games ?? 0, a25: s25 && s25[1] ? s25[2] : null, g25: s25?.[1] ?? 0, age: age(p.birth_date, START_2027) };
    return { key: `p:${p.id}`, id: p.id, name: p.full_name ?? p.name, kind, pos: p.positions.join('/'), lines: [...p.positions], club: p.afl_club, from: kind === 'Released' ? teamName(p.team_id) : null,
      ...base, ruck: p.positions.includes('RUC'), board: Math.round(playerBoard(base) * 10) / 10 };
  };
  const released = league.players.filter((p) => !p.is_keeper && !p.is_rookie_keeper && !p.list_status).map((p) => asMock(p, 'Released'));
  const free = league.freeAgents.filter((p) => !p.list_status).map((p) => asMock(p, 'Free agent'));
  type Prospect = { rank: number; name: string; role: string; chance: number; junior: string; position: string };
  const rookies: MockPlayer[] = (cb as unknown as { prospects: Prospect[] }).prospects.map((p) => ({
    key: `r:${p.name}`, id: null, name: p.name, kind: 'Rookie', pos: p.position || p.role, lines: prospectLines(p.position, p.role), age: 18, club: p.junior, from: null,
    a26: null, g26: 0, a25: null, g25: 0, rank: p.rank, chance: p.chance, ruck: p.role === 'Ruck', board: Math.round(rookieBoard(p.rank, p.role, p.chance) * 10) / 10,
  }));

  const teams: MockTeam[] = league.teams.map((t) => {
    const a = league.byTeam.get(t.id)!;
    const w = windowFor(a.projection.rank, a.future.rank);
    const gunRuck = league.players.some((p) => p.team_id === t.id && (p.is_keeper || p.is_rookie_keeper) && p.positions.includes('RUC') && projected2027(p) >= 85);
    return { id: t.id, name: t.name, short: t.short_code, window: w.window, hasGunRuck: gunRuck, ...teamLean(t.name, w.window) };
  });
  const picks: MockPick[] = league.picks.filter((p) => p.year === 2027 && p.overall != null)
    .sort((a, b) => a.overall! - b.overall!).map((p) => ({ overall: p.overall!, round: p.round, teamId: p.owner_team_id }));

  return (
    <div className="wrap" style={{ maxWidth: 1360 }}>
      <div className="row-between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="eyebrow">Keepers locked · {released.length} released, {free.length} unowned, {rookies.length} rookies · {picks.length} picks</span>
          <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>2027 mock draft</h1>
        </div>
        <DraftTabs active="mock" />
      </div>
      <MockDraft players={[...rookies, ...released, ...free]} teams={teams} picks={picks} myTeamId={me?.team_id ?? null} />
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        How the other clubs pick: a board value for every player, tuned to how the 2026 G-Train draft went (star rookies top 5, key-position talls slide, proven 85+ veterans from
        about pick 17), leaned by each club’s window and last-draft habits. Your edits are saved on this device only. Rookies are the Crystal Ball’s phantom top 30 until the
        AFL draft in November. <Link href="/draft">G-Train picks</Link>
      </p>
    </div>
  );
}
