import { redirect } from 'next/navigation';
import { CompsPage } from '@/components/live/comps';
import { getLeague, getMe } from '@/lib/data';
import { pickLabel } from '@/lib/picks';
import { loadComps } from '../comps-actions';

export const metadata = { title: 'Side comps' };
export const dynamic = 'force-dynamic';

export default async function CompsRoute() {
  const me = await getMe();
  if (!me) redirect('/');
  const [league, state] = await Promise.all([getLeague(), loadComps()]);
  const club = (id: number) => league.teams.find((t) => t.id === id)?.short_code ?? '?';
  const allPicks = [...league.picks, ...league.extraPicks];
  const label = (p: (typeof allPicks)[number]) => `${pickLabel(p)}${p.original_team_id !== p.owner_team_id ? ` (via ${club(p.original_team_id)})` : ''}`;
  return (
    <CompsPage
      state={state} myTeamId={me.team_id} isCommish={me.is_commish}
      teams={league.teams.map((t) => ({ id: t.id, name: t.name, short: t.short_code }))}
      myPicks={allPicks.filter((p) => p.owner_team_id === me.team_id).map((p) => ({ id: p.id, label: label(p) }))}
      myPlayers={league.players.filter((p) => p.team_id === me.team_id && !p.list_status).sort((a, b) => (b.average ?? 0) - (a.average ?? 0)).map((p) => ({ id: p.id, name: p.full_name ?? p.name }))}
      labels={{ picks: Object.fromEntries(allPicks.map((p) => [p.id, label(p)])), players: Object.fromEntries(league.players.map((p) => [p.id, p.full_name ?? p.name])) }}
    />
  );
}
