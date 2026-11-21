// Roster import: read a spreadsheet (or, next, screenshots) into clubs → players, and match each name to our players.
// Our code does the matching, never the AI, so an import can't invent players. Shapes handled:
//   list   a header row with a player column and a club/coach/team column (AFL club and position optional)
//   board  club names across one row, players in the columns underneath
//   blocks a club name on its own row, then its players underneath (most fantasy exports and draft sheets)
export type Grid = string[][];
export interface ImportRow { raw: string; club?: string | null }
export interface ImportClub { name: string; rows: ImportRow[] }

export interface PlayerLite { id: number; name: string; full_name: string | null; afl_club: string | null; positions: string[] }
export type MatchStatus = 'sure' | 'check' | 'many' | 'none';
export interface Match { raw: string; status: MatchStatus; id: number | null; cands: number[] }

// ---------- AFL clubs: every way people write them, to our three-letter codes ----------
const CLUB_ALIASES: Record<string, string[]> = {
  ADE: ['ade', 'adelaide', 'crows', 'ad'], BRL: ['brl', 'bri', 'bris', 'brisbane', 'lions', 'bl', 'brisbanelions'],
  CAR: ['car', 'carl', 'carlton', 'blues', 'ca'], COL: ['col', 'coll', 'collingwood', 'pies', 'magpies', 'cw'],
  ESS: ['ess', 'essendon', 'bombers', 'es'], FRE: ['fre', 'freo', 'fremantle', 'dockers', 'fr'],
  GCS: ['gcs', 'gc', 'gcfc', 'goldcoast', 'suns', 'goldcoastsuns'], GEE: ['gee', 'geel', 'geelong', 'cats', 'ge'],
  GWS: ['gws', 'giants', 'greaterwesternsydney', 'gwsgiants'], HAW: ['haw', 'hawthorn', 'hawks', 'hw'],
  MEL: ['mel', 'melb', 'melbourne', 'demons', 'me'], NTH: ['nth', 'nm', 'nmfc', 'north', 'northmelbourne', 'kangaroos', 'kangas'],
  PTA: ['pta', 'port', 'pa', 'portadelaide', 'power'], RIC: ['ric', 'rich', 'richmond', 'tigers', 'ri'],
  STK: ['stk', 'sk', 'stkilda', 'saints'], SYD: ['syd', 'sydney', 'swans', 'sy'],
  WBD: ['wbd', 'wb', 'bulldogs', 'westernbulldogs', 'dogs'], WCE: ['wce', 'wc', 'westcoast', 'eagles', 'westcoasteagles'],
};
const CLUB_OF = new Map<string, string>(Object.entries(CLUB_ALIASES).flatMap(([code, xs]) => xs.map((x) => [x, code] as [string, string])));
export const clubCode = (s: string | null | undefined) => (s ? CLUB_OF.get(s.toLowerCase().replace(/[^a-z]/g, '')) ?? null : null);

// ---------- names ----------
const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const NICK: Record<string, string> = { nick: 'nicholas', josh: 'joshua', jack: 'john', matt: 'matthew', tom: 'thomas', sam: 'samuel', ben: 'benjamin', dan: 'daniel', will: 'william', zac: 'zachary', jake: 'jacob', max: 'maxwell', tim: 'timothy', alex: 'alexander', chris: 'christopher', mitch: 'mitchell', ed: 'edward', charlie: 'charles' };

/** Pull the name (and any AFL club written next to it) out of a messy cell: "Jack Steele�SK - C", "N. Daicos (COL)", "Daicos, Nick". */
export function cleanName(cell: string): { name: string; club: string | null } {
  let s = String(cell ?? '').replace(/�/g, '|').trim();
  let club: string | null = null;
  const paren = s.match(/\(([A-Za-z ]{2,20})\)/);
  if (paren) { club = clubCode(paren[1]); s = s.replace(paren[0], ' '); }
  const piped = s.split('|');
  if (piped.length > 1) { const m = piped[1].match(/^\s*([A-Za-z]{2,5})\b/); if (m) club = club ?? clubCode(m[1]); s = piped[0]; }
  const dash = s.match(/^(.*?)\s+[-–]\s+([A-Za-z]{2,5})\b/);
  if (dash && clubCode(dash[2])) { club = club ?? clubCode(dash[2]); s = dash[1]; }
  if (/^[^,]+,\s*[^,]+$/.test(s) && !/\d/.test(s)) { const [last, first] = s.split(',').map((x) => x.trim()); s = `${first} ${last}`; }
  s = s.replace(/\b(DEF|MID|RUC|FWD|C|B|R|F)(\/(DEF|MID|RUC|FWD|C|B|R|F))*\s*$/, '').replace(/\s+/g, ' ').trim();
  return { name: s, club };
}

export function buildIndex(players: PlayerLite[]) {
  const full = new Map<string, number[]>(); const initLast = new Map<string, number[]>(); const last = new Map<string, number[]>();
  const add = (m: Map<string, number[]>, k: string, id: number) => { if (!k) return; const a = m.get(k) ?? []; if (!a.includes(id)) a.push(id); m.set(k, a); };
  for (const p of players) {
    const fn = norm(p.full_name ?? '');
    const parts = fn.split(' ');
    const ln = parts.slice(1).join(' ') || norm(p.name).split(' ').slice(1).join(' ');
    add(full, fn, p.id);
    if (parts[0]) { add(full, `${NICK[parts[0]] ?? parts[0]} ${ln}`, p.id); add(initLast, `${parts[0][0]} ${ln}`, p.id); }
    const short = norm(p.name);               // "n daicos"
    add(initLast, short, p.id);
    add(last, ln, p.id);
  }
  const byId = new Map(players.map((p) => [p.id, p]));
  return { full, initLast, last, byId };
}
export type PlayerIndex = ReturnType<typeof buildIndex>;

/** Match one cell to a player. "sure" = one clear hit; "check" = a single likely hit worth a glance; "many" = pick one. */
export function matchName(idx: PlayerIndex, cell: string, clubHint?: string | null): Match {
  const { name, club } = cleanName(cell);
  const hint = clubHint ?? club;
  const n = norm(name);
  const raw = name;
  if (!n || n.length < 3) return { raw, status: 'none', id: null, cands: [] };
  const parts = n.split(' ');
  const byClub = (ids: number[]) => (hint ? ids.filter((id) => idx.byId.get(id)?.afl_club === hint) : ids);
  const pick = (ids: number[] | undefined, sure: MatchStatus): Match | null => {
    if (!ids?.length) return null;
    const narrowed = byClub(ids);
    if (narrowed.length === 1) return { raw, status: ids.length === 1 || hint ? sure : 'check', id: narrowed[0], cands: ids };
    if (ids.length === 1) return { raw, status: hint ? 'check' : sure, id: ids[0], cands: ids };
    return { raw, status: 'many', id: null, cands: narrowed.length ? narrowed : ids };
  };
  const first = parts[0].replace(/\.$/, '');
  const lastName = parts.slice(1).join(' ');
  return pick(idx.full.get(n), 'sure')
    ?? pick(idx.full.get(`${NICK[first] ?? first} ${lastName}`), 'sure')
    ?? pick(idx.initLast.get(`${first[0]} ${lastName}`), first.length === 1 ? 'sure' : 'check')
    ?? (parts.length === 1 ? pick(idx.last.get(n), 'check') : pick(idx.last.get(lastName), 'check'))
    ?? { raw, status: 'none', id: null, cands: [] };
}

// ---------- reading a grid into clubs ----------
const lower = (s: string) => s.toLowerCase().replace(/[^a-z#]/g, '');
const PLAYER_H = ['player', 'playername', 'name', 'selection', 'drafted'];
const CLUB_H = ['team', 'teamname', 'coach', 'owner', 'club', 'manager', 'draftedby', 'fantasyteam', 'fantasyclub'];
const AFL_H = ['aflclub', 'aflteam', 'realclub', 'squad', 'afl'];
const findCol = (h: string[], keys: string[]) => h.findIndex((c) => keys.includes(lower(c)));
const cell = (r: string[], i: number) => String(r?.[i] ?? '').trim();

export function readGrid(g: Grid, idx: PlayerIndex): ImportClub[] {
  // 1. list
  for (let hr = 0; hr < Math.min(10, g.length); hr++) {
    const h = g[hr] ?? [];
    const pc = findCol(h, PLAYER_H), tc = findCol(h, CLUB_H);
    if (pc < 0 || tc < 0) continue;
    const ac = findCol(h, AFL_H);
    const by = new Map<string, ImportRow[]>();
    for (const r of g.slice(hr + 1)) {
      const raw = cell(r, pc), team = cell(r, tc);
      if (!raw || !team) continue;
      by.set(team, [...(by.get(team) ?? []), { raw, club: ac >= 0 ? clubCode(cell(r, ac)) : null }]);
    }
    if (by.size) return [...by].map(([name, rows]) => ({ name, rows }));
  }
  const isPlayer = (s: string) => { const m = matchName(idx, s); return m.status !== 'none'; };
  // A cell that reads like a person's name, even if we don't know the player (so the review can flag him).
  const nameLike = (s: string) => { const n = cleanName(s).name; return isPlayer(s) || (/^[A-Za-z][A-Za-z'’.\- ]{3,40}$/.test(n) && n.trim().split(/\s+/).length >= 2 && !/^(pick|player|round|team|club|coach)\b/i.test(n)); };
  // 2. board: a row of ≥3 non-player labels with mostly players underneath
  for (let hr = 0; hr < Math.min(10, g.length); hr++) {
    const h = g[hr] ?? [];
    const cols = h.map((c, i) => ({ c: String(c ?? '').trim(), i })).filter((x) => x.c && !isPlayer(x.c) && !/^(round|rd|pick|#|\d+)$/i.test(x.c));
    if (cols.length < 3) continue;
    const below = g.slice(hr + 1, hr + 6);
    const hits = cols.filter((x) => below.filter((r) => isPlayer(cell(r, x.i))).length >= 2).length;
    if (hits < Math.ceil(cols.length * 0.6)) continue;
    return cols.map((x) => ({ name: x.c, rows: g.slice(hr + 1).map((r) => cell(r, x.i)).filter((v) => v && nameLike(v)).map((raw) => ({ raw })) }));
  }
  // 3. blocks: a club title on its own, players below until the next title
  const out: ImportClub[] = [];
  let cur: ImportClub | null = null;
  for (const r of g) {
    const filled = (r ?? []).map((c) => String(c ?? '').trim()).filter(Boolean);
    if (!filled.length) continue;
    const players = filled.filter((c) => nameLike(c));
    const hasNumbers = filled.some((c) => /^-?\d+(\.\d+)?$/.test(c));
    if (!hasNumbers && filled.length <= 2 && !filled.some((c) => isPlayer(c)) && !/^(pick|player|round|rd|#|name)$/i.test(filled[0]) && !/^[-\d.]+$/.test(filled[0])) {
      cur = { name: filled[0], rows: [] }; out.push(cur); continue;
    }
    if (cur) for (const p of players) cur.rows.push({ raw: p });
  }
  return out.filter((c) => c.rows.length);
}

/** CSV/TSV text to a grid. */
export function csvGrid(text: string): Grid {
  const first = text.split('\n')[0] ?? '';
  const sep = (first.match(/\t/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? '\t' : ',';
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
