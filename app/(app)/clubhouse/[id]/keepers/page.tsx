import { notFound, redirect } from 'next/navigation';
import { KeeperPicker } from './KeeperPicker';
import { getLeague, getMe } from '@/lib/data';

export default async function KeepersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  const a = league.byTeam.get(Number(id));
  if (!a) notFound();
  if (!me || (me.team_id !== a.team.id && !me.is_commish)) redirect(`/clubhouse/${a.team.id}`);

  const players = [...a.players]
    .sort((x, y) => (league.ratings.get(y.id)!.value - league.ratings.get(x.id)!.value))
    .map((p) => ({
      id: p.id, name: p.name, positions: p.positions, afl_club: p.afl_club, average: p.average, games: p.games, career_games: p.career_games,
      value: league.ratings.get(p.id)!.value, is_keeper: p.is_keeper, is_rookie_keeper: p.is_rookie_keeper,
    }));

  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="eyebrow">{a.team.name}</span>
        <h1 style={{ font: '600 30px var(--font)', letterSpacing: '-.03em' }}>Set your 2027 keepers</h1>
        <p className="muted" style={{ margin: 0, maxWidth: '65ch' }}>
          Keep up to 17 players, plus an 18th rookie slot for a player with 10 or fewer career AFL games. Players are sorted by league value.
        </p>
      </div>
      <KeeperPicker teamId={a.team.id} players={players} />
    </div>
  );
}
