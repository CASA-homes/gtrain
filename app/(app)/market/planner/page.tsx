import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TradePlanner } from '@/components/TradePlanner';
import { getLeague, getMe } from '@/lib/data';
import { pickLabel, pickValue, playerPoints } from '@/lib/picks';
import { futureScore, FUTURE_MAX_AGE, projected2027, prospectScore } from '@/lib/projection';
import { age } from '@/lib/ratings';
import { windowFor, type PAsset, type PTeam } from '@/lib/trade-plan';

export const metadata = { title: 'Trade planner' };

// Private sandbox: everything is worked out in your browser and nothing is saved or shown to anyone else.
export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ team?: string; get?: string }> }) {
  const sp = await searchParams;
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  if (!me) redirect('/');

  const teams: PTeam[] = league.teams.map((t) => {
    const a = league.byTeam.get(t.id)!;
    const w = windowFor(a.projection.rank, a.future.rank);
    return { id: t.id, name: t.name, short: t.short_code, projRank: a.projection.rank, futRank: a.future.rank, status: a.status, ...w };
  });

  const assets: PAsset[] = [
    ...league.players.filter((p) => !p.list_status).map((p) => {
      const r = league.ratings.get(p.id);
      const a = age(p.birth_date);
      return {
        key: `player:${p.id}`, kind: 'player' as const, id: p.id, teamId: p.team_id, label: p.name,
        sub: `${p.positions.join('/')} · ${a ?? '–'} · ’26 ${p.average?.toFixed(0) ?? '–'}`,
        positions: p.positions, age: a, now: projected2027(p), fut: futureScore(p, r?.potential ?? null, r?.lineBonus ?? 0, r?.lineEdge ?? 0),
        pts: r ? playerPoints(r.value) : 0, club: p.afl_club, photo: p.photo_path, dfs: p.dfs_id, young: (a ?? 99) <= FUTURE_MAX_AGE,
      };
    }),
    ...league.picks.filter((p) => p.year === 2027 || p.year === 2028).map((p) => {
      const via = p.original_team_id !== p.owner_team_id ? ` · via ${league.teams.find((t) => t.id === p.original_team_id)?.short_code ?? ''}` : '';
      const fut = p.year === 2027 && p.overall ? prospectScore(p.overall) : Math.round(prospectScore(p.overall ?? (p.round - 1) * 10 + 5) * (p.year === 2027 ? 1 : 0.8));
      return {
        key: `pick:${p.id}`, kind: 'pick' as const, id: p.id, teamId: p.owner_team_id, label: pickLabel(p), sub: `Round ${p.round}${via}`,
        positions: [], age: null, now: 0, fut, pts: pickValue(p), club: null, photo: null, dfs: null, young: true,
      };
    }),
  ];

  const getId = sp.get ? Number(sp.get) : null;
  const target = getId ? assets.find((a) => a.kind === 'player' && a.id === getId) : null;
  const partner = target ? target.teamId : sp.team ? Number(sp.team) : null;

  return (
    <div className="wrap" style={{ maxWidth: 1240 }}>
      <span className="mono muted" style={{ fontSize: 12 }}><Link href="/market">Market</Link> / Trade planner</span>
      <div>
        <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>Trade planner</h1>
        <p className="muted" style={{ margin: '4px 0 0', maxWidth: '78ch' }}>
          Test a trade before you send it. Only you can see this: nothing is saved or shown to anyone else.
          Each side is judged on what it does to their 2027 best 18 and their young core, weighted by where that team is at.
        </p>
      </div>
      <TradePlanner myTeamId={me.team_id} teams={teams} assets={assets} initialPartner={partner && partner !== me.team_id ? partner : null} initialGet={target && target.teamId !== me.team_id ? target.key : null} />
    </div>
  );
}
