// Automatic round fines. When the commish locks a G-Train round, each active rule is run against the saved
// lineups and the locked scores, and the fines land in the fines table tagged with the round.
// Clubs with no saved lineup for the round sit out the automatic rules.
import { createClient } from '@/lib/supabase/server';
import { COMP_SEASON } from '@/lib/comps';
import { RULES, type MdLineup } from '@/lib/matchday';

export type FineKind = 'low_player' | 'low_team' | 'high_team' | 'captain_under';
export interface FineRule { id: number; kind: FineKind; amount: number; threshold: number | null; active: boolean }

export const FINE_KINDS: { kind: FineKind; label: string; prize?: boolean; threshold?: { label: string; def: number } }[] = [
  { kind: 'low_player', label: 'Lowest player score in a starting 22' },
  { kind: 'low_team', label: 'Lowest team score of the round' },
  { kind: 'captain_under', label: 'Captain scores under', threshold: { label: 'points', def: 60 } },
  { kind: 'high_team', label: 'Highest team score', prize: true },
];
export const fineLabel = (k: string, threshold?: number | null) => {
  const d = FINE_KINDS.find((x) => x.kind === k);
  if (!d) return k;
  return d.threshold ? `${d.label} ${threshold ?? d.threshold.def}` : d.label;
};

/** AFL Fantasy ids are the Champion Data numbers in players.dfs_id ("CD_I297373" → 297373). */
const feedId = (dfs: string | null) => { const m = dfs?.match(/(\d+)$/); return m ? Number(m[1]) : null; };

const FIELD = RULES.gtrain.slots.filter((s) => !s.bench).map((s) => s.key);

/** Work out (and replace) the automatic fines for a locked round. Returns how many were posted. */
export async function applyRoundFines(round: number, snapshot: Record<string, number>): Promise<{ ok: boolean; count: number; error?: string }> {
  const supabase = await createClient();
  const [rq, lq, pq, tq] = await Promise.all([
    supabase.from('fine_rules').select('*').eq('active', true),
    supabase.from('game_lineups').select('team_id, lineup').eq('season', COMP_SEASON).eq('comp', 'gtrain').eq('round', round),
    supabase.from('players').select('id, name, dfs_id'),
    supabase.from('teams').select('id, is_guest'),
  ]);
  if (rq.error) return { ok: false, count: 0, error: rq.error.message };
  const rules = (rq.data ?? []) as FineRule[];
  const real = new Set((tq.data ?? []).filter((t) => !t.is_guest).map((t) => t.id as number));
  const pl = new Map((pq.data ?? []).map((p) => [p.id as number, p as { id: number; name: string; dfs_id: string | null }]));
  const scoreOf = (pid: number) => { const f = feedId(pl.get(pid)?.dfs_id ?? null); return f == null ? null : snapshot[String(f)] ?? null; };

  type Side = { team: number; total: number; low: { name: string; score: number } | null; capt: { name: string; score: number } | null };
  const sides: Side[] = [];
  for (const r of lq.data ?? []) {
    if (!real.has(r.team_id)) continue;
    const l = r.lineup as MdLineup;
    let total = 0, low: Side['low'] = null;
    for (const k of FIELD) for (const pid of l.slots?.[k] ?? []) {
      const s = scoreOf(pid) ?? 0;
      total += s * (l.c === pid ? 2 : 1);
      if (!low || s < low.score) low = { name: pl.get(pid)?.name ?? 'Player', score: s };
    }
    const capt = l.c ? { name: pl.get(l.c)?.name ?? 'Captain', score: scoreOf(l.c) ?? 0 } : null;
    sides.push({ team: r.team_id, total, low, capt });
  }

  const rows: { team_id: number; amount: number; reason: string; rule_kind: FineKind; prize: boolean }[] = [];
  const pick = (vals: Side[], v: (s: Side) => number | null, dir: 'min' | 'max') => {
    const ok = vals.filter((s) => v(s) != null);
    if (!ok.length) return [];
    const best = dir === 'min' ? Math.min(...ok.map((s) => v(s)!)) : Math.max(...ok.map((s) => v(s)!));
    return ok.filter((s) => v(s) === best);
  };
  for (const rule of rules) {
    if (rule.kind === 'low_player') for (const s of pick(sides, (x) => x.low?.score ?? null, 'min'))
      rows.push({ team_id: s.team, amount: rule.amount, reason: `R${round} lowest player (${s.low!.name}, ${s.low!.score})`, rule_kind: rule.kind, prize: false });
    if (rule.kind === 'low_team') for (const s of pick(sides, (x) => x.total, 'min'))
      rows.push({ team_id: s.team, amount: rule.amount, reason: `R${round} lowest team score (${s.total.toLocaleString()})`, rule_kind: rule.kind, prize: false });
    if (rule.kind === 'high_team') for (const s of pick(sides, (x) => x.total, 'max'))
      rows.push({ team_id: s.team, amount: rule.amount, reason: `R${round} highest team score (${s.total.toLocaleString()})`, rule_kind: rule.kind, prize: true });
    if (rule.kind === 'captain_under') for (const s of sides) if (s.capt && s.capt.score < (rule.threshold ?? 60))
      rows.push({ team_id: s.team, amount: rule.amount, reason: `R${round} captain under ${rule.threshold ?? 60} (${s.capt.name}, ${s.capt.score})`, rule_kind: rule.kind, prize: false });
  }

  // Replace this round's unpaid automatic fines (paid ones stay put).
  const del = await supabase.from('fines').delete().eq('season', COMP_SEASON).eq('round', round).not('rule_kind', 'is', null).eq('paid', false);
  if (del.error) return { ok: false, count: 0, error: del.error.message };
  const { data: kept } = await supabase.from('fines').select('team_id, rule_kind').eq('season', COMP_SEASON).eq('round', round).not('rule_kind', 'is', null);
  const have = new Set((kept ?? []).map((k) => `${k.team_id}:${k.rule_kind}`));
  const fresh = rows.filter((r) => !have.has(`${r.team_id}:${r.rule_kind}`)).map((r) => ({ ...r, season: COMP_SEASON, round, paid: false }));
  if (fresh.length) { const ins = await supabase.from('fines').insert(fresh); if (ins.error) return { ok: false, count: 0, error: ins.error.message }; }
  return { ok: true, count: fresh.length };
}
