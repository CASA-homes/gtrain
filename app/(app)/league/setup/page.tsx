import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SubHead } from '@/components/LeagueSubpage';
import { SquadSetup, type SetupData } from '@/components/setup/SquadSetup';
import { getMe } from '@/lib/data';
import { createClient, currentLeagueId } from '@/lib/supabase/server';

export const metadata = { title: 'Squad setup' };
export const dynamic = 'force-dynamic';

type P = { id: number; name: string; full_name: string | null; afl_club: string | null; positions: string[] | null };

export default async function SetupPage() {
  const [me, lid] = await Promise.all([getMe(), currentLeagueId()]);
  if (!me) redirect('/');
  if (lid === 1 || me.is_guest) return (
    <div className="wrap stack" style={{ gap: 14 }}>
      <SubHead eyebrow="League" title="Squad setup" sub="Coaches pick their squads, the commish signs them off" />
      <div className="card" style={{ padding: 18 }}><p style={{ margin: 0 }}>{lid === 1 ? 'G-Train’s lists are already set up.' : 'Only club coaches pick squads.'} <Link href="/league">Back to the league</Link></p></div>
    </div>
  );
  const supabase = await createClient();
  const loadPlayers = async () => {
    const all: P[] = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data } = await supabase.from('players').select('id, name, full_name, afl_club, positions').order('id').range(from, from + 999);
      const rows = (data ?? []) as P[];
      all.push(...rows);
      if (rows.length < 1000) break;
    }
    return all;
  };
  const [lg, teams, squad, setup, flags, kc, picks, players] = await Promise.all([
    supabase.from('leagues').select('*').eq('id', lid).maybeSingle(),
    supabase.from('teams').select('id, name, coach_name, short_code, is_guest').order('id'),
    supabase.from('squad').select('player_id, team_id'),
    supabase.from('squad_setup').select('team_id, status'),
    supabase.from('squad_flags').select('id, player_id, claimant_team_id, holder_team_id').eq('status', 'open').order('created_at'),
    supabase.from('kc_settings').select('list_size').maybeSingle(),
    me.is_commish ? supabase.from('picks').select('id, year, round, overall, original_team_id, owner_team_id').order('year').order('round').order('overall') : Promise.resolve({ data: [] }),
    loadPlayers(),
  ]);
  const league = (lg.data ?? {}) as { name?: string; setup_mode?: string | null; squads_locked_at?: string | null };
  const data: SetupData = {
    ready: !setup.error,
    leagueName: league.name ?? 'Your league',
    mode: (league.setup_mode as SetupData['mode']) ?? null,
    locked: !!league.squads_locked_at,
    listSize: (kc.data as { list_size?: number } | null)?.list_size ?? 33,
    myTeamId: me.team_id,
    isCommish: me.is_commish,
    teams: ((teams.data ?? []) as { id: number; name: string; coach_name: string; short_code: string; is_guest: boolean }[])
      .filter((t) => !t.is_guest).map((t) => ({ id: t.id, name: t.name, coach: t.coach_name, code: t.short_code })),
    owners: Object.fromEntries(((squad.data ?? []) as { player_id: number; team_id: number }[]).map((s) => [s.player_id, s.team_id])),
    status: Object.fromEntries(((setup.data ?? []) as { team_id: number; status: string }[]).map((s) => [s.team_id, s.status])) as SetupData['status'],
    flags: ((flags.data ?? []) as { id: number; player_id: number; claimant_team_id: number; holder_team_id: number | null }[])
      .map((f) => ({ id: f.id, player: f.player_id, claimant: f.claimant_team_id, holder: f.holder_team_id })),
    picks: ((picks.data ?? []) as { id: number; year: number; round: number; overall: number | null; original_team_id: number; owner_team_id: number }[])
      .map((p) => ({ id: p.id, year: p.year, round: p.round, overall: p.overall, original: p.original_team_id, owner: p.owner_team_id })),
    players: players.map((p) => ({ id: p.id, name: p.full_name || p.name, club: p.afl_club, pos: (p.positions ?? []).filter((x) => ['DEF', 'MID', 'RUC', 'FWD'].includes(x)) })),
  };
  return (
    <div className="wrap stack" style={{ gap: 14, maxWidth: 760 }}>
      <SubHead eyebrow="League" title="Squad setup" sub={`${data.leagueName} · coaches pick their squads, the commish signs them off`} />
      <SquadSetup data={data} />
    </div>
  );
}
