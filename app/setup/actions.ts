'use server';
// League setup: create a league from scratch (the creator becomes commish). Import lives in import-actions.ts.
import { createClient } from '@/lib/supabase/server';

export interface ClubIn { name: string; coach: string; email: string }
export interface CreateIn { name: string; season: number; scoring: 'afl' | 'sc'; preset: 'classic' | 'dynasty' | 'later'; clubs: ClubIn[]; myClub: number }

const MISSING = 'League setup needs supabase/migrations/0030_signup_create_league.sql run in Supabase first.';

export async function createLeague(x: CreateIn): Promise<{ ok: boolean; id?: number; error?: string }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return { ok: false, error: 'Sign in first.' };
  const clubs = (x.clubs ?? []).slice(0, 20).map((c) => ({ name: String(c.name ?? '').trim().slice(0, 40), coach: String(c.coach ?? '').trim().slice(0, 40), email: String(c.email ?? '').trim().toLowerCase().slice(0, 120) }));
  if (clubs.some((c) => !c.name)) return { ok: false, error: 'Every club needs a name.' };
  if (new Set(clubs.map((c) => c.name.toLowerCase())).size !== clubs.length) return { ok: false, error: 'Two clubs have the same name.' };
  const { data, error } = await supabase.rpc('create_league', {
    league_name: String(x.name ?? '').trim(), first_season: Number(x.season), scoring: x.scoring, preset: x.preset, clubs, my_club: Number(x.myClub),
  });
  if (error) return { ok: false, error: /create_league/.test(error.message) && /function/.test(error.message) ? MISSING : error.message };
  return { ok: true, id: Number(data) };
}
