import { redirect } from 'next/navigation';
import { DraftTabs } from '@/components/DraftTabs';
import { MsdRoom } from '@/components/MsdRoom';
import { getLeague, getMe } from '@/lib/data';
import { projected2027 } from '@/lib/projection';
import { MSD_SEASON } from '@/lib/msd';
import { loadMsd } from './actions';

export const metadata = { title: 'Mid-season draft' };
export const dynamic = 'force-dynamic';

export default async function MsdPage() {
  const me = await getMe();
  if (!me) redirect('/');
  const [league, msd] = await Promise.all([getLeague(), loadMsd()]);
  // Ladder for the default order: this season's after the freeze if it's loaded, otherwise last season's as a placeholder.
  const lad = (season: number) => league.ladder.filter((l) => l.season === season).sort((a, b) => b.rank - a.rank).map((l) => l.team_id);
  const live = lad(MSD_SEASON);
  const ladderOrder = live.length ? live : lad(MSD_SEASON - 1);
  const dropped = new Set(msd.drops.map((d) => d.player_id));
  const row = (p: (typeof league.players)[number], from: number | null) => ({
    id: p.id, name: p.full_name ?? p.name, pos: p.positions.join('/'), club: p.afl_club, proj: Math.round(projected2027(p)), avg: p.average, from,
  });
  const pool = [
    ...league.players.filter((p) => dropped.has(p.id)).map((p) => row(p, p.team_id)),
    ...league.freeAgents.filter((p) => !p.list_status).map((p) => row(p, null)),
  ].sort((a, b) => b.proj - a.proj);
  const mine = league.players.filter((p) => p.team_id === me.team_id && !p.list_status).map((p) => ({ ...row(p, null), keeper: p.is_keeper || p.is_rookie_keeper })).sort((a, b) => a.proj - b.proj);
  return (
    <div className="wrap">
      <div className="row-between" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div>
          <span className="eyebrow">{MSD_SEASON} · drop 3, pick 3 · straight reverse-ladder order</span>
          <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>Mid-season draft</h1>
        </div>
        <DraftTabs active="msd" />
      </div>
      <MsdRoom data={msd} myTeamId={me.team_id} isCommish={me.is_commish} usingLastSeason={!live.length}
        teams={league.teams.map((t) => ({ id: t.id, name: t.name, short: t.short_code }))} ladderOrder={ladderOrder} pool={pool} mine={mine} />
    </div>
  );
}
