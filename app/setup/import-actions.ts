'use server';
// League setup › Import: match a spreadsheet of lists to AFL players, then create the league and load the lists.
import { createClient, createClientForLeague } from '@/lib/supabase/server';
import { createLeague, type ClubIn } from './actions';

export interface SheetRow { club: string; player: string; aflClub?: string; keeper?: boolean; rookie?: boolean; coach?: string; email?: string }
export interface Match { row: number; input: string; club: string; playerId: number | null; name: string | null; aflClub: string | null; sure: boolean; options: { id: number; name: string; aflClub: string | null }[] }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const CLUB_ALIAS: Record<string, string> = { BL: 'BRL', BRI: 'BRL', GC: 'GCS', GCFC: 'GCS', NM: 'NTH', NOR: 'NTH', PA: 'PTA', POR: 'PTA', WB: 'WBD', WBU: 'WBD', SYD: 'SYD', GEEL: 'GEE', ADEL: 'ADE', COLL: 'COL', CARL: 'CAR', ESS: 'ESS', FRE: 'FRE', HAW: 'HAW', MELB: 'MEL', RICH: 'RIC', STK: 'STK', WCE: 'WCE', GWS: 'GWS' };
const clubCode = (s?: string) => { const u = (s ?? '').toUpperCase().replace(/[^A-Z]/g, ''); return CLUB_ALIAS[u] ?? (u.length === 3 ? u : ''); };

type P = { id: number; name: string; full_name: string | null; afl_club: string | null };

/** Match every row's player name to the AFL player list. Sure = one clear match; otherwise options to pick from. */
export async function matchSheet(rows: SheetRow[]): Promise<{ ok: boolean; matches: Match[]; error?: string }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return { ok: false, matches: [], error: 'Sign in first.' };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, matches: [], error: 'The sheet has no players.' };
  if (rows.length > 1200) return { ok: false, matches: [], error: 'That’s more than 1,200 rows: one row per listed player, please.' };
  const q = await supabase.from('players').select('id, name, full_name, afl_club').limit(3000);
  if (q.error) return { ok: false, matches: [], error: /policy|permission/i.test(q.error.message) ? 'League import needs supabase/migrations/0030 run first.' : q.error.message };
  const all = (q.data ?? []) as P[];
  const byFull = new Map<string, P[]>();
  const add = (k: string, p: P) => { if (!k) return; const a = byFull.get(k) ?? []; if (!a.includes(p)) a.push(p); byFull.set(k, a); };
  for (const p of all) { add(norm(p.full_name ?? ''), p); add(norm(p.name), p); }
  const out: Match[] = rows.map((r, i) => {
    const input = String(r.player ?? '').trim().slice(0, 80);
    const n = norm(input), club = clubCode(r.aflClub);
    let cands = byFull.get(n) ?? [];
    if (!cands.length && n) {
      // "B. Smith" / "Smith, Bailey" / surname only: surname plus first initial when given
      const parts = n.includes(',') ? n.split(',').reverse().join(' ').split(' ') : n.split(' ');
      const last = parts[parts.length - 1], first = parts.length > 1 ? parts[0] : '';
      cands = all.filter((p) => { const f = norm(p.full_name ?? p.name).split(' '); return f[f.length - 1] === last && (!first || f[0].startsWith(first[0])); });
    }
    if (club && cands.length > 1) { const c = cands.filter((p) => p.afl_club === club); if (c.length) cands = c; }
    const one = cands.length === 1 ? cands[0] : null;
    return { row: i, input, club: String(r.club ?? '').trim().slice(0, 40), playerId: one?.id ?? null, name: one ? (one.full_name ?? one.name) : null, aflClub: one?.afl_club ?? null,
      sure: !!one && (byFull.get(n)?.length === 1), options: cands.slice(0, 6).map((p) => ({ id: p.id, name: p.full_name ?? p.name, aflClub: p.afl_club })) };
  });
  return { ok: true, matches: out };
}

export interface ImportIn {
  name: string; season: number; scoring: 'afl' | 'sc'; preset: 'classic' | 'dynasty' | 'later';
  clubs: ClubIn[]; myClub: number;
  lists: { club: string; playerId: number; keeper: boolean; rookie: boolean }[];
}

/** Create the league (you become commish), then load every club's list. */
export async function runImport(x: ImportIn): Promise<{ ok: boolean; id?: number; loaded?: number; error?: string }> {
  const ids = (x.lists ?? []).map((l) => l.playerId);
  if (new Set(ids).size !== ids.length) return { ok: false, error: 'A player is on two lists. Fix the duplicates and try again.' };
  const per = new Map<string, { k: number; r: number }>();
  for (const l of x.lists) { const c = per.get(l.club) ?? { k: 0, r: 0 }; if (l.rookie) c.r++; else if (l.keeper) c.k++; per.set(l.club, c); }
  for (const [club, c] of per) {
    if (c.r > 1) return { ok: false, error: `${club} has ${c.r} rookie keepers: one at most.` };
    if (c.k > 17) return { ok: false, error: `${club} has ${c.k} keepers: 17 at most, plus a rookie keeper.` };
  }
  const made = await createLeague({ name: x.name, season: x.season, scoring: x.scoring, preset: x.preset, clubs: x.clubs, myClub: x.myClub });
  if (!made.ok || !made.id) return made;
  const db = await createClientForLeague(made.id);
  const t = await db.from('teams').select('id, name');
  if (t.error) return { ok: false, id: made.id, error: `League created, but loading lists failed: ${t.error.message}` };
  const teamId = new Map((t.data ?? []).map((r) => [String(r.name).toLowerCase(), r.id as number]));
  const rows = x.lists.map((l) => ({ player_id: l.playerId, team_id: teamId.get(l.club.trim().toLowerCase().slice(0, 40)), is_keeper: l.keeper || l.rookie, is_rookie_keeper: l.rookie, acquired_how: 'import', acquired_season: x.season }))
    .filter((r) => r.team_id != null);
  for (let i = 0; i < rows.length; i += 400) {
    const r = await db.from('squad').insert(rows.slice(i, i + 400));
    if (r.error) return { ok: false, id: made.id, error: `League created, but loading lists failed: ${r.error.message}. You can add players from League settings.` };
  }
  await db.from('leagues').update({ source: 'sheet' }).eq('id', made.id);
  return { ok: true, id: made.id, loaded: rows.length };
}
