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

/** Set (or clear) a club's highlight colour. The database checks it's your club (or you're the commish). */
export async function setClubColour(teamId: number, colour: string | null): Promise<{ ok: boolean; error?: string }> {
  if (colour != null && !/^#[0-9a-fA-F]{6}$/.test(colour)) return { ok: false, error: 'Pick a colour from the palette.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_team_colour', { team: teamId, colour });
  if (error) return { ok: false, error: /function|schema cache/.test(error.message) ? 'Club colours go live once supabase/migrations/0021_team_colours.sql has been run.' : error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}
