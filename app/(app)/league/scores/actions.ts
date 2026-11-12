'use server';
// Commish score override: save/clear player overrides, pause the feed for a round, lock and unlock a round.
// Every change is written to score_log, which all coaches can read.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/data';
import { COMP } from '@/lib/scores';
import { liveRound, loadScoreState } from '@/lib/scores/server';

type Res = { ok: boolean; error?: string };
export interface OverrideChange { player_id: number; player_name: string; score: number | null; feed_score: number | null; reason: string }

const MISSING = 'Run supabase/migrations/0029_score_overrides.sql in Supabase first.';
const friendly = (m: string) => (/score_(overrides|rounds|log)/.test(m) ? MISSING : m);

async function commish() {
  const me = await getMe();
  if (!me?.is_commish) return { me: null, error: 'Only the commish can change scores.' };
  return { me, error: null };
}
function done() { revalidatePath('/league/scores'); revalidatePath('/live', 'layout'); }
async function log(round: number, who: string, lines: string[]) {
  if (!lines.length) return;
  const supabase = await createClient();
  await supabase.from('score_log').insert(lines.map((what) => ({ comp: COMP, round, what: what.slice(0, 200), who: who.slice(0, 60) })));
}

export async function saveOverrides(round: number, changes: OverrideChange[]): Promise<Res> {
  const { me, error } = await commish(); if (!me) return { ok: false, error: error! };
  const { state, overrides, ready } = await loadScoreState(round);
  if (!ready) return { ok: false, error: MISSING };
  if (state?.locked_at) return { ok: false, error: 'This round is locked. Unlock it first to change scores.' };
  const had = new Map(overrides.map((o) => [o.player_id, o.score]));
  const supabase = await createClient();
  const lines: string[] = [];
  const up = [], del: number[] = [];
  for (const c of changes) {
    if (!Number.isInteger(c.player_id)) continue;
    if (c.score == null) { if (had.has(c.player_id)) { del.push(c.player_id); lines.push(`${c.player_name} back to the feed${c.feed_score != null ? ` (${c.feed_score})` : ''}`); } continue; }
    const score = Math.round(c.score);
    if (score < -50 || score > 400) return { ok: false, error: `${c.player_name}: scores must be between -50 and 400.` };
    up.push({ comp: COMP, round, player_id: c.player_id, player_name: c.player_name.slice(0, 60), score, feed_score: c.feed_score, reason: c.reason.trim().slice(0, 120) || null, set_by: me.user_id, set_at: new Date().toISOString() });
    const before = had.get(c.player_id) ?? c.feed_score;
    lines.push(before != null ? `${c.player_name} ${before} → ${score}` : `${c.player_name} set to ${score}`);
  }
  if (up.length) { const r = await supabase.from('score_overrides').upsert(up, { onConflict: 'league_id,comp,round,player_id' }); if (r.error) return { ok: false, error: friendly(r.error.message) }; }
  if (del.length) { const r = await supabase.from('score_overrides').delete().eq('comp', COMP).eq('round', round).in('player_id', del); if (r.error) return { ok: false, error: friendly(r.error.message) }; }
  await log(round, me.display_name ?? 'Commish', lines);
  done();
  return { ok: true };
}

export async function setPaused(round: number, paused: boolean): Promise<Res> {
  const { me, error } = await commish(); if (!me) return { ok: false, error: error! };
  const supabase = await createClient();
  const r = await supabase.from('score_rounds').upsert({ comp: COMP, round, paused, updated_at: new Date().toISOString() }, { onConflict: 'league_id,comp,round' });
  if (r.error) return { ok: false, error: friendly(r.error.message) };
  await log(round, me.display_name ?? 'Commish', [paused ? 'Feed paused: manual scores only' : 'Feed turned back on']);
  done();
  return { ok: true };
}

export async function lockRound(round: number): Promise<Res> {
  const { me, error } = await commish(); if (!me) return { ok: false, error: error! };
  let data;
  try { data = await liveRound(round); } catch (e) { return { ok: false, error: `Couldn't reach the feed to read the final scores: ${(e as Error).message}` }; }
  if (data.games.some((g) => g.status !== 'completed')) return { ok: false, error: 'Wait until every game in the round has finished.' };
  const snapshot: Record<string, number> = {};
  for (const p of data.players) if (p.score != null) snapshot[String(p.id)] = p.score;
  const supabase = await createClient();
  const r = await supabase.from('score_rounds').upsert({ comp: COMP, round, locked_at: new Date().toISOString(), locked_by: me.user_id, snapshot, updated_at: new Date().toISOString() }, { onConflict: 'league_id,comp,round' });
  if (r.error) return { ok: false, error: friendly(r.error.message) };
  await log(round, me.display_name ?? 'Commish', [`${data.name} locked`]);
  done();
  return { ok: true };
}

export async function unlockRound(round: number): Promise<Res> {
  const { me, error } = await commish(); if (!me) return { ok: false, error: error! };
  const supabase = await createClient();
  const r = await supabase.from('score_rounds').update({ locked_at: null, locked_by: null, snapshot: null, updated_at: new Date().toISOString() }).eq('comp', COMP).eq('round', round);
  if (r.error) return { ok: false, error: friendly(r.error.message) };
  await log(round, me.display_name ?? 'Commish', ['Round unlocked: scores follow the feed and overrides again']);
  done();
  return { ok: true };
}
