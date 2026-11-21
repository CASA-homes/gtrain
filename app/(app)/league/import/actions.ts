'use server';
import ExcelJS from 'exceljs';
import { revalidatePath } from 'next/cache';
import { getCoach } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { buildIndex, clubCode, csvGrid, matchName, readGrid, type Grid, type ImportClub, type MatchStatus, type PlayerLite } from '@/lib/roster-import';

export interface PreviewRow { raw: string; status: MatchStatus; id: number | null; cands: number[] }
export interface PreviewClub { name: string; rows: PreviewRow[] }
export interface Preview { ok: true; clubs: PreviewClub[]; players: Record<number, { name: string; club: string | null; pos: string }> }
type Err = { ok: false; error: string };

async function commish() { const me = await getCoach(); return me?.is_commish ? me : null; }

async function loadPlayers(): Promise<PlayerLite[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('players').select('id, name, full_name, afl_club, positions');
  return (data ?? []) as PlayerLite[];
}

/** Add every AFL-listed player we don't have yet, from the AFL Fantasy feed. */
export async function syncPlayerList(): Promise<{ ok: true; added: number; total: number } | Err> {
  if (!(await commish())) return { ok: false, error: 'Only the commish can do that.' };
  const base = process.env.SCORE_FEED_BASE || 'https://fantasy.afl.com.au/json/fantasy/';
  try {
    const [pr, sr] = await Promise.all([fetch(base + 'players.json', { cache: 'no-store' }), fetch(base + 'squads.json', { cache: 'no-store' })]);
    if (!pr.ok || !sr.ok) return { ok: false, error: 'Couldn’t reach the AFL Fantasy player list. Try again in a minute.' };
    const players = (await pr.json()) as { id: number; firstName: string; lastName: string; squadId: number; position: string[]; dob?: string }[];
    const squads = (await sr.json()) as { id: number; name: string; abbreviation: string }[];
    const club = new Map(squads.map((s) => [s.id, clubCode(s.name) ?? clubCode(s.abbreviation)]));
    const rows = players.map((p) => ({
      fid: p.id, full: `${p.firstName} ${p.lastName}`.trim(), name: `${p.firstName?.[0] ?? ''}. ${p.lastName}`.trim(),
      club: club.get(p.squadId) ?? null, pos: (p.position ?? []).filter((x) => ['DEF', 'MID', 'RUC', 'FWD'].includes(x)), dob: p.dob?.slice(0, 10) ?? null,
    }));
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('sync_players', { p_players: rows });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/', 'layout');
    const r = data as { added: number; total: number };
    return { ok: true, added: r.added, total: r.total };
  } catch { return { ok: false, error: 'Couldn’t read the AFL Fantasy player list.' }; }
}

async function gridsFrom(form: FormData): Promise<{ name: string; grid: Grid }[]> {
  const out: { name: string; grid: Grid }[] = [];
  const text = String(form.get('text') ?? '').trim();
  if (text) out.push({ name: 'Pasted', grid: csvGrid(text) });
  const file = form.get('file');
  if (file instanceof File && file.size) {
    if (file.size > 5 * 1024 * 1024) throw new Error('That file is over 5 MB.');
    const buf = Buffer.from(await file.arrayBuffer());
    if (/\.(csv|tsv|txt)$/i.test(file.name)) out.push({ name: file.name, grid: csvGrid(buf.toString('utf8')) });
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
        out.push({ name: ws.name, grid: Array.from(grid, (x) => x ?? []) });
      });
    }
  }
  return out;
}

/** Turn already-read clubs (spreadsheet or screenshots) into a review: each name matched to a player. */
export async function previewClubs(clubs: ImportClub[]): Promise<Preview | Err> {
  if (!clubs.length) return { ok: false, error: 'Couldn’t find any clubs and players in that.' };
  const players = await loadPlayers();
  const idx = buildIndex(players);
  const used = new Set<number>();
  const out: PreviewClub[] = clubs.map((c) => ({
    name: c.name.slice(0, 40),
    rows: c.rows.map((r) => {
      const m = matchName(idx, r.raw, r.club ?? null);
      // The same player twice: keep the first, make the second a "check".
      if (m.id && used.has(m.id)) return { raw: m.raw, status: 'check' as MatchStatus, id: null, cands: m.cands };
      if (m.id) used.add(m.id);
      return { raw: m.raw, status: m.status, id: m.id, cands: m.cands.slice(0, 6) };
    }),
  }));
  const ids = new Set(out.flatMap((c) => c.rows.flatMap((r) => [r.id, ...r.cands]).filter((x): x is number => x != null)));
  const look = Object.fromEntries(players.filter((p) => ids.has(p.id)).map((p) => [p.id, { name: p.full_name ?? p.name, club: p.afl_club, pos: (p.positions ?? []).join('/') }]));
  return { ok: true, clubs: out, players: look };
}

export async function parseSheet(form: FormData): Promise<Preview | Err> {
  if (!(await commish())) return { ok: false, error: 'Only the commish can import rosters.' };
  let sheets: { name: string; grid: Grid }[];
  try { sheets = await gridsFrom(form); } catch (e) { return { ok: false, error: e instanceof Error && e.message.includes('5 MB') ? e.message : 'Couldn’t read that file. Save it as .xlsx or .csv and try again.' }; }
  if (!sheets.length) return { ok: false, error: 'Choose a spreadsheet, or paste your lists.' };
  const idx = buildIndex(await loadPlayers());
  // Use the sheet that yields the most players.
  const best = sheets.map((s) => readGrid(s.grid, idx)).sort((a, b) => b.reduce((n, c) => n + c.rows.length, 0) - a.reduce((n, c) => n + c.rows.length, 0))[0] ?? [];
  if (!best.length) return { ok: false, error: 'Couldn’t find clubs and players in that file. It needs club names (as a column, a heading row, or one title per club) with players underneath.' };
  return previewClubs(best);
}

export async function searchPlayers(q: string): Promise<{ id: number; name: string; club: string | null; pos: string }[]> {
  if (!(await commish()) || q.trim().length < 2) return [];
  const supabase = await createClient();
  const t = q.trim().replace(/[%_,()*\\]/g, '');
  const { data } = await supabase.from('players').select('id, name, full_name, afl_club, positions').or(`full_name.ilike.%${t}%,name.ilike.%${t}%`).limit(8);
  return ((data ?? []) as PlayerLite[]).map((p) => ({ id: p.id, name: p.full_name ?? p.name, club: p.afl_club, pos: (p.positions ?? []).join('/') }));
}

export async function commitImport(clubs: { team_id: number; name: string | null; players: number[] }[]): Promise<{ ok: true; clubs: number; players: number } | Err> {
  if (!(await commish())) return { ok: false, error: 'Only the commish can import rosters.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('import_rosters', { p_clubs: clubs, p_replace: true });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true, ...(data as { clubs: number; players: number }) };
}
