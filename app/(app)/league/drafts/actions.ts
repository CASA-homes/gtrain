'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import ExcelJS from 'exceljs';
import { getMe } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { csvGrid, parseDraft, type Grid } from '@/lib/draft-import';

const back = (msg?: string, ok?: string) => {
  revalidatePath('/league');
  redirect(`/league?${msg ? `draftError=${encodeURIComponent(msg)}` : `draftOk=${encodeURIComponent(ok ?? '')}`}#drafts`);
};

/** Commish uploads a spreadsheet (xlsx or csv) of a past draft. Saves one draft per year found, replacing that year. */
export async function uploadDraft(form: FormData) {
  const me = await getMe();
  if (!me?.is_commish) return back('Only the commish can upload drafts.');
  const file = form.get('file');
  const year = Number(form.get('year'));
  const snake = form.get('snake') === 'on';
  if (!(file instanceof File) || !file.size) return back('Choose a spreadsheet to upload.');
  if (file.size > 5 * 1024 * 1024) return back('That file is over 5 MB.');
  if (!(year >= 1990 && year <= 2100)) return back('Which year was this draft?');

  const sheets: { name: string; grid: Grid }[] = [];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    if (/\.(csv|tsv|txt)$/i.test(file.name)) sheets.push({ name: file.name, grid: csvGrid(buf.toString('utf8')) });
    else {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      wb.eachSheet((ws) => {
        const grid: Grid = [];
        ws.eachRow({ includeEmpty: true }, (row, r) => {
          const cells: string[] = [];
          row.eachCell({ includeEmpty: true }, (c, ci) => { cells[ci - 1] = (c.text ?? '').toString(); });
          grid[r - 1] = Array.from(cells, (x) => x ?? '');
        });
        sheets.push({ name: ws.name, grid: Array.from(grid, (x) => x ?? []) });
      });
    }
  } catch { return back('Couldn’t read that file. Save it as .xlsx or .csv and try again.'); }

  const drafts = parseDraft(sheets, year, snake);
  if (!drafts.length) return back('Couldn’t find a draft in that file. It needs a header row with Player and Team (or Coach) columns, or team names across the top with one row per round.');
  const supabase = await createClient();
  const { error } = await supabase.from('league_drafts').upsert(
    drafts.map((d) => ({ year: d.year, teams: d.teams, picks: d.picks, source: file.name.slice(0, 120) })),
    { onConflict: 'league_id,year' },
  );
  if (error) return back(error.message);
  back(undefined, drafts.map((d) => `${d.year} (${d.picks.length} picks)`).join(', '));
}

export async function deleteDraft(form: FormData) {
  const me = await getMe();
  if (!me?.is_commish) return back('Only the commish can remove drafts.');
  const supabase = await createClient();
  const { error } = await supabase.from('league_drafts').delete().eq('year', Number(form.get('year')));
  if (error) return back(error.message);
  back(undefined, 'removed');
}
