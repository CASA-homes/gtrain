// Clubhouse › Picks: a club's 2027 and 2028 draft picks. A club drafts exactly as many players as it needs to fill a
// 33-man list: 15 if it keeps 17 + 1. Picks beyond that are spare (skipped once the list is full; still tradeable);
// a club short of picks gets extra picks after the last round. Picks a club only needs because it's keeping fewer
// than 18 are greyed until deadline day settles the keepers.
import Link from 'next/link';
import { TeamBadge } from '@/components/bits';
import { getContracts } from '@/lib/contracts';
import { getLeague } from '@/lib/data';
import { pickValue } from '@/lib/picks';

export async function ClubPicks({ teamId }: { teamId: number }) {
  const [league, d] = await Promise.all([getLeague(), getContracts()]);
  const LIST = d.settings?.list_size ?? 33;
  const FULL_KEEP = d.settings?.keepers ?? 18;
  const team = new Map(league.teams.map((t) => [t.id, t]));
  const years = [2027, 2028];
  const lastRound = (y: number) => Math.max(1, ...league.picks.filter((p) => p.year === y && p.kind !== 'msd').map((p) => p.round));
  // Kept for 2027: signed contracts once a club has started signing, otherwise its keeper picks.
  const signed = new Set(d.active.filter((c) => c.team_id === teamId && c.start_season <= 2027 && c.end_season >= 2027).map((c) => c.player_id));
  const flagged = league.players.filter((p) => p.team_id === teamId && (p.is_keeper || p.is_rookie_keeper)).length;
  const kept2027 = Math.min(FULL_KEEP, signed.size || flagged);
  const capital = (y: number, id: number) => league.picks.filter((p) => p.year === y && p.owner_team_id === id).reduce((a, p) => a + pickValue(p), 0);

  return (
    <div className="cp">
      {years.map((y) => {
        const kept = y === 2027 ? kept2027 : FULL_KEEP;
        const need = LIST - kept;
        const base = LIST - FULL_KEEP;
        const owned = league.picks.filter((p) => p.year === y && p.owner_team_id === teamId && p.kind !== 'msd')
          .sort((a, b) => (a.overall ?? a.round * 100) - (b.overall ?? b.round * 100));
        const used = owned.slice(0, need);
        const spare = owned.slice(need);
        const extra = Math.max(0, need - owned.length);
        const rows = [
          ...used.map((p) => ({ key: `p${p.id}`, no: p.overall ? `#${p.overall}` : `R${p.round}`, round: p.round, via: p.original_team_id !== teamId ? team.get(p.original_team_id) ?? null : null, val: pickValue(p), extra: false })),
          ...Array.from({ length: extra }, (_, i) => ({ key: `x${i}`, no: `R${lastRound(y) + 1 + i}`, round: lastRound(y) + 1 + i, via: null, val: pickValue({ round: lastRound(y) + 1 + i, overall: null }), extra: true })),
        ];
        const pts = capital(y, teamId);
        const rank = [...league.teams].map((t) => capital(y, t.id)).sort((a, b) => b - a).indexOf(pts) + 1;
        const traded = league.picks.filter((p) => p.year === y && p.original_team_id === teamId && p.owner_team_id !== teamId);
        return (
          <section key={y} className="card cp-card" aria-labelledby={`cp-${y}`}>
            <div className="cp-head">
              <div>
                <h2 id={`cp-${y}`}>{y} draft</h2>
                <span>{need} pick{need === 1 ? '' : 's'} to fill {LIST} · {y === 2027 ? `keeping ${kept}` : `assumes ${FULL_KEEP - 1} + 1 kept`}{y === 2028 ? ' · order set Dec 2027' : ''}</span>
              </div>
              <div className="cp-cap"><b>{pts.toLocaleString('en-AU')}</b><span>pts · #{rank} of {league.teams.length}</span></div>
            </div>
            <ul className="cp-list">
              {rows.map((r, i) => {
                const greyed = i >= base;
                return (
                  <li key={r.key} className={[r.round <= 2 && !greyed ? 'hi' : '', greyed ? 'cp-cond' : ''].join(' ').trim() || undefined}>
                    <span className="cp-no">{r.no}</span>
                    <span className="cp-what">
                      <b>Round {r.round}{r.extra ? ' · extra' : ''}</b>
                      <small>{greyed ? `Only if you keep fewer than ${FULL_KEEP}` : r.extra ? `After round ${lastRound(y)}: you're short of picks` : r.via ? `via ${r.via.name}` : 'Own pick'}</small>
                    </span>
                    {r.via ? <TeamBadge code={r.via.short_code} logo={r.via.logo_url} size={20} /> : <span />}
                    <span className="cp-val">{r.val.toLocaleString('en-AU')}</span>
                  </li>
                );
              })}
            </ul>
            {spare.length > 0 && <p className="cp-spare">Spare (list already full, skipped in the draft; still tradeable): {spare.map((p) => (p.overall ? `#${p.overall}` : `R${p.round}`)).join(' · ')}</p>}
            {traded.length > 0 && <p className="cp-out">Traded away: {traded.map((p) => `${p.overall ? `#${p.overall}` : `R${p.round}`} to ${team.get(p.owner_team_id)?.short_code ?? '—'}`).join(' · ')}</p>}
          </section>
        );
      })}
      <Link href="/draft" className="cp-more">Full draft order →</Link>
    </div>
  );
}
