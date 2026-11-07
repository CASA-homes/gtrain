'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/** Point a club at its uploaded logo, or clear it (url = null). The database checks it's your club (or you're the commish). */
export async function setClubLogo(teamId: number, url: string | null): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_team_logo', { team: teamId, url });
  if (error) return { ok: false, error: error.message.includes('function') ? 'Logos go live once the commish runs the latest database update.' : error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Save a club's settings: highlight colour (or null for the default) and the clubhouse sections switched off. */
export async function setClubSettings(teamId: number, colour: string | null, hide: string[]): Promise<{ ok: boolean; error?: string }> {
  if (colour != null && !/^#[0-9a-fA-F]{6}$/.test(colour)) return { ok: false, error: 'Pick a colour from the palette.' };
  const clean = [...new Set(hide.filter((h) => /^[a-zA-Z]{2,20}$/.test(h)))].slice(0, 20);
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_team_settings', { team: teamId, colour, hide: clean });
  if (error) return { ok: false, error: /function|schema cache/.test(error.message) ? 'Club settings go live once supabase/migrations/0021_team_colours.sql has been run.' : error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}
