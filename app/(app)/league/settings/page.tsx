import Link from 'next/link';
import { getLeagueProfile } from '@/lib/league-scope';
import { Group, SubHead } from '@/components/LeagueSubpage';
import { CupPrizes } from '@/components/live/cup-prizes';
import { loadCupPrizes } from '@/app/(app)/live/cup-actions';
import { getLeague, getMe } from '@/lib/data';
import { CUP_NAME } from '@/lib/cup';
import { getLeagueName, leagueTitle } from '@/lib/league-name';
import { LeagueNameForm } from '@/components/LeagueNameForm';
import { getContracts } from '@/lib/contracts';
import { StatsSources } from '@/components/StatsSources';
import { InviteCoaches } from '@/components/InviteCoaches';
import { LeagueCoaches } from '@/components/LeagueCoaches';
import { createClient } from '@/lib/supabase/server';
import { getPlan, isSiteAdmin, PRO_PER_COACH } from '@/lib/plan';
import { LeagueBankPanel } from '@/components/league/LeagueBankPanel';
import { FinesPanel, KeepersDraftPanel, MilestonesPanel, ScoringPanel, TeamStructurePanel } from '@/components/league/settings/RulesPanels';
import { getLeagueRules } from '@/lib/league-rules-server';
import '@/components/league/league-bank.css';

export const metadata = { title: 'League settings' };

// Mirrors the league settings on Keeper (keeperfantasy.com/afl/288126/rules), plus G-Train's own house rules.


export const dynamic = 'force-dynamic';

export default async function LeagueSettingsPage() {
  const profile = await getLeagueProfile();
  const C = profile.charter;
  const [me, league, prizes, leagueName, kc, plan, siteAdmin, rules] = await Promise.all([getMe(), getLeague(), loadCupPrizes(), getLeagueName(), getContracts(), getPlan(), isSiteAdmin(), getLeagueRules()]);
  const commish = !!me?.is_commish;
  const listSize = kc.settings?.list_size ?? 33;
  const kcKeepers = kc.settings?.keepers ?? 18;
  const lineupShape = (kc.settings?.lineup ?? { DEF: 5, MID: 7, RUC: 1, FWD: 5 }) as Record<'DEF' | 'MID' | 'RUC' | 'FWD', number>;
  const planDay = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Perth' });
  const dropDay = kc.settings?.rookie_lock_at ?? null;
  const statsSeason = (kc.settings?.season ?? 2027) - 1;
  const statsCompare = me?.is_commish ? ((await (await createClient()).rpc('stats_compare', { p_season: statsSeason })).data ?? null) : null;
  const joinAdmin = me?.is_commish ? ((await (await createClient()).rpc('join_admin')).data ?? null) : null;
  const coaches = me?.is_commish ? ((await (await createClient()).rpc('league_coaches')).data ?? null) : null;
  const holders = new Set(league.picks.map((p) => p.owner_team_id));
  const teams = league.teams.filter((t) => holders.has(t.id)).map((t) => ({ id: t.id, name: t.name }));
  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SubHead eyebrow={leagueTitle(leagueName)} title="League settings" sub="10 teams · keeper league · head-to-head points · AFL Fantasy scoring" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        {plan.ready && (
          <section id="plan" className="card plan-card" style={{ padding: 16 }}>
            <div className="row-between" style={{ gap: 8, flexWrap: 'wrap' }}>
              <h2 className="h2" style={{ fontSize: 18, margin: 0 }}>Plan</h2>
              <span className={`plan-pill ${plan.isPro ? '' : plan.plan === 'pro' ? 'lapsed' : 'free'}`}>{plan.isPro ? `Pro${plan.founding ? ' · founding league' : ''}` : plan.plan === 'pro' ? 'Pro · lapsed' : 'Free'}</span>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {plan.isPro
                ? 'Your league has everything: contracts and the cap, the KT economy, the Knockout Cup and mini comps, the draft centre and deep player profiles.'
                : 'Free covers the draft, keepers, trades, matchday and the ladder. Pro adds contracts and the cap, the KT economy, the Knockout Cup and mini comps, the draft centre and deep player profiles.'}
            </p>
            <div className="plan-row">
              {plan.founding && <><span>2027 season</span><b>Free (founding league)</b></>}
              {plan.isPro && plan.proUntil && <><span>Pro until</span><b>{planDay(plan.proUntil)}</b></>}
              <span>{plan.founding ? 'From 2028' : 'Pro'}</span><b>${PRO_PER_COACH} × {plan.coaches} coaches = ${PRO_PER_COACH * plan.coaches} a season</b>
            </div>
            {me?.is_commish && <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>{plan.founding ? 'Payments open before the 2028 draft. We’ll email you a month ahead; nothing changes until then.' : 'Online payments are coming. To go Pro now, email hello@keeperhq.au.'}</p>}
            {siteAdmin && <Link href="/admin/plans" className="lg-btn" style={{ alignSelf: 'flex-start' }}>Manage every league’s plan</Link>}
          </section>
        )}
        <section className="card ov-card" aria-labelledby="ov-h">
          <h2 id="ov-h" className="h2" style={{ fontSize: 18, margin: 0 }}>Overrides</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {me?.is_commish
              ? 'Fix a player’s score when the feed gets it wrong, pause or lock a round, and override contracts. Every change is logged for the league to see.'
              : 'Score corrections the commish has made, round by round. Every change is logged here.'}
          </p>
          <div className="ov-links">
            <Link href="/league/scores" className="lg-btn">Scores →</Link>
            {me?.is_commish && <Link href="/league/scores?tab=contracts" className="lg-btn">Contracts →</Link>}
          </div>
        </section>
        <LeagueBankPanel commish={!!me?.is_commish} />
        {coaches && <LeagueCoaches rows={coaches} clubs={league.teams.map((t) => ({ id: t.id, name: t.name }))} />}
        {joinAdmin && <InviteCoaches admin={joinAdmin} />}
        {me?.is_commish && !profile.legacy && (
          <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 className="h2" style={{ fontSize: 18 }}>Squad setup</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Coaches pick their own squads off the AFL list. Sign each one off, sort out flags, fix traded picks, then lock squads.</p>
            <Link href="/league/setup" className="lg-btn" style={{ alignSelf: 'flex-start' }}>Open the squad board</Link>
          </section>
        )}
        {me?.is_commish && <StatsSources season={statsSeason} compare={statsCompare} />}
        <LeagueNameForm name={leagueName} isCommish={!!me?.is_commish} />
        <MilestonesPanel commish={commish} release={dropDay} dates={rules.dates} />
        <TeamStructurePanel commish={commish} listSize={listSize} lineup={lineupShape} keepers={kcKeepers} rules={rules.team} />
        <ScoringPanel commish={commish} rules={rules.scoring} />
        <Group title="Season" rows={[
          ['Early bye rounds', 'Opening Round scores used'],
          ['Mid-season byes', 'No scoring adjustments'],
          ['Ladder tiebreak', 'Total points'],
          ['Finals', '6 teams over 3 weeks · no wildcard, no consolation finals'],
          ['League medal', `${leagueName} Medal: 3 votes, weighted voting`],
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
        <KeepersDraftPanel commish={commish} listSize={listSize} keepers={kcKeepers} rookie={rules.team.rookie} rules={rules.draft} nextDraft={new Date(`${rules.dates.draft_day}T12:00:00+08:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} />
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="h2" style={{ fontSize: 18 }}>{CUP_NAME}</h2>
          <CupPrizes variant="settings" settings={prizes} isCommish={!!me?.is_commish} teams={teams} />
        </section>
        <FinesPanel commish={commish} rules={rules.fines} />
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>From the league’s settings on Keeper, plus {leagueName} house rules.</p>
    </div>
  );
}
