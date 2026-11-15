// Clubhouse › Picks: a club's 2027 and 2028 draft picks, with where each came from and its draft value.
import Link from 'next/link';
import { TeamBadge } from '@/components/bits';
import { getLeague } from '@/lib/data';
import { pickValue } from '@/lib/picks';

export async function ClubPicks({ teamId }: { teamId: number }) {
  const league = await getLeague();
  const team = new Map(league.teams.map((t) => [t.id, t]));
  const years = [2027, 2028];
  const capital = (y: number, id: number) => league.picks.filter((p) => p.year === y && p.owner_team_id === id).reduce((a, p) => a + pickValue(p), 0);
  return (
    <div className="cp">
      {years.map((y) => {
        const picks = league.picks.filter((p) => p.year === y && p.owner_team_id === teamId)
          .sort((a, b) => (a.overall ?? a.round * 100) - (b.overall ?? b.round * 100));
        const pts = capital(y, teamId);
        const rank = [...league.teams].map((t) => capital(y, t.id)).sort((a, b) => b - a).indexOf(pts) + 1;
        const traded = league.picks.filter((p) => p.year === y && p.original_team_id === teamId && p.owner_team_id !== teamId);
        return (
          <section key={y} className="card cp-card" aria-labelledby={`cp-${y}`}>
            <div className="cp-head">
              <div><h2 id={`cp-${y}`}>{y} draft</h2><span>{picks.length} pick{picks.length === 1 ? '' : 's'}{y === 2028 ? ' · order set Dec 2027' : ''}</span></div>
              <div className="cp-cap"><b>{pts.toLocaleString('en-AU')}</b><span>pts · #{rank} of {league.teams.length}</span></div>
            </div>
            {picks.length ? (
              <ul className="cp-list">
                {picks.map((p) => {
                  const via = p.original_team_id !== teamId ? team.get(p.original_team_id) : null;
                  return (
                    <li key={p.id} className={p.round <= 2 ? 'hi' : undefined}>
                      <span className="cp-no">{p.overall ? `#${p.overall}` : `R${p.round}`}</span>
                      <span className="cp-what"><b>Round {p.round}{p.kind === 'msd' ? ' · mid-season' : ''}</b>{via ? <small>via {via.name}</small> : <small>Own pick</small>}</span>
                      {via && <TeamBadge code={via.short_code} logo={via.logo_url} size={20} />}
                      <span className="cp-val">{pickValue(p).toLocaleString('en-AU')}</span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="kc-sub" style={{ margin: 0 }}>No {y} picks.</p>}
            {traded.length > 0 && <p className="cp-out">Traded away: {traded.map((p) => `${p.overall ? `#${p.overall}` : `R${p.round}`} to ${team.get(p.owner_team_id)?.short_code ?? '—'}`).join(' · ')}</p>}
          </section>
        );
      })}
      <Link href="/draft" className="cp-more">Full draft order →</Link>
    </div>
  );
}
