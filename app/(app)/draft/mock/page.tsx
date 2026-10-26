import Link from 'next/link';
import { DraftTabs } from '@/components/DraftTabs';
import { MockDraft } from '@/components/MockDraft';
import { getLeague, getMe } from '@/lib/data';
import { age, type PlayerRow } from '@/lib/ratings';
import { projected2027 } from '@/lib/projection';
import { nowFut, ONE_ROOKIE_EARLY, prospectLines, rookieFuture, windowLabel, wNowFor, type MockPick, type MockPlayer, type MockTeam } from '@/lib/mock-draft';
import cb from '@/lib/crystal-ball.json';

export const metadata = { title: '2027 mock draft' };
const START_2027 = new Date(2027, 2, 1);

export default async function MockPage() {
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  const teamName = (id: number) => league.teams.find((t) => t.id === id)?.name ?? '';
  const season = (p: PlayerRow, y: number) => (p.hist ?? []).find((h) => h[0] === y);

  const vals = (b: Parameters<typeof nowFut>[0]) => { const v = nowFut(b); return { now: Math.round(v.now * 10) / 10, fut: Math.round(v.fut * 10) / 10, board: Math.round((v.now + v.fut) * 5) / 10 }; };
  const asMock = (p: PlayerRow, kind: 'Released' | 'Free agent'): MockPlayer => {
    const s26 = season(p, 2026), s25 = season(p, 2025);
    const base = { a26: s26 && s26[1] ? s26[2] : p.games ? p.average : null, g26: s26?.[1] ?? p.games ?? 0, a25: s25 && s25[1] ? s25[2] : null, g25: s25?.[1] ?? 0, age: age(p.birth_date, START_2027) };
    return { key: `p:${p.id}`, id: p.id, name: p.full_name ?? p.name, kind, pos: p.positions.join('/'), lines: [...p.positions], club: p.afl_club, from: kind === 'Released' ? teamName(p.team_id) : null,
      ...base, ruck: p.positions.includes('RUC'), ...vals(base) };
  };
  const released = league.players.filter((p) => !p.is_keeper && !p.is_rookie_keeper && !p.list_status).map((p) => asMock(p, 'Released'));
  const free = league.freeAgents.filter((p) => !p.list_status).map((p) => asMock(p, 'Free agent'));
  type Prospect = { rank: number; name: string; role: string; chance: number; junior: string; position: string };
  const rookies: MockPlayer[] = (cb as unknown as { prospects: Prospect[] }).prospects.map((p) => ({
    key: `r:${p.name}`, id: null, name: p.name, kind: 'Rookie', pos: p.position || p.role, lines: prospectLines(p.position, p.role), age: 18, club: p.junior, from: null,
    a26: null, g26: 0, a25: null, g25: 0, rank: p.rank, chance: p.chance, ruck: p.role === 'Ruck', now: 0, fut: Math.round(rookieFuture(p.rank, p.role, p.chance) * 10) / 10, board: Math.round(rookieFuture(p.rank, p.role, p.chance) * 5) / 10,
  }));

  const wins = new Map(league.ladder.filter((l) => l.season === 2026).map((l) => [l.team_id, l.wins]));
  const teams: MockTeam[] = league.teams.map((t) => {
    const gunRuck = league.players.some((p) => p.team_id === t.id && (p.is_keeper || p.is_rookie_keeper) && p.positions.includes('RUC') && projected2027(p) >= 85);
    const w = wNowFor(t.name, wins.get(t.id) ?? null);
    return { id: t.id, name: t.name, short: t.short_code, wNow: w, window: windowLabel(w), hasGunRuck: gunRuck, oneRookieEarly: ONE_ROOKIE_EARLY.has(t.name) };
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
