import Link from 'next/link';
import { AvgChip, ClubDot, FormArrow, PosDots, Stars } from '@/components/bits';
import { getLeague } from '@/lib/data';
import { C, form, LINES, type Line } from '@/lib/ratings';

export default async function PlayersPage({ searchParams }: { searchParams: Promise<{ q?: string; line?: string; team?: string }> }) {
  const sp = await searchParams;
  const league = await getLeague();
  const q = (sp.q ?? '').toLowerCase();
  const line = LINES.includes(sp.line as Line) ? (sp.line as Line) : null;
  const team = sp.team ? Number(sp.team) : null;

  const rows = league.players
    .filter((p) => (!q || p.name.toLowerCase().includes(q)) && (!line || p.positions.includes(line)) && (!team || p.team_id === team))
    .sort((a, b) => league.ratings.get(b.id)!.value - league.ratings.get(a.id)!.value);

  return (
    <div className="wrap">
      <div className="row-between" style={{ alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">Every rostered player</span>
          <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>Players</h1>
        </div>
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label htmlFor="q" className="sr-only">Search players</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="Search a name" className="input" />
          <label htmlFor="line" className="sr-only">Line</label>
          <select id="line" name="line" defaultValue={sp.line ?? ''} className="input">
            <option value="">All lines</option>{LINES.map((l) => <option key={l}>{l}</option>)}
          </select>
          <label htmlFor="team" className="sr-only">Club</label>
          <select id="team" name="team" defaultValue={sp.team ?? ''} className="input">
            <option value="">All clubs</option>{league.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button type="submit" className="btn dark">Filter</button>
        </form>
      </div>
      <div className="table-box">
        <table className="squad" style={{ minWidth: 760 }}>
          <thead>
            <tr><th style={{ width: 40 }}>#</th><th style={{ width: 90 }}>Pos</th><th style={{ width: 26 }}><span className="sr-only">AFL club</span></th><th>Player</th><th>Owner</th><th style={{ width: 60, textAlign: 'center' }}>Avg</th><th style={{ width: 50, textAlign: 'center' }}>Form</th><th style={{ width: 50, textAlign: 'center' }}>Apps</th><th style={{ width: 60, textAlign: 'center' }}>Value</th><th style={{ width: 90 }}>Stars</th></tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const r = league.ratings.get(p.id)!;
              const owner = league.teams.find((t) => t.id === p.team_id)!;
              return (
                <tr key={p.id}>
                  <td className="mono muted">{i + 1}</td>
                  <td><PosDots positions={p.positions} /></td>
                  <td><ClubDot code={p.afl_club} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}><Link href={`/players/${p.id}`}>{p.name}</Link>{(p.is_keeper || p.is_rookie_keeper) && <span className="keeper-tag">K</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><Link href={`/clubhouse/${owner.id}`} style={{ fontWeight: 400, color: C.muted }}>{owner.name}</Link></td>
                  <td style={{ textAlign: 'center' }}><AvgChip value={p.average} /></td>
                  <td style={{ textAlign: 'center' }}><FormArrow form={form(p)} /></td>
                  <td style={{ textAlign: 'center' }}>{p.games ?? '–'}</td>
                  <td style={{ textAlign: 'center' }} className="mono">{r.value}</td>
                  <td><Stars value={r.valueStars} label="Value" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
