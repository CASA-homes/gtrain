// AFL Fantasy positions at the start of 2025 (Champion Data), keyed by normalised full name.
import data from '@/lib/positions-2025.json';
import type { Line } from '@/lib/ratings';

const POS = (data as { positions: Record<string, string[]> }).positions;
const norm = (s: string) => s.toLowerCase().replace(/ jn?r\b/, '').normalize('NFKD').replace(/[^a-z]/g, '');

/** 2025 positions for a player, or null if he wasn't on an AFL list at the start of 2025. */
export function positions2025(fullName: string | null | undefined, aflClub?: string | null): Line[] | null {
  if (!fullName) return null;
  const k = norm(fullName);
  // Two Bailey Williamses: the West Coast ruck is listed as "Bailey J. Williams".
  if (k === 'baileywilliams' && aflClub === 'WCE') return POS.baileywilliamswce as Line[];
  return (POS[k] as Line[] | undefined) ?? null;
}
