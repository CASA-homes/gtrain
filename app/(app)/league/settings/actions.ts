'use server';
// League settings: the commish saves rules. Squad size, lineup, keepers and Player Release Day go to kc_settings
// (contracts, the cap and matchday read them there); everything else to leagues.settings.rules.
import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/data';
import { createClient, currentLeagueId } from '@/lib/supabase/server';
import { DRAFT_ORDERS, FORMULA_KEYS, mergeRules, type LeagueRules, type Pos4 } from '@/lib/league-rules';

export type Res = { ok: boolean; message: string };
const int = (v: unknown, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

async function saveRules(patch: Partial<LeagueRules>): Promise<string | null> {
  const supabase = await createClient();
  const lid = await currentLeagueId();
  const { data, error } = await supabase.from('leagues').select('settings').eq('id', lid).maybeSingle();
  if (error) return error.message;
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const cur = (settings.rules ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...cur };
  for (const [k, v] of Object.entries(patch)) next[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...((cur[k] as object) ?? {}), ...v } : v;
  const { error: e2 } = await supabase.from('leagues').update({ settings: { ...settings, rules: next } }).eq('id', lid);
  return e2?.message ?? null;
}
async function saveKc(patch: Record<string, unknown>): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.from('kc_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('league_id', await currentLeagueId());
  return error?.message ?? null;
}
async function commish(): Promise<boolean> { return !!(await getMe())?.is_commish; }
const done = (err: string | null, ok: string): Res => { if (err) return { ok: false, message: err }; revalidatePath('/', 'layout'); return { ok: true, message: ok }; };

/** Milestone dates. Player Release Day is kc_settings.rookie_lock_at (rookie slots and contracts lock then). */
export async function saveMilestones(v: { release: string | null; preseason_open: string; preseason_close: string; draft_day: string; mid_open: string; mid_close: string; fa_day: string }): Promise<Res> {
  if (!(await commish())) return { ok: false, message: 'Only the commish can set the milestone dates.' };
  const d = { preseason_open: day(v.preseason_open), preseason_close: day(v.preseason_close), draft_day: day(v.draft_day), mid_open: day(v.mid_open), mid_close: day(v.mid_close), fa_day: day(v.fa_day) };
  if (Object.values(d).some((x) => !x)) return { ok: false, message: 'Every date needs a day.' };
  if (d.preseason_close! < d.preseason_open!) return { ok: false, message: 'The preseason window has to close after it opens.' };
  if (d.mid_close! < d.mid_open!) return { ok: false, message: 'The mid-season window has to close after it opens.' };
  if (d.fa_day! < d.mid_close!) return { ok: false, message: 'Free Agent Day comes after the mid-season window closes.' };
  const rel = v.release ? new Date(v.release) : null;
  if (rel && Number.isNaN(rel.getTime())) return { ok: false, message: 'Player Release Day doesn’t look right.' };
  const e1 = await saveKc({ rookie_lock_at: rel ? rel.toISOString() : null });
  if (e1) return { ok: false, message: e1 };
  return done(await saveRules({ dates: d as LeagueRules['dates'] }), 'Milestone dates saved.');
}

export async function saveTeamStructure(v: { list_size: number; lineup: Record<Pos4, number>; emergencies: number; emergency_mode: 'line' | 'any'; utility: boolean; rookie: boolean; keepers: number }): Promise<Res> {
  if (!(await commish())) return { ok: false, message: 'Only the commish can change the team structure.' };
  const list = int(v.list_size, 18, 60);
  const lu = { DEF: int(v.lineup.DEF, 1, 10), MID: int(v.lineup.MID, 1, 12), RUC: int(v.lineup.RUC, 0, 3), FWD: int(v.lineup.FWD, 1, 10) };
  const emg = int(v.emergencies, 0, 10);
  const keepers = int(v.keepers, 0, 40);
  if (!list || Object.values(lu).some((x) => x == null) || emg == null || keepers == null) return { ok: false, message: 'Check the numbers.' };
  const starters = lu.DEF! + lu.MID! + lu.RUC! + lu.FWD!;
  if (starters + emg > list) return { ok: false, message: `${starters} starters and ${emg} emergencies don’t fit in a ${list}-player squad.` };
  const kcKeepers = keepers + (v.rookie ? 1 : 0);
  if (kcKeepers > list) return { ok: false, message: 'More keepers than squad spots.' };
  const e1 = await saveKc({ list_size: list, lineup: lu, keepers: kcKeepers });
  if (e1) return { ok: false, message: e1 };
  return done(await saveRules({ team: { emergencies: emg, emergency_mode: v.emergency_mode === 'any' ? 'any' : 'line', utility: !!v.utility, rookie: !!v.rookie } }), 'Team structure saved.');
}

export async function saveScoring(v: LeagueRules['scoring']): Promise<Res> {
  if (!(await commish())) return { ok: false, message: 'Only the commish can change scoring.' };
  const formula: Record<string, number> = {};
  for (const k of FORMULA_KEYS) { const n = int(v.formula?.[k], -20, 20); if (n == null) return { ok: false, message: `${k}: points go from −20 to 20.` }; formula[k] = n; }
  const tog = int(v.tog, 0, 100), ctog = int(v.captain_tog, 0, 100);
  if (tog == null || ctog == null) return { ok: false, message: 'Time-on-ground thresholds go from 0 to 100%.' };
  return done(await saveRules({ scoring: { formula, captain: !!v.captain, vc: !!v.vc && !!v.captain, captain_tog: ctog, tog, dual_cover: !!v.dual_cover, loophole: !!v.loophole, lockout: v.lockout === 'fixed' ? 'fixed' : 'rolling' } }), 'Scoring saved.');
}

export async function saveKeepersDraft(v: { keepers: number; rookie: boolean; mid_order: string; mid_after_round: number; end_order: string; pick_years: number }): Promise<Res> {
  if (!(await commish())) return { ok: false, message: 'Only the commish can change keepers and the draft.' };
  const keepers = int(v.keepers, 0, 40), after = int(v.mid_after_round, 1, 24), years = int(v.pick_years, 1, 3);
  if (keepers == null || after == null || years == null) return { ok: false, message: 'Check the numbers.' };
  if (!(v.mid_order in DRAFT_ORDERS) || !(v.end_order in DRAFT_ORDERS)) return { ok: false, message: 'Pick a draft order.' };
  const e1 = await saveKc({ keepers: keepers + (v.rookie ? 1 : 0) });
  if (e1) return { ok: false, message: e1 };
  const eR = await saveRules({ team: { rookie: !!v.rookie } as LeagueRules['team'] });
  if (eR) return { ok: false, message: eR };
  return done(await saveRules({ draft: { mid_order: v.mid_order as LeagueRules['draft']['mid_order'], mid_after_round: after, end_order: v.end_order as LeagueRules['draft']['end_order'], pick_years: years } }), 'Keepers and draft saved.');
}

export async function saveFines(v: LeagueRules['fines']): Promise<Res> {
  if (!(await commish())) return { ok: false, message: 'Only the commish can change fines.' };
  const f = { captain_loop: int(v.captain_loop, 0, 1000), zero_on_field_loop: int(v.zero_on_field_loop, 0, 1000), lopsided_trade: int(v.lopsided_trade, 0, 1000) };
  if (Object.values(f).some((x) => x == null)) return { ok: false, message: 'Fines go from $0 to $1,000.' };
  return done(await saveRules({ fines: f as LeagueRules['fines'] }), 'Fines saved.');
}

export async function saveBankStart(kt: number): Promise<Res> {
  if (!(await commish())) return { ok: false, message: 'Only the commish can set the league bank.' };
  const n = int(kt, 0, 100000);
  if (n == null) return { ok: false, message: 'Starting balance goes from 0 to 100,000 KT.' };
  return done(await saveRules({ bank_start_kt: n }), `League bank starts at ${n.toLocaleString('en-AU')} KT.`);
}

export async function rulesNow(): Promise<LeagueRules> {
  const supabase = await createClient();
  const { data } = await supabase.from('leagues').select('settings').eq('id', await currentLeagueId()).maybeSingle();
  return mergeRules(((data?.settings ?? {}) as { rules?: Partial<LeagueRules> }).rules);
}

/** The commish names the league. */
export async function setLeagueName(raw: string): Promise<{ ok: boolean; error?: string }> {
  const me = await getMe();
  if (!me?.is_commish) return { ok: false, error: 'Only the commish can rename the league.' };
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, error: 'Give the league a name.' };
  if (name.length > 40) return { ok: false, error: 'Keep it to 40 characters or fewer.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('leagues').update({ name }).eq('id', await currentLeagueId()).select('id');
  if (error) return { ok: false, error: /leagues/.test(error.message) ? 'Run supabase/migrations/0027_multi_league.sql in Supabase first.' : error.message };
  if (!data?.length) return { ok: false, error: 'Could not save the league name.' };
  revalidatePath('/', 'layout');
  return { ok: true };
}
