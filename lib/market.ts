// Trademarket: everything the market home and its "All" pages show, worked out once per request.
import { cache } from 'react';
import { clauseKt, getContracts, isFinalYear, kt, money, valueTrend, type Contract, type ContractsData } from '@/lib/contracts';
import { getLeague } from '@/lib/data';
import type { PlayerRow } from '@/lib/ratings';
import { createClient } from '@/lib/supabase/server';

export interface TickerItem { id: number; name: string; value: number; pct: number }
export interface FeedItem { id: string; tag: string; tone: 'green' | 'brass' | 'rust' | 'grey' | 'dark'; title: string; sub: string; at: string; player_id: number | null }
export interface ClauseRow { c: Contract; p: PlayerRow | undefined; rate: number; clause: number }
export interface ListingRow {
  id: string; kind: string; asking: string | null; minimum: string | null; open_to: string | null; ends_at: string | null;
  status: string; team_id: number; player_id: number; created_at: string;
  offers: { id: string; offer: string; points: number | null; team_id: number; created_at: string }[] | null;
}
export interface TradeRow { id: string; team_a: number; team_b: number; a_gives: string; b_gives: string; status: string; created_at: string; decided_at: string | null }
export interface DeskRow { id: string; title: string; status: string; team_id: number; created_at: string; desk_teams: { team_id: number; accepted: boolean }[] | null }

const shortName = (n: string) => {
  const parts = n.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : n;
};
export { shortName };

export const getMarket = cache(async () => {
  const supabase = await createClient();
  // The market's own tables load alongside the contracts and league data, not after them.
  const [[d, league], [lq, tq, vq, dq, wq]] = await Promise.all([Promise.all([getContracts(), getLeague()]), Promise.all([
    supabase.from('listings').select('id, kind, asking, minimum, open_to, ends_at, status, team_id, player_id, created_at, offers(id, offer, points, team_id, created_at)').in('status', ['open', 'pending']).order('created_at', { ascending: false }),
    supabase.from('trades').select('id, team_a, team_b, a_gives, b_gives, status, created_at, decided_at').order('created_at', { ascending: false }).limit(40),
    supabase.from('trade_votes').select('trade_id, team_id'),
    supabase.from('desks').select('id, title, status, team_id, created_at, desk_teams(team_id, accepted)').in('status', ['open', 'agreed']).order('created_at', { ascending: false }),
    supabase.from('wishes').select('*, wish_replies(count)').eq('status', 'open').order('created_at', { ascending: false }).limit(20),
  ])]);
  const listings = (lq.data ?? []) as ListingRow[];
  const trades = (tq.data ?? []) as TradeRow[];
  const s = d.settings;
  const season = s?.season ?? 2027;
  const meId = d.me && !d.me.is_guest ? d.me.team_id : null;
  const teamName = (id: number | null) => (id ? d.teams.find((t) => t.id === id)?.name ?? 'a club' : 'free agency');
  const teamCode = (id: number | null) => (id ? d.teams.find((t) => t.id === id)?.short_code ?? '' : 'FA');
  const allPlayers = new Map<number, PlayerRow>([...league.freeAgents, ...league.players].map((p) => [p.id, p]));
  const pname = (id: number | null) => (id ? allPlayers.get(id)?.name ?? `Player ${id}` : 'A player');

  // Ticker: the most valuable players and how far they've moved since the start of the season.
  const ticker: TickerItem[] = [...allPlayers.values()]
    .map((p) => ({ p, value: d.rates.get(p.id) ?? 0 }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 16)
    .map(({ p, value }) => {
      const t = valueTrend(p, 999);
      const start = t.length > 1 ? t[0] : value;
      return { id: p.id, name: p.name, value, pct: start ? (value - start) / start : 0 };
    });

  // Release clauses on other clubs' players, cheapest first.
  const spoken = new Set(d.pending.map((p) => p.player_id));
  const clauses: ClauseRow[] = s ? d.active
    .filter((c) => c.team_id !== meId && !isFinalYear(s, c) && !spoken.has(c.player_id))
    .map((c) => ({ c, p: d.players.get(c.player_id), rate: d.rates.get(c.player_id) ?? 0, clause: clauseKt(s, c, d.rates.get(c.player_id) ?? 0, d.pendingFa.has(c.player_id)) }))
    .filter((r): r is ClauseRow => r.clause != null)
    .sort((a, b) => a.clause - b.clause || b.rate - a.rate) : [];

  // Final-year deals that haven't been re-signed: next season's free agents.
  const comingFa = d.active
    .filter((c) => c.end_season <= season && !d.pendingByPlayer.has(c.player_id))
    .map((c) => ({ c, p: d.players.get(c.player_id), rate: d.rates.get(c.player_id) ?? 0 }))
    .sort((a, b) => b.rate - a.rate);

  // Every move, newest first: contract log plus approved trades.
  const feed: FeedItem[] = [];
  for (const t of d.transfers) {
    if (t.kind === 'tier') continue;
    const p = pname(t.player_id), from = teamName(t.from_team), to = teamName(t.to_team);
    const base = { id: `k${t.id}`, at: t.created_at, player_id: t.player_id };
    if (t.kind === 'seed') {
      const undone = (t.note ?? '').toLowerCase().includes('undone');
      feed.push({ ...base, tag: undone ? 'UN' : 'SG', tone: undone ? 'grey' : 'green', title: `${p} ${undone ? 'contract undone' : 're-signed'}`, sub: `${from}${t.note && !undone ? ` · ${t.note.replace(' from ' + season, '')}` : ''}` });
    } else if (t.kind === 'extension') feed.push({ ...base, tag: 'EX', tone: 'green', title: `${p} extended`, sub: `${from}${t.note ? ` · ${t.note}` : ''}` });
    else if (t.kind === 'free_agent') feed.push({ ...base, tag: 'FA', tone: 'green', title: `${p} signed`, sub: `${to}${t.note ? ` · ${t.note}` : ''}` });
    else if (t.kind === 'release') feed.push({ ...base, tag: 'RL', tone: 'grey', title: `${p} released`, sub: `${from}${t.note ? ` · ${t.note}` : ''}` });
    else if (t.kind === 'clause') feed.push({ ...base, tag: 'CL', tone: 'rust', title: `${p} clause paid`, sub: `${to} from ${from} · ${kt(t.fee_kt)}` });
    else if (t.kind === 'auction') feed.push({ ...base, tag: 'AU', tone: 'brass', title: `${p} sold at auction`, sub: `${from} → ${to} · ${kt(t.fee_kt)}` });
    else feed.push({ ...base, tag: t.kind.slice(0, 2).toUpperCase(), tone: 'grey', title: t.note ?? t.kind, sub: from });
  }
  for (const t of trades.filter((x) => x.status === 'approved')) {
    feed.push({ id: `t${t.id}`, tag: 'TR', tone: 'brass', title: `Trade · ${teamCode(t.team_a)} ⇄ ${teamCode(t.team_b)}`, sub: `${t.a_gives} for ${t.b_gives}`, at: t.decided_at ?? t.created_at, player_id: null });
  }
  feed.sort((a, b) => +new Date(b.at) - +new Date(a.at));

  const pendingTrades = trades.filter((t) => t.status === 'proposed');
  const desks = (dq.data ?? []) as DeskRow[];
  return {
    d, league, s, season, meId, teamName, teamCode, allPlayers, pname,
    ticker, clauses, comingFa, feed, listings, trades, pendingTrades, desks,
    votes: (vq.data ?? []) as { trade_id: string; team_id: number }[],
    wishes: (wq.data ?? []) as { id: string; team_id: number; want: string; offering: string | null; tag: string }[],
  };
});

export type Market = Awaited<ReturnType<typeof getMarket>>;

export function windowLine(d: ContractsData): string {
  const s = d.settings;
  if (!s) return 'Contracts aren’t set up yet';
  const fmt = (x: string) => new Date(x).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Perth' });
  if (s.window_open && s.window_closes_at && new Date(s.window_closes_at) > new Date()) return `${s.window_kind === 'midseason' ? 'Mid-season' : 'Transfer'} window open · closes ${fmt(s.window_closes_at)} · clauses can be paid`;
  if (s.setup_until && new Date(s.setup_until) > new Date()) return `Off-season · re-sign your list by deadline day, ${fmt(s.setup_until)} · free agents sign now`;
  return `Window closed · free agents and trades still run · ${d.seasonLabel}`;
}

export const ago = (iso: string) => {
  const ms = Date.now() - +new Date(iso);
  const h = ms / 36e5;
  if (h < 1) return `${Math.max(1, Math.round(ms / 6e4))}m ago`;
  if (h < 24) return 'Today';
  if (h < 48) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Perth' });
};

export { money };
