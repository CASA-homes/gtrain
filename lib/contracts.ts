// Contracts, salary cap and the transfer market (shadow season). The database (migrations 0030–0033) is the source of
// truth for every rule and price; the helpers here only mirror its maths so pages can show previews.
// Salaries are cap dollars in thousands ($98,000 = 98). Tokens here are paper KT, separate from real tokens.
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getLeague, getMe, type Me, type Team } from '@/lib/data';
import freeAgentData from '@/lib/free-agent-players.json';
import { age, LINES, type Line, type PlayerRow } from '@/lib/ratings';

export type Tier = 'standard' | 'high' | 'none' | 'protected';

export interface KcSettings { fa_day?: string | null;
  league_id: number; season: number; shadow: boolean;
  keeper_cap_k: number; season_cap_k: number; tax_line_k: number; tax_kt_per_k: number; start_kt: number;
  max_years: number; long_deal_limit: number;
  floor_def: number; floor_mid: number; floor_ruc: number; floor_fwd: number;
  clause_std: number; clause_high: number; kt_per_k: number; high_pct: number; none_pct: number; home_grown_pct: number;
  levy_pct: number; max_buys: number; deficit_max_k: number; hold_back_k: number; midseason_at: string | null; deposit_pct: number; loan_max_pct: number; rookie_lock_at: string | null; setup_until: string | null; release_fee_pct: number; ext_premium_pct: number; ext_fee_kt: number; fee_kt_per_k: number; clause_std_pct: number; clause_high_pct: number; deficit_fee_kt: number;
  window_open: boolean; window_kind: string | null; window_opened_at: string | null; window_closes_at: string | null;
  seeded_at: string | null;
}

export interface Contract {
  id: number; player_id: number; team_id: number; base_k: number; salary_k: number; start_season: number; end_season: number;
  tier: Tier; rookie: boolean; home_grown: boolean; how: string; status: 'active' | 'pending' | 'released' | 'expired' | 'voided';
  dead_k: number; dead_season: number | null;
  rookie_slot_season: number | null; clause_kt: number | null; locked_until: string | null; draft_review?: boolean; provisional?: boolean;
}
export interface Auction { id: number; contract_id: number; player_id: number; seller_team: number; reserve_kt: number; ends_at: string; status: string; bids: { team_id: number; amount_kt: number; created_at: string }[] }
export interface FreeAgent { id: number; player_id: number; ex_team: number | null; closes_at: string | null; status: string; kind: 'open' | 'pending' | 'offseason'; offers: number; match_offer?: number | null; match_by?: string | null }
export interface MyOffer { id: number; fa_id: number; team_id: number; years: number; salary_k: number; tier: Tier; sweet_kt: number; pick_ids: number[]; score: number; status: string }
export interface Transfer { id: number; player_id: number | null; from_team: number | null; to_team: number | null; kind: string; fee_kt: number; levy_kt: number; note: string | null; created_at: string }

export const TIER_LABEL: Record<Tier, string> = { standard: 'Standard', high: 'High', none: 'No clause', protected: 'Protected to mid-season' };
export const LENGTH_FACTOR: Record<number, number> = { 1: 1.06, 2: 1.03, 3: 1.0, 4: 0.967, 5: 0.933 };
export const lengthFactor = (years: number) => LENGTH_FACTOR[years] ?? 0.933;
export const NOT_FIT = new Set(['LONG', 'SEASON', 'OUT', 'SUSP', 'DEL']);

export const money = (k: number) => `$${(Math.round(k) * 1000).toLocaleString('en-AU')}`;
export const moneyK = (k: number) => `$${Math.round(k).toLocaleString('en-AU')}k`;
export const kt = (n: number) => `${Math.round(n).toLocaleString('en-AU')} KT`;

export function premium(s: KcSettings, tier: Tier) {
  return 1 + (tier === 'high' ? s.high_pct : tier === 'none' ? s.none_pct : 0) / 100;
}
/** Release clause in KT, as the database works it out. Null = can't be bought: no clause, or final year (final-year
 *  players become pending free agents at mid-season instead). Pass pending = true for a pending free agent. */
/** Release clause as a share of market value: standard 50%, high 100% (settings), in KT. */
export function clauseFor(s: KcSettings, tier: Tier, rate: number): number | null {
  if (tier !== 'standard' && tier !== 'high') return null;
  return Math.round((rate * s.kt_per_k * (tier === 'high' ? s.clause_high_pct ?? 100 : s.clause_std_pct ?? 50)) / 100);
}
/** A contract's clause: fixed at signing (clause_kt). None in his last 6 months (final year, once the mid-season window
 *  has closed), for no-clause deals or pending free agents. */
export function clauseKt(s: KcSettings, c: Pick<Contract, 'tier' | 'end_season'> & { clause_kt?: number | null }, rate: number, pending = false): number | null {
  if (c.tier === 'none' || c.tier === 'protected' || (c.end_season <= s.season && !!s.midseason_at) || pending) return null;
  return c.clause_kt ?? clauseFor(s, c.tier, rate);
}
export interface Claim { id: number; contract_id: number; player_id: number; buyer_team: number; seller_team: number; price_kt: number; season: number; expires_at: string; status: string; created_at: string; drop_player?: number | null }
export interface CapAdjust { team_id: number; season: number; amount_k: number; reason: string }
/** Cost of releasing a contract now: 50% of salary dead this season, 20% a season after that, and a KT fee of
 *  release_fee_pct of what's left on the deal (1 KT = $1k). Mirrors kc_release. */
/** First off-season, until deadline day: signings are provisional and there are no KT fees. */
export const inSetup = (s: Pick<KcSettings, 'setup_until'>) => !!s.setup_until && new Date(s.setup_until) > new Date();
export const DEPOSIT_TERMS = [{ months: 6, pct: 4, label: '6 months' }, { months: 12, pct: 10, label: '1 year' }, { months: 24, pct: 25, label: '2 years' }] as const;
export function releaseCost(s: KcSettings, c: Pick<Contract, 'salary_k' | 'start_season' | 'end_season'>) {
  const years = Math.max(1, c.end_season - Math.max(c.start_season, s.season) + 1);
  return { now: Math.round(c.salary_k * 0.5), later: years > 1 ? Math.round(c.salary_k * 0.2) : 0, laterYears: years - 1, fee: inSetup(s) ? 0 : Math.round(((c.salary_k * years * (s.release_fee_pct ?? 10)) / 100) * (s.fee_kt_per_k ?? 5)) };
}
/** Per-year salary of a new deal: rate × length factor (× home-grown discount), then the clause premium. */
export function priceDeal(s: KcSettings, rate: number, years: number, tier: Tier, homeGrown = false) {
  const base = Math.max(5, Math.round(rate * lengthFactor(years) * (homeGrown ? (100 - s.home_grown_pct) / 100 : 1)));
  return { base, salary: Math.round(base * premium(s, tier)) };
}
export const minimumFor = (rate: number, years: number) => Math.max(5, Math.round(rate * lengthFactor(years)));
export const pickPointsScore = (overall: number) => Math.round(3000 * Math.exp(-0.07 * (overall - 1)) / 50);
export function offerScore(years: number, salary: number, sweet: number, pickOveralls: number[]) {
  return years * salary + Math.trunc(sweet / 5) + pickOveralls.reduce((a, o) => a + pickPointsScore(o), 0);
}
export function floorFor(s: KcSettings, line: Line) {
  return line === 'DEF' ? s.floor_def : line === 'MID' ? s.floor_mid : line === 'RUC' ? s.floor_ruc : s.floor_fwd;
}
export const isFinalYear = (s: KcSettings, c: Contract) => c.end_season <= s.season;
export const yearsLeft = (s: KcSettings, c: Contract) => c.end_season - Math.max(c.start_season, s.season) + 1;

export interface ClubCap {
  team: Team; salary: number; nextSalary: number; bank: number; contracts: number; dead: number;
  overKeeper: number; overTax: number; taxKt: number; list: Set<number>; fit: Record<Line, number>;
  keeperCapNext: number; keptNext: number; deficitUsed: boolean;
  /** Deadline day checks the coming season: keeper cap (less any deficit carried in) and players signed for it. */
  keeperCapNow: number; keptNow: number;
}

export interface ContractsData {
  me: Me | null; settings: KcSettings | null; seasonLabel: string;
  teams: Team[]; players: Map<number, PlayerRow>; rates: Map<number, number>;
  contracts: Contract[]; active: Contract[]; pending: Contract[];
  byPlayer: Map<number, Contract>; pendingByPlayer: Map<number, Contract>;
  banks: Map<number, number>; clubs: Map<number, ClubCap>;
  auctions: Auction[]; freeAgents: FreeAgent[]; myOffers: MyOffer[]; offersOnMine: MyOffer[]; transfers: Transfer[];
  claims: Claim[]; capAdjust: CapAdjust[]; pendingFa: Set<number>; midseason: boolean;
  /** Dead money in later seasons from releases (the first season sits on the contract). */
  deadLater: { team_id: number; season: number; amount_k: number }[];
  ladderRank: Map<number, number>; totalKt: number;
  ready: boolean; error: string | null;
}

/** Everything the contracts pages need, loaded once per request. */
/** kc_rate_v2 in TypeScript, for players who aren't in the database (the unrostered AFL free-agent pool). Keep in step
 *  with the SQL: blended average of the last three seasons, experience, age and availability factors, soft top end. */
export function rateFromHist(hist: [number, number, number][] | null | undefined, birth: string | null | undefined, season = 2027): number {
  const h = (hist ?? []).filter((x) => x[1] > 0).sort((a, b) => b[0] - a[0]);
  if (!h.length) return 5;
  const [s0, g0, a0] = h[0]; const g1 = h[1]?.[1], a1 = h[1]?.[2], g2 = h[2]?.[1], a2 = h[2]?.[2];
  const prior = Math.max(6, 22 - g0);
  const w0 = g0, w1 = g1 != null ? 0.65 * prior * Math.min(1, g1 / 10) : 0, w2 = g2 != null ? 0.35 * prior * Math.min(1, g2 / 10) : 0;
  const avg = (w0 * a0 + w1 * (a1 ?? 0) + w2 * (a2 ?? 0)) / (w0 + w1 + w2 || 1);
  const n = h.length;
  const xp = n + 1 <= 1 ? 0.5 : n + 1 === 2 ? 0.6 : n + 1 === 3 ? 0.7 : n + 1 === 4 ? 0.85 : 1;
  const age = birth ? Math.floor((Date.UTC(season, 2, 1) - new Date(birth).getTime()) / (365.25 * 86400000)) : null;
  const agef = age == null || age < 30 ? 1 : Math.max(0.6, 1 - 0.08 * (age - 29));
  const avail = s0 >= season ? 1 : 0.8 + 0.2 * Math.min(1, g0 / 18);
  let v = Math.pow(Math.max(avg - 55, 0), 1.3) * 0.66 * xp * agef * avail;
  if (v > 90) v = 90 + (v - 90) * 0.9;
  return Math.max(5, Math.round(v));
}

type FaRow = { id: number; birth_date: string | null; hist: [number, number, number][] | null };
const FA_POOL = (freeAgentData as unknown as { players: FaRow[] }).players;
/** Adds market values for the unrostered free-agent pool, which the database doesn't price. */
function withFaRates(m: Map<number, number>): Map<number, number> {
  for (const f of FA_POOL) if (!m.has(f.id)) m.set(f.id, rateFromHist(f.hist, f.birth_date));
  return m;
}

/** Market value ($k) for every player, from the contract pricing. */
export const getRates = cache(async (): Promise<Map<number, number>> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc('kc_rates');
  return withFaRates(new Map(((data ?? []) as { player_id: number; rate_k: number }[]).map((r) => [r.player_id, r.rate_k])));
});

export const getContracts = cache(async (): Promise<ContractsData> => {
  const supabase = await createClient();
  // Any 48-hour match windows that ran out settle first (the bidder signs him). Harmless if there are none.
  const [league, me] = await Promise.all([getLeague(), getMe(), supabase.rpc('kc_settle_matches').then(() => null, () => null)]);
  const players = new Map(league.players.map((p) => [p.id, p]));
  const [setQ, conQ, ledQ, aucQ, faQ, cntQ, offQ, trQ, rateQ, clQ, adjQ, deadQ] = await Promise.all([
    supabase.from('kc_settings').select('*').maybeSingle(),
    supabase.from('kc_contracts').select('*').in('status', ['active', 'pending', 'released']),
    supabase.from('kc_ledger').select('team_id, delta'),
    supabase.from('kc_auctions').select('*, kc_bids(team_id, amount_kt, created_at)').eq('status', 'open').order('ends_at'),
    supabase.from('kc_free_agents').select('*').eq('status', 'open').order('opened_at'),
    supabase.rpc('kc_offer_counts'),
    supabase.from('kc_offers').select('*').eq('status', 'tabled'),
    supabase.from('kc_transfers').select('*').order('created_at', { ascending: false }).limit(40),
    supabase.rpc('kc_rates'),
    supabase.from('kc_claims').select('*').order('created_at', { ascending: false }).limit(60),
    supabase.from('kc_cap_adjust').select('team_id, season, amount_k, reason'),
    supabase.from('kc_dead').select('team_id, season, amount_k'),
  ]);
  const deadLater = (deadQ.data ?? []) as { team_id: number; season: number; amount_k: number }[];
  const settings = (setQ.data as KcSettings | null) ?? null;
  const error = setQ.error?.message ?? conQ.error?.message ?? null;
  const contracts = ((conQ.data ?? []) as Contract[]).map((c) => ({ ...c, id: Number(c.id) }));
  const active = contracts.filter((c) => c.status === 'active');
  const pending = contracts.filter((c) => c.status === 'pending');
  const rates = withFaRates(new Map(((rateQ.data ?? []) as { player_id: number; rate_k: number }[]).map((r) => [r.player_id, r.rate_k])));
  const banks = new Map<number, number>();
  for (const r of (ledQ.data ?? []) as { team_id: number; delta: number }[]) banks.set(r.team_id, (banks.get(r.team_id) ?? 0) + r.delta);
  const counts = new Map(((cntQ.data ?? []) as { fa_id: number; offers: number }[]).map((r) => [Number(r.fa_id), r.offers]));
  const season = settings?.season ?? 2027;
  const capAdjust = (adjQ.data ?? []) as CapAdjust[];
  const latestLadder = Math.max(0, ...league.ladder.map((l) => l.season));
  const ladderRank = new Map(league.ladder.filter((l) => l.season === latestLadder).map((l) => [l.team_id, l.rank]));

  // The paper list: real squad minus players whose contract sits elsewhere, plus contracts held.
  const elsewhere = new Map(active.map((c) => [c.player_id, c.team_id]));
  const clubs = new Map<number, ClubCap>();
  for (const team of league.teams) {
    const list = new Set<number>();
    for (const p of league.players) if (p.team_id === team.id && (elsewhere.get(p.id) ?? team.id) === team.id) list.add(p.id);
    for (const c of active) if (c.team_id === team.id) list.add(c.player_id);
    const fit = Object.fromEntries(LINES.map((l) => [l, 0])) as Record<Line, number>;
    for (const id of list) {
      const p = players.get(id); const line = p?.positions[0];
      if (p && line && !NOT_FIT.has(p.status ?? '')) fit[line]++;
    }
    const salaryIn = (s: number) => contracts.filter((c) => c.team_id === team.id && (c.status === 'active' || c.status === 'pending') && c.start_season <= s && c.end_season >= s && c.rookie_slot_season !== s).reduce((a, c) => a + c.salary_k, 0)
      + contracts.filter((c) => c.team_id === team.id && c.dead_season === s).reduce((a, c) => a + c.dead_k, 0)
      + deadLater.filter((x) => x.team_id === team.id && x.season === s).reduce((a, x) => a + x.amount_k, 0);
    const salary = salaryIn(season);
    const dead = contracts.filter((c) => c.team_id === team.id && c.dead_season === season).reduce((a, c) => a + c.dead_k, 0);
    const k = settings;
    clubs.set(team.id, {
      team, salary, nextSalary: salaryIn(season + 1), bank: banks.get(team.id) ?? 0, dead,
      contracts: active.filter((c) => c.team_id === team.id).length,
      overKeeper: k ? Math.max(0, salary - k.keeper_cap_k) : 0, overTax: k ? Math.max(0, salary - k.tax_line_k) : 0,
      taxKt: k ? Math.round(Math.max(0, salary - k.tax_line_k) * Number(k.tax_kt_per_k)) : 0, list, fit,
      keeperCapNow: (k?.keeper_cap_k ?? 0) - capAdjust.filter((x) => x.team_id === team.id && x.season === season).reduce((t, x) => t + x.amount_k, 0),
      keptNow: new Set(contracts.filter((c) => c.team_id === team.id && c.status === 'active' && c.start_season <= season && c.end_season >= season).map((c) => c.player_id)).size,
      keeperCapNext: (k?.keeper_cap_k ?? 0) - capAdjust.filter((x) => x.team_id === team.id && x.season === season + 1).reduce((t, x) => t + x.amount_k, 0),
      keptNext: new Set(contracts.filter((c) => c.team_id === team.id && (c.status === 'active' || c.status === 'pending') && c.start_season <= season + 1 && c.end_season >= season + 1).map((c) => c.player_id)).size,
      deficitUsed: capAdjust.some((x) => x.team_id === team.id && x.season === season + 1),
    });
  }
  const totalKt = [...banks.values()].reduce((a, b) => a + Math.max(0, b), 0);
  const freeAgents = ((faQ.data ?? []) as FreeAgent[]).map((f) => ({ ...f, id: Number(f.id), kind: f.kind ?? 'open', offers: counts.get(Number(f.id)) ?? 0 }));
  const allOffers = ((offQ.data ?? []) as MyOffer[]).map((o) => ({ ...o, id: Number(o.id), fa_id: Number(o.fa_id) }));
  const myFaIds = new Set(freeAgents.filter((f) => (f.kind === 'pending' || f.kind === 'offseason') && f.ex_team === me?.team_id).map((f) => f.id));
  return {
    deadLater,
    me, settings, seasonLabel: settings?.shadow ? `${season} shadow season` : `${season} season`,
    teams: league.teams, players, rates, contracts, active, pending,
    byPlayer: new Map(active.map((c) => [c.player_id, c])), pendingByPlayer: new Map(pending.map((c) => [c.player_id, c])),
    banks, clubs,
    auctions: ((aucQ.data ?? []) as (Auction & { kc_bids: Auction['bids'] })[]).map((a) => ({ ...a, id: Number(a.id), contract_id: Number(a.contract_id), bids: [...(a.kc_bids ?? [])].sort((x, y) => y.amount_kt - x.amount_kt) })),
    freeAgents,
    myOffers: allOffers.filter((o) => o.team_id === me?.team_id),
    offersOnMine: allOffers.filter((o) => myFaIds.has(o.fa_id)).sort((x, y) => y.score - x.score),
    transfers: ((trQ.data ?? []) as Transfer[]),
    claims: ((clQ.data ?? []) as Claim[]).map((c) => ({ ...c, id: Number(c.id), contract_id: Number(c.contract_id) })),
    capAdjust, pendingFa: new Set(freeAgents.filter((f) => f.kind === 'pending').map((f) => f.player_id)), midseason: !!settings?.midseason_at,
    ladderRank, totalKt,
    ready: !!settings?.seeded_at, error,
  };
});

export const playerAge = (p: PlayerRow | undefined) => (p ? age(p.birth_date) : null);

/** A rough market-value line for a player: last season's rate, then a rolling 6-game rate through this season.
 *  Same shape as the database formula (without age/availability), for a sparkline only. */
/** Market value v2, mirroring kc_rate_v2 in the database. g0/a0 = this season so far; prev = earlier seasons, latest first.
 *  Last season and the one before (65/35) fill the games this season hasn't had yet (min 6 games' weight);
 *  priced on experience (2nd season 60%, 3rd 70%, 4th 85%, 5th+ full) and age (8% off a year from 30). */
export function rateV2(g0: number, a0: number, prev: [number, number][], seasons: number, age: number | null, live = false): number {
  if (seasons <= 0 && g0 <= 0) return 5;
  const prior = Math.max(6, 22 - g0);
  const w = [g0, prev[0] ? 0.65 * prior * Math.min(1, prev[0][0] / 10) : 0, prev[1] ? 0.35 * prior * Math.min(1, prev[1][0] / 10) : 0];
  const tot = w[0] + w[1] + w[2];
  const avg = tot ? (w[0] * a0 + w[1] * (prev[0]?.[1] ?? 0) + w[2] * (prev[1]?.[1] ?? 0)) / tot : 0;
  const k = seasons + 1;
  const xp = k <= 1 ? 0.5 : k === 2 ? 0.6 : k === 3 ? 0.7 : k === 4 ? 0.85 : 1;
  const agef = age == null || age < 30 ? 1 : Math.max(0.6, 1 - 0.08 * (age - 29));
  // Games-played discount only once a season is finished (injured players); none while it's being played.
  const avail = g0 === 0 || live ? 1 : 0.8 + 0.2 * Math.min(1, g0 / 18);
  return Math.max(5, Math.pow(Math.max(0, avg - 55), 1.3) * 0.66 * xp * agef * avail);
}

/** Market value after each game this season, from where he started the year. Moves are small: each score shifts the
 *  blended average a little. */
export function valueTrend(p: PlayerRow | undefined, points = 10): number[] {
  if (!p) return [];
  const hist = (p.hist ?? []).filter((h) => h[1] > 0).sort((a, b) => b[0] - a[0]);
  const scores = (p.games_log ?? []).map((g) => g[1]).filter((x): x is number => x != null);
  const curYear = hist[0] && scores.length ? hist[0][0] : null;
  const prev = hist.filter((h) => h[0] !== curYear).map((h) => [h[1], h[2]] as [number, number]);
  const seasons = hist.length;
  const born = p.birth_date ? new Date(p.birth_date) : null;
  const age = born ? Math.floor((Date.UTC(2027, 2, 1) - born.getTime()) / (365.25 * 86400000)) : null;
  const out = [rateV2(0, 0, prev, seasons, age)];
  let sum = 0;
  // In-season points carry no availability discount; the last point does if that season is finished.
  const finished = curYear != null && curYear < 2027;
  scores.forEach((x, i) => { sum += x; out.push(rateV2(i + 1, sum / (i + 1), prev, seasons, age, !(finished && i === scores.length - 1))); });
  if (out.length <= points) return out;
  return Array.from({ length: points }, (_, i) => out[Math.round((i * (out.length - 1)) / (points - 1))]);
}
