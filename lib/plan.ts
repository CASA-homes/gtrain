import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

// Free and Pro plans (migration 0085). Each league has one; founding leagues (created before Round 1, 2027) are Pro
// for the 2027 season. Until 0085 runs, every league counts as Pro so nothing locks by accident.
export interface Plan { plan: 'free' | 'pro'; founding: boolean; proUntil: string | null; isPro: boolean; coaches: number; ready: boolean }
export const PRO_PER_COACH = 10;

export const getPlan = cache(async (): Promise<Plan> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('league_plan');
  const row = (Array.isArray(data) ? data[0] : data) as { plan: 'free' | 'pro'; founding: boolean; pro_until: string | null; is_pro: boolean; coaches: number } | null;
  if (error || !row) return { plan: 'pro', founding: false, proUntil: null, isPro: true, coaches: 0, ready: false };
  return { plan: row.plan, founding: row.founding, proUntil: row.pro_until, isPro: row.is_pro, coaches: row.coaches, ready: true };
});

export const isSiteAdmin = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('is_site_admin');
  return !error && data === true;
});
