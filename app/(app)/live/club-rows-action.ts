'use server';
// The "For [club]" tab on a player pop-up, fetched when it's opened rather than sent with every player on the page.
import { clubRows, type ClubRow } from '@/lib/club-rounds';
import type { MProfile } from '@/lib/mens-round';

export async function loadClubRows(fullName: string, teamName: string, log: MProfile['log']): Promise<ClubRow[]> {
  if (typeof fullName !== 'string' || typeof teamName !== 'string' || !Array.isArray(log)) return [];
  return clubRows(fullName.slice(0, 80), teamName.slice(0, 80), log.slice(0, 40));
}
