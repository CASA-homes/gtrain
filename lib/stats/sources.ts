// Raw match stats from public footy stats sites, and fantasy points worked out from them ourselves.
//   AFL Tables (afltables.com): one game-by-game page per club per season. Post-match, very complete.
//   Footywire (footywire.com): one page per match. Post-match; also lists the official AF score as a cross-check.
// Neither is live during games. Both are fetched from the server (Vercel), politely: a handful of requests per run.
import { parse } from 'node-html-parser';
import { STANDARD_FORMULA, pointsWith } from '@/lib/league-scoring';

/** Fantasy points from raw stats: kick 3, handball 2, mark 3, tackle 4, hitout 1, goal 6, behind 1, free for 1, free against -3. */
//  Stored lines use the standard formula (they're shared by every league); a league's own formula is applied on read with
//  pointsWith(rules.scoring.formula, line) from lib/league-scoring.
export const fantasyPoints = (s: RawLine) => pointsWith(STANDARD_FORMULA, s);

export type RawLine = {
  source: 'afltables' | 'footywire';
  season: number; round: number; club: string; name: string;
  k: number; hb: number; m: number; g: number; b: number; ho: number; t: number; ff: number; fa: number;
  tog: number | null; points: number; official: number | null;
};

const UA = { 'User-Agent': 'KeeperHQ stats sync (keeperhq.au; contact via site)' };

// Club codes as used in players.afl_club
export const AFLTABLES_CLUBS: Record<string, string> = {
  adelaide: 'ADE', brisbanel: 'BRL', carlton: 'CAR', collingwood: 'COL', essendon: 'ESS', fremantle: 'FRE', geelong: 'GEE', goldcoast: 'GCS', gws: 'GWS',
  hawthorn: 'HAW', melbourne: 'MEL', kangaroos: 'NTH', padelaide: 'PTA', richmond: 'RIC', stkilda: 'STK', swans: 'SYD', westcoast: 'WCE', bullldogs: 'WBD',
};
const FW_CLUBS: Record<string, string> = {
  Adelaide: 'ADE', Brisbane: 'BRL', Carlton: 'CAR', Collingwood: 'COL', Essendon: 'ESS', Fremantle: 'FRE', Geelong: 'GEE', 'Gold Coast': 'GCS', GWS: 'GWS',
  Hawthorn: 'HAW', Melbourne: 'MEL', 'North Melbourne': 'NTH', Kangaroos: 'NTH', 'Port Adelaide': 'PTA', Richmond: 'RIC', 'St Kilda': 'STK', Sydney: 'SYD',
  'West Coast': 'WCE', 'Western Bulldogs': 'WBD',
};

// Rounds are stored the way the AFL numbers them (Opening Round = 0). Finals follow the last home-and-away round after a
// one-week gap: week 1 (QF/EF) = last + 2, SF = +3, PF = +4, GF = +5.
const fwClub = (name: string) => FW_CLUBS[name] ?? Object.entries(FW_CLUBS).find(([k]) => name.includes(k) || k.includes(name))?.[1]
  ?? (/greater western|giants/i.test(name) ? 'GWS' : /suns/i.test(name) ? 'GCS' : /lions/i.test(name) ? 'BRL' : /bulldogs/i.test(name) ? 'WBD' : /swans/i.test(name) ? 'SYD' : /port/i.test(name) ? 'PTA' : name);

const FINALS: Record<string, number> = { QF: 0, EF: 0, SF: 1, PF: 2, GF: 3, 'Qualifying Final': 0, 'Elimination Final': 0, 'Semi Final': 1, 'Preliminary Final': 2, 'Grand Final': 3 };

const n = (v: string | undefined) => { const x = (v ?? '').trim(); return x === '' || x === '-' ? 0 : Number(x) || 0; };

/** AFL Tables: every player-game for one club and season. AFL Tables counts Opening Round as R1, so Rn is stored as n-1. */
export async function aflTablesClub(slug: string, season: number, lastHomeAway = 24): Promise<RawLine[]> {
  const r = await fetch(`https://afltables.com/afl/stats/teams/${slug}/${season}_gbg.html`, { headers: UA, cache: 'no-store' });
  if (!r.ok) throw new Error(`AFL Tables ${slug} ${season}: ${r.status}`);
  const doc = parse(await r.text());
  const want: Record<string, keyof RawLine> = { Kicks: 'k', Handballs: 'hb', Marks: 'm', Goals: 'g', Behinds: 'b', 'Hit Outs': 'ho', Tackles: 't', Frees: 'ff', 'Frees Against': 'fa', '% Played': 'tog' };
  const lines = new Map<string, RawLine>();
  for (const table of doc.querySelectorAll('table')) {
    const heads = table.querySelectorAll('thead tr');
    const stat = heads[0]?.text.trim() ?? '';
    const key = want[stat];
    if (!key || !heads[1]) continue;
    const cols = heads[1].querySelectorAll('th, td').map((c) => c.text.trim());
    for (const row of table.querySelectorAll('tbody tr')) {
      const cells = row.querySelectorAll('td').map((c) => c.text.trim());
      const [last, first] = (cells[0] ?? '').split(',').map((s) => s.trim());
      if (!last) continue;
      const name = first ? `${first} ${last}` : last;
      cols.forEach((col, i) => {
        if (i === 0 || col === 'Tot' || cells[i] === undefined || cells[i] === '') return; // blank = didn't play
        const round = /^R\d+$/.test(col) ? Number(col.slice(1)) - 1 : col in FINALS ? lastHomeAway + 2 + FINALS[col] : null;
        if (round == null) return;
        const id = `${name}|${round}`;
        const l = lines.get(id) ?? { source: 'afltables', season, round, club: AFLTABLES_CLUBS[slug] ?? slug, name, k: 0, hb: 0, m: 0, g: 0, b: 0, ho: 0, t: 0, ff: 0, fa: 0, tog: null, points: 0, official: null };
        if (key === 'tog') l.tog = n(cells[i]); else (l[key] as number) = n(cells[i]);
        lines.set(id, l);
      });
    }
  }
  return [...lines.values()].map((l) => ({ ...l, points: fantasyPoints(l) }));
}

/** AFL Tables, whole season: all 18 clubs. */
export async function aflTablesSeason(season: number, lastHomeAway = 24): Promise<RawLine[]> {
  const slugs = Object.keys(AFLTABLES_CLUBS);
  const out: RawLine[] = [];
  for (let i = 0; i < slugs.length; i += 6) {
    const batch = await Promise.all(slugs.slice(i, i + 6).map((s) => aflTablesClub(s, season, lastHomeAway)));
    out.push(...batch.flat());
  }
  return out;
}

/** Footywire: the match ids for a season, in order. */
export async function footywireMatches(season: number): Promise<number[]> {
  const r = await fetch(`https://www.footywire.com/afl/footy/ft_match_list?year=${season}`, { headers: UA, cache: 'no-store' });
  if (!r.ok) throw new Error(`Footywire match list ${season}: ${r.status}`);
  const ids = [...(await r.text()).matchAll(/ft_match_statistics\?mid=(\d+)/g)].map((m) => Number(m[1]));
  return [...new Set(ids)];
}

/** Footywire: both teams' player stats for one match, with the official AF score alongside our own points. */
export async function footywireMatch(mid: number, season: number, lastHomeAway = 24): Promise<RawLine[]> {
  const r = await fetch(`https://www.footywire.com/afl/footy/ft_match_statistics?mid=${mid}`, { headers: UA, cache: 'no-store' });
  if (!r.ok) throw new Error(`Footywire match ${mid}: ${r.status}`);
  const doc = parse(await r.text());
  const title = doc.querySelector('title')?.text ?? '';
  const rm = title.match(/Round (\d+)/);
  const fm = Object.keys(FINALS).find((f) => f.length > 2 && title.includes(f));
  const round = rm ? Number(rm[1]) : fm ? lastHomeAway + 2 + FINALS[fm] : null;
  if (round == null) return [];
  const clubs = doc.querySelectorAll('td.innertbtitle, .innertbtitle').map((x) => x.text.trim()).filter((t) => t.endsWith('Match Statistics (Sorted by Disposals)')).map((t) => t.replace(/ Match Statistics.*$/, ''));
  const tables = doc.querySelectorAll('table').filter((t) => {
    const first = t.querySelector('tr');
    const cells = first ? first.querySelectorAll('td, th').map((c) => c.text.trim()) : [];
    return cells[0] === 'Player' && cells.includes('AF') && cells.includes('HB');
  });
  const out: RawLine[] = [];
  tables.slice(0, 2).forEach((t, ti) => {
    const rows = t.querySelectorAll('tr');
    const head = rows[0].querySelectorAll('td, th').map((c) => c.text.trim());
    const ix = (k: string) => head.indexOf(k);
    for (const row of rows.slice(1)) {
      const c = row.querySelectorAll('td').map((x) => x.text.trim());
      if (!c[0]) continue;
      const l: RawLine = {
        source: 'footywire', season, round, club: fwClub(clubs[ti] ?? ''), name: c[0],
        k: n(c[ix('K')]), hb: n(c[ix('HB')]), m: n(c[ix('M')]), g: n(c[ix('G')]), b: n(c[ix('B')]), ho: n(c[ix('HO')]), t: n(c[ix('T')]), ff: n(c[ix('FF')]), fa: n(c[ix('FA')]),
        tog: null, points: 0, official: ix('AF') >= 0 ? n(c[ix('AF')]) : null,
      };
      out.push({ ...l, points: fantasyPoints(l) });
    }
  });
  return out;
}
