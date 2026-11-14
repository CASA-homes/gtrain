// Contracts, salary cap and the transfer market (shadow season). The database (migration 0030) is the source of
// truth for every rule and price; the helpers here only mirror its maths so pages can show previews.
// Salaries are cap dollars in thousands ($98,000 = 98). Tokens here are paper KT, separate from real tokens.
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getLeague, getMe, type Me, type Team } from '@/lib/data';
import { age, LINES, type Line, type PlayerRow } from '@/lib/ratings';

export type Tier = 'standard' | 'high' | 'none' | 'protected';

export interface KcSettings {
  league_id: number; season: number; shadow: boolean;
  keeper_cap_k: number; season_cap_k: number; tax_line_k: number; tax_kt_per_k: number; start_kt: number;
  max_years: number; long_deal_limit: number;
  floor_def: number; floor_mid: number; floor_ruc: number; floor_fwd: number;
  clause_std: number; clause_high: number; kt_per_k: number; high_pct: number; none_pct: number; home_grown_pct: number;
  levy_pct: number; max_buys: number; pot_dollars: number;
  window_open: boolean; window_kind: 'preseason' | 'midseason' | null; window_opened_at: string | null; window_closes_at: string | null;
  seeded_at: string | null;
}

export interface Contract {
  id: number; player_id: number; team_id: number; base_k: number; salary_k: number; start_season: number; end_season: number;
  tier: Tier; rookie: boolean; home_grown: boolean; how: string; status: 'active' | 'pending' | 'released' | 'expired' | 'voided';
  dead_k: number; dead_season: number | null;
}
export interface Auction { id: number; contract_id: number; player_id: number; seller_team: number; reserve_kt: number; ends_at: string; status: string; bids: { team_id: number; amount_kt: number; created_at: string }[] }
export interface FreeAgent { id: number; player_id: number; ex_team: number | null; closes_at: string | null; status: string; offers: number }
export interface MyOffer { id: number; fa_id: number; years: number; salary_k: number; tier: Tier; sweet_kt: number; pick_ids: number[]; score: number; status: string }
export interface Transfer { id: number; player_id: number | null; from_team: number | null; to_team: number | null; kind: string; fee_kt: number; levy_kt: number; note: string | null; created_at: string }

export const TIER_LABEL: Record<Tier, string> = { standard: 'Standard', high: 'High', none: 'No clause', protected: 'Protected (yr 1)' };
export const LENGTH_FACTOR: Record<number, number> = { 1: 1.06, 2: 1.03, 3: 1.0, 4: 0.967, 5: 0.933 };
export const lengthFactor = (years: number) => LENGTH_FACTOR[years] ?? 0.933;
export const NOT_FIT = new Set(['LONG', 'SEASON', 'OUT', 'SUSP', 'DEL']);

export const money = (k: number) => `$${(Math.round(k) * 1000).toLocaleString('en-AU')}`;
export const moneyK = (k: number) => `$${Math.round(k).toLocaleString('en-AU')}k`;
export const kt = (n: number) => `${Math.round(n).toLocaleString('en-AU')} KT`;

export function premium(s: KcSettings, tier: Tier) {
  return 1 + (tier === 'high' ? s.high_pct : tier === 'none' ? s.none_pct : 0) / 100;
}
/** Release clause in KT, as the database works it out. Null = can't be bought. */
export function clauseKt(s: KcSettings, c: Pick<Contract, 'tier' | 'end_season'>, rate: number): number | null {
  if (c.tier === 'none' || c.tier === 'protected') return null;
  const mult = c.tier === 'high' ? s.clause_high : s.clause_std;
  return Math.trunc(rate * mult * s.kt_per_k * (c.end_season <= s.season ? 0.5 : 1));
}
/** Per-year salary of a new deal: rate × length factor (× home-grown discount), then the clause premium. */
export function priceDeal(s: KcSettings, rate: number, years: number, tier: Tier, homeGrown = false) {
  const base = Math.max(5, Math.round(rate * lengthFactor(years) * (homeGrown ? (100 - s.home_grown_pct) / 100 : 1)));
  return { base, salary: Math.round(base * premium(s, tier)) };
}
export const minimumFor = (rate: number, years: number) => Math.max(5, Math.round(rate * lengthFactor(years)));
export const pickPointsScore = (overall: number) => Math.round(3000 * Math.exp(-0.07 * (overall - 1)) / 50);
export function offerScore(years: number, salary: number, sweet: number, pickOveralls: number[]) {
  return years * salary + Math.trunc(sweet / 50) + pickOveralls.reduce((a, o) => a + pickPointsScore(o), 0);
}
export function floorFor(s: KcSettings, line: Line) {
  return line === 'DEF' ? s.floor_def : line === 'MID' ? s.floor_mid : line === 'RUC' ? s.floor_ruc : s.floor_fwd;
}
export const isFinalYear = (s: KcSettings, c: Contract) => c.end_season <= s.season;
export const yearsLeft = (s: KcSettings, c: Contract) => c.end_season - Math.max(c.start_season, s.season) + 1;

export interface ClubCap {
  team: Team; salary: number; nextSalary: number; bank: number; contracts: number; dead: number;
  overKeeper: number; overTax: number; taxKt: number; list: Set<number>; fit: Record<Line, number>;
}

export interface ContractsData {
  me: Me | null; settings: KcSettings | null; seasonLabel: string;
  teams: Team[]; players: Map<number, PlayerRow>; rates: Map<number, number>;
  contracts: Contract[]; active: Contract[]; pending: Contract[];
  byPlayer: Map<number, Contract>; pendingByPlayer: Map<number, Contract>;
  banks: Map<number, number>; clubs: Map<number, ClubCap>;
  auctions: Auction[]; freeAgents: FreeAgent[]; myOffers: MyOffer[]; transfers: Transfer[];
  ladderRank: Map<number, number>; totalKt: number; windupCents: number | null; finesDollars: number;
  ready: boolean; error: string | null;
}

/** Everything the contracts pages need, loaded once per request. */
export const getContracts = cache(async (): Promise<ContractsData> => {
  const supabase = await createClient();
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  const players = new Map(league.players.map((p) => [p.id, p]));
  const [setQ, conQ, ledQ, aucQ, faQ, cntQ, offQ, trQ, rateQ, fineQ] = await Promise.all([
    supabase.from('kc_settings').select('*').maybeSingle(),
    supabase.from('kc_contracts').select('*').in('status', ['active', 'pending', 'released']),
    supabase.from('kc_ledger').select('team_id, delta'),
    supabase.from('kc_auctions').select('*, kc_bids(team_id, amount_kt, created_at)').eq('status', 'open').order('ends_at'),
    supabase.from('kc_free_agents').select('*').eq('status', 'open').order('opened_at'),
    supabase.rpc('kc_offer_counts'),
    supabase.from('kc_offers').select('*').eq('status', 'tabled'),
    supabase.from('kc_transfers').select('*').order('created_at', { ascending: false }).limit(40),
    supabase.rpc('kc_rates'),
    supabase.from('fines').select('amount, paid'),
  ]);
  const settings = (setQ.data as KcSettings | null) ?? null;
  const error = setQ.error?.message ?? conQ.error?.message ?? null;
  const contracts = ((conQ.data ?? []) as Contract[]).map((c) => ({ ...c, id: Number(c.id) }));
  const active = contracts.filter((c) => c.status === 'active');
  const pending = contracts.filter((c) => c.status === 'pending');
  const rates = new Map(((rateQ.data ?? []) as { player_id: number; rate_k: number }[]).map((r) => [r.player_id, r.rate_k]));
  const banks = new Map<number, number>();
  for (const r of (ledQ.data ?? []) as { team_id: number; delta: number }[]) banks.set(r.team_id, (banks.get(r.team_id) ?? 0) + r.delta);
  const counts = new Map(((cntQ.data ?? []) as { fa_id: number; offers: number }[]).map((r) => [Number(r.fa_id), r.offers]));
  const season = settings?.season ?? 2027;
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
    const salaryIn = (s: number) => contracts.filter((c) => c.team_id === team.id && (c.status === 'active' || c.status === 'pending') && c.start_season <= s && c.end_season >= s).reduce((a, c) => a + c.salary_k, 0)
      + contracts.filter((c) => c.team_id === team.id && c.dead_season === s).reduce((a, c) => a + c.dead_k, 0);
    const salary = salaryIn(season);
    const dead = contracts.filter((c) => c.team_id === team.id && c.dead_season === season).reduce((a, c) => a + c.dead_k, 0);
    const k = settings;
    clubs.set(team.id, {
      team, salary, nextSalary: salaryIn(season + 1), bank: banks.get(team.id) ?? 0, dead,
      contracts: active.filter((c) => c.team_id === team.id).length,
      overKeeper: k ? Math.max(0, salary - k.keeper_cap_k) : 0, overTax: k ? Math.max(0, salary - k.tax_line_k) : 0,
      taxKt: k ? Math.max(0, salary - k.tax_line_k) * k.tax_kt_per_k : 0, list, fit,
    });
  }
  const totalKt = [...banks.values()].reduce((a, b) => a + Math.max(0, b), 0);
  const finesDollars = ((fineQ.data ?? []) as { amount: number; paid: boolean }[]).filter((f) => f.paid).reduce((a, f) => a + (f.amount ?? 0), 0);
  const pot = settings ? settings.pot_dollars + finesDollars : 0;
  return {
    me, settings, seasonLabel: settings?.shadow ? `${season} shadow season` : `${season} season`,
    teams: league.teams, players, rates, contracts, active, pending,
    byPlayer: new Map(active.map((c) => [c.player_id, c])), pendingByPlayer: new Map(pending.map((c) => [c.player_id, c])),
    banks, clubs,
    auctions: ((aucQ.data ?? []) as (Auction & { kc_bids: Auction['bids'] })[]).map((a) => ({ ...a, id: Number(a.id), contract_id: Number(a.contract_id), bids: [...(a.kc_bids ?? [])].sort((x, y) => y.amount_kt - x.amount_kt) })),
    freeAgents: ((faQ.data ?? []) as FreeAgent[]).map((f) => ({ ...f, id: Number(f.id), offers: counts.get(Number(f.id)) ?? 0 })),
    myOffers: ((offQ.data ?? []) as (MyOffer & { team_id: number })[]).filter((o) => o.team_id === me?.team_id).map((o) => ({ ...o, id: Number(o.id), fa_id: Number(o.fa_id) })),
    transfers: ((trQ.data ?? []) as Transfer[]),
    ladderRank, totalKt, windupCents: totalKt ? (pot * 100) / totalKt : null, finesDollars,
    ready: !!settings?.seeded_at, error,
  };
});

export const playerAge = (p: PlayerRow | undefined) => (p ? age(p.birth_date) : null);
