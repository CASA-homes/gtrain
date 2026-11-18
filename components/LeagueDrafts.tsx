import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { uploadDraft, deleteDraft } from '@/app/(app)/league/drafts/actions';
import type { DraftPick } from '@/lib/draft-import';

type Row = { year: number; teams: string[]; picks: DraftPick[]; source: string | null };

/** League history: the league's own past drafts as a board (rounds down, clubs across), uploaded by the commish. */
export async function LeagueDrafts({ commish, year: want, error, ok }: { commish: boolean; year?: number; error?: string; ok?: string }) {
  const supabase = await createClient();
  const { data, error: qe } = await supabase.from('league_drafts').select('year, teams, picks, source').order('year', { ascending: false });
  if (qe) return null;
  const drafts = (data ?? []) as Row[];
  if (!drafts.length && !commish) return null;
  const d = drafts.find((x) => x.year === want) ?? drafts[0];
  const rounds = d ? Math.max(...d.picks.map((p) => p.round)) : 0;
  const at = (r: number, t: string) => d!.picks.filter((p) => p.round === r && p.team === t);

  return (
    <section id="drafts" className="card ld" aria-labelledby="ld-h">
      <div className="ld-h">
        <div><span className="eyebrow">League history</span><h2 id="ld-h" className="h2">{d ? `${d.year} draft` : 'Original draft'}</h2></div>
        {drafts.length > 1 && (
          <nav className="ld-years" aria-label="Draft year">
            {drafts.map((x) => <Link key={x.year} href={`/league?draft=${x.year}#drafts`} className={x.year === d?.year ? 'on' : ''}>{x.year}</Link>)}
          </nav>
        )}
      </div>
      {error && <div role="alert" className="bf-alert">{error}</div>}
      {ok && <div className="ld-ok">{ok === 'removed' ? 'Draft removed.' : `Draft loaded: ${ok}.`}</div>}
      {d ? (
        <div className="ld-scroll">
          <table className="ld-board">
            <thead><tr><th scope="col">Rd</th>{d.teams.map((t) => <th key={t} scope="col">{t}</th>)}</tr></thead>
            <tbody>
              {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
                <tr key={r}>
                  <th scope="row">{r}</th>
                  {d.teams.map((t) => <td key={t}>{at(r, t).map((p) => <span key={p.pick} className="ld-pick"><b>{p.player}</b><em>#{p.pick}</em></span>)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted" style={{ margin: 0, fontSize: 14 }}>Upload your league’s original draft and it shows here as a board for everyone.</p>}
      {commish && (
        <details className="ld-up">
          <summary className="btn">{d ? 'Upload another draft' : 'Upload a draft'}</summary>
          <form action={uploadDraft} className="bf-inline wrap">
            <input type="file" name="file" accept=".xlsx,.csv,.tsv" required aria-label="Spreadsheet" />
            <input type="number" name="year" min={1990} max={2100} defaultValue={d ? d.year - 1 : 2022} className="input bf-num" aria-label="Draft year" required />
            <label className="bf-tog"><input type="checkbox" name="snake" defaultChecked /> Snake draft</label>
            <button className="btn dark">Upload</button>
          </form>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>An .xlsx or .csv works. Either a list with Player and Team (or Coach) columns, with Round, Pick and Year columns if you have them, or a board with club names across the top and one row per round. Uploading the same year again replaces it. Tabs named by year load as separate drafts.</p>
          {d && <form action={deleteDraft}><input type="hidden" name="year" value={d.year} /><button className="btn" style={{ fontSize: 12 }}>Remove the {d.year} draft</button></form>}
        </details>
      )}
    </section>
  );
}
