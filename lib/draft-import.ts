// Reads a league's past draft out of a spreadsheet grid (rows of cells). Handles the two shapes people keep drafts in:
//  1. A list: a header row with a player column and a team/coach column (round, pick and year columns optional).
//  2. A draft board: a row of team names across the top, then one row of players per round
//     (an optional first column of round labels like "1", "R1" or "Round 1").
export interface DraftPick { round: number; pick: number; team: string; player: string }
export interface ParsedDraft { year: number; teams: string[]; picks: DraftPick[] }
export type Grid = string[][];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z#]/g, '');
const PLAYER = ['player', 'playername', 'name', 'selection', 'drafted', 'pickname'];
const TEAM = ['team', 'teamname', 'coach', 'owner', 'club', 'manager', 'draftedby', 'fantasyteam'];
const ROUND = ['round', 'rd', 'rnd'];
const PICK = ['pick', 'overall', 'overallpick', 'no', '#', 'pickno', 'picknumber', 'selectionno'];
const YEAR = ['year', 'season', 'draftyear'];
const find = (h: string[], keys: string[]) => h.findIndex((c) => keys.includes(norm(c)));
const num = (s: string | undefined) => { const m = String(s ?? '').match(/\d+/); return m ? Number(m[0]) : NaN; };
const isRoundLabel = (s: string) => /^\s*(r(ou)?n?d?\.?\s*)?\d{1,2}\s*$/i.test(s);
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function fromList(g: Grid, year: number): ParsedDraft[] | null {
  for (let hr = 0; hr < Math.min(12, g.length); hr++) {
    const h = g[hr];
    const pc = find(h, PLAYER), tc = find(h, TEAM);
    if (pc < 0 || tc < 0) continue;
    const rc = find(h, ROUND), kc = find(h, PICK), yc = find(h, YEAR);
    const byYear = new Map<number, DraftPick[]>();
    let n = 0;
    for (const row of g.slice(hr + 1)) {
      const player = clean(row[pc] ?? ''), team = clean(row[tc] ?? '');
      if (!player || !team) continue;
      n++;
      const y = yc >= 0 && Number.isFinite(num(row[yc])) ? num(row[yc]) : year;
      const list = byYear.get(y) ?? [];
      const pick = kc >= 0 && Number.isFinite(num(row[kc])) ? num(row[kc]) : list.length + 1;
      list.push({ round: rc >= 0 && Number.isFinite(num(row[rc])) ? num(row[rc]) : 0, pick, team, player });
      byYear.set(y, list);
    }
    if (!n) return null;
    return [...byYear].map(([y, picks]) => {
      const teams: string[] = [];
      for (const p of picks.sort((a, b) => a.pick - b.pick)) if (!teams.includes(p.team)) teams.push(p.team);
      // No round column: work it out from the number of clubs.
      if (picks.every((p) => !p.round)) picks.forEach((p, i) => { p.round = Math.floor(i / teams.length) + 1; });
      return { year: y, teams, picks };
    });
  }
  return null;
}

function fromBoard(g: Grid, year: number, snake: boolean): ParsedDraft[] | null {
  for (let hr = 0; hr < Math.min(12, g.length); hr++) {
    const h = g[hr];
    const cells = h.map((c, i) => ({ c: clean(c), i })).filter((x) => x.c);
    const named = cells.filter((x) => !isRoundLabel(x.c) && !/^round$/i.test(x.c) && !/^r(ou)?n?d$/i.test(x.c));
    if (named.length < 3 || named.some((x) => /^\d+$/.test(x.c))) continue;
    const cols = named.map((x) => x.i);
    const teams = named.map((x) => x.c);
    const picks: DraftPick[] = [];
    let round = 0;
    for (const row of g.slice(hr + 1)) {
      const got = cols.map((ci) => clean(row[ci] ?? ''));
      if (got.filter(Boolean).length < Math.ceil(cols.length / 2)) continue;
      const lead = clean(row[0] ?? '');
      round = !cols.includes(0) && isRoundLabel(lead) ? num(lead) : round + 1;
      const n = teams.length;
      got.forEach((player, ti) => {
        if (!player) return;
        const slot = snake && round % 2 === 0 ? n - ti : ti + 1;
        picks.push({ round, pick: (round - 1) * n + slot, team: teams[ti], player });
      });
    }
    if (picks.length < teams.length) continue;
    return [{ year, teams, picks: picks.sort((a, b) => a.pick - b.pick) }];
  }
  return null;
}

/** Try every sheet; list shape first, then board shape. */
export function parseDraft(sheets: { name: string; grid: Grid }[], year: number, snake: boolean): ParsedDraft[] {
  const out: ParsedDraft[] = [];
  for (const s of sheets) {
    const y = /\b(19|20)\d{2}\b/.test(s.name) && sheets.length > 1 ? Number(s.name.match(/\b(19|20)\d{2}\b/)![0]) : year;
    const r = fromList(s.grid, y) ?? fromBoard(s.grid, y, snake);
    if (r) out.push(...r);
  }
  // One draft per year; keep the biggest if two sheets claim the same year.
  const best = new Map<number, ParsedDraft>();
  for (const d of out) if (!best.has(d.year) || best.get(d.year)!.picks.length < d.picks.length) best.set(d.year, d);
  return [...best.values()].sort((a, b) => b.year - a.year);
}

/** CSV text to a grid (quoted fields, commas or tabs). */
export function csvGrid(text: string): Grid {
  const sep = (text.split('\n')[0].match(/\t/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? '\t' : ',';
  const rows: Grid = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
