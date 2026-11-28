// Trademarket board: every player in the league as a stock. One compact row per player (value, moves over the last
// week, month and season, scores, contract and clause), built once on the server and sorted/filtered in the browser.
import { clauseKt, valueTrend } from '@/lib/contracts';
import type { getMarket } from '@/lib/market';
import { shareRules } from '@/lib/shares';

/** st: c contracted · u owned but unsigned · f free agent (contracts market) · p undrafted pool · d 2026 draftee */
export type BoardStatus = 'c' | 'u' | 'f' | 'p' | 'd';
export interface BoardRow {
  id: number; n: string; pos: string[]; club: string | null; age: number | null;
  own: string | null; ownId: number | null; st: BoardStatus;
  l5: (number | null)[]; a0: number | null; g0: number; a1: number | null;
  sal: number | null; to: number | null; v: number; w: number | null; m: number | null; s: number | null;
  cl: number | null; sp: number[];
  /** shares: career AFL games, shares owned in the league, mine, and whether the database prices him (only then buyable) */
  cg: number; sold: number; mine: number; myCost: number; db: boolean;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const chg = (a: number | undefined, b: number | undefined) => (a != null && b != null && b >= 3 ? r1(((a - b) / b) * 100) : null);

export function buildBoard(m: Awaited<ReturnType<typeof getMarket>>) {
  const { d, s, league, teamCode } = m;
  const season = s?.season ?? 2027;
  const contract = new Map(d.active.map((c) => [c.player_id, c]));
  const fa = new Set(d.freeAgents.filter((f) => f.status === 'open' || f.kind === 'open' || f.kind === 'offseason').map((f) => f.player_id));
  const draftees = new Set(league.draftClass.map((x) => x.id));
  // The latest season anyone has games in is "this season"; the one before is "last season".
  let cur = 0;
  for (const p of league.players) for (const h of p.hist ?? []) if (h[1] > 0 && h[0] > cur) cur = h[0];
  cur = cur || season - 1;
  const asOf = Date.UTC(season, 2, 1);

  const ownedIds = new Set(league.players.filter((p) => p.team_id).map((p) => p.id));
  const sold = new Map<number, number>();
  const mine = new Map<number, { qty: number; cost: number }>();
  for (const h of d.shares) {
    sold.set(h.player_id, (sold.get(h.player_id) ?? 0) + h.qty);
    if (h.team_id === m.meId) mine.set(h.player_id, { qty: h.qty, cost: h.cost_kt });
  }
  const rows: BoardRow[] = [];
  const seen = new Set<number>();
  for (const p of [...league.players, ...league.freeAgents]) {
    if (seen.has(p.id) || p.list_status) continue;
    seen.add(p.id);
    const c = contract.get(p.id);
    const isDraftee = draftees.has(p.id) || p.id >= 30_000_000;
    const owned = ownedIds.has(p.id);
    const st: BoardStatus = c ? 'c' : fa.has(p.id) ? 'f' : owned ? 'u' : isDraftee ? 'd' : 'p';
    const hist = (p.hist ?? []).filter((h) => h[1] > 0);
    const h0 = hist.find((h) => h[0] === cur), h1 = hist.find((h) => h[0] === cur - 1);
    const t = valueTrend(p, 999);
    const last = t[t.length - 1];
    const v = d.rates.get(p.id) ?? last ?? 0;
    if (!h0 && !h1 && !isDraftee && !c && !owned && v < 6) continue; // nobody's interested in a retired fringe player
    const log = (p.games_log ?? []).map((g) => g[1]).filter((x): x is number => x != null);
    const l5 = log.length ? log.slice(-5) : (p.last5 ?? []).filter((x) => x != null).slice(-5);
    const step = Math.max(1, Math.floor((t.length - 1) / 11));
    const sp = t.filter((_, i) => i % step === 0 || i === t.length - 1).map((x) => Math.round(x));
    const ownId = c?.team_id ?? (owned ? p.team_id : null);
    rows.push({
      id: p.id, n: p.name, pos: p.positions, club: p.afl_club,
      age: p.birth_date ? Math.floor((asOf - new Date(p.birth_date).getTime()) / (365.25 * 86400000)) : null,
      own: ownId ? teamCode(ownId) : null, ownId, st,
      l5, a0: h0 ? r1(h0[2]) : null, g0: h0?.[1] ?? 0, a1: h1 ? r1(h1[2]) : null,
      sal: c?.salary_k ?? null, to: c?.end_season ?? null, v: Math.round(v),
      w: chg(last, t[t.length - 2]), m: chg(last, t[Math.max(0, t.length - 5)]), s: t.length > 1 ? chg(last, t[0]) : null,
      cl: c && s ? clauseKt(s, c, v, d.pendingFa.has(p.id)) : null,
      sp: sp.length > 1 ? sp : [],
      cg: p.career_games ?? 0, sold: sold.get(p.id) ?? 0, mine: mine.get(p.id)?.qty ?? 0, myCost: mine.get(p.id)?.cost ?? 0, db: d.priced.has(p.id),
    });
  }
  rows.sort((a, b) => b.v - a.v);
  const heldCost = d.shares.filter((h) => h.team_id === m.meId).reduce((t, h) => t + h.cost_kt, 0);
  const bank = m.meId ? d.banks.get(m.meId) ?? 0 : 0;
  return { rows, cur, season, meCode: m.meId ? teamCode(m.meId) : null, shares: { rules: shareRules(s as unknown as Record<string, unknown>), bank, heldCost, canTrade: !!m.meId } };
}
