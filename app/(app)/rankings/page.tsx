import Link from 'next/link';
import { Bar20, Cup } from '@/components/bits';
import { getLeague } from '@/lib/data';
import { C, LINES } from '@/lib/ratings';

const STATUS_COLOUR = { 'Strong contender': C.green5, 'Top 4 contender': C.green4, 'Mid-table': C.green2, Rebuilding: C.yellow } as const;

export default async function RankingsPage() {
  const league = await getLeague();
  const rows = [...league.byTeam.values()].sort((a, b) => a.rank - b.rank);
  return (
    <div className="wrap">
      <div>
        <span className="eyebrow">Ranked on Best 18, using 2026 averages</span>
        <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>Power rankings</h1>
      </div>
      <div className="table-box">
        <table className="squad" style={{ minWidth: 860 }}>
          <thead>
            <tr><th style={{ width: 40 }}>#</th><th>Team</th><th>Status</th><th style={{ textAlign: 'right' }}>Best 18</th>
              {LINES.map((l) => <th key={l} style={{ width: 120 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="dot" style={{ width: 7, height: 7, background: C[l] }} />{l}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.team.id}>
                <td className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{a.rank}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <Link href={`/clubhouse/${a.team.id}`}>{a.team.name}</Link>
                  <span style={{ marginLeft: 6, display: 'inline-flex', gap: 2, verticalAlign: -4 }}>{a.premierships.map((y) => <Cup key={y} size={14} />)}</span>
                  <div className="muted" style={{ fontSize: 12 }}>{a.team.coach_name}</div>
                </td>
                <td><span className="pill" style={{ background: STATUS_COLOUR[a.status], color: a.rank <= 4 ? '#fff' : C.ink, padding: '3px 10px' }}>{a.status}</span></td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{Math.round(a.best18).toLocaleString()}</td>
                {LINES.map((l) => (
                  <td key={l}>
                    <Bar20 value={a.lineStrength[l].score} height={8} label={`${l} strength`} />
                    <span className="mono muted" style={{ fontSize: 10 }}>{a.lineStrength[l].rank} of 10</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: '70ch' }}>
        Window timelines and age-based projections switch on once player ages arrive with the stats feed.
      </p>
    </div>
  );
}
