// Injured players: a 2026 average dragged down by time out of the side undersells them.
import { age, type PlayerRow } from '@/lib/ratings';

export const CURRENT_YEAR = 2026;

/** Known 2026 injury stories, keyed by players.name. Data alone can't tell injury from form, so these add the why. */
export const INJURY_2026: Record<string, string> = {
  'T. English': 'Injuries cost him a big chunk of 2026',
  'Z. Butters': 'Injuries cost him games in 2026',
  'T. Green': 'He missed 2026 through injury',
  'I. Heeney': 'A groin injury hampered him through 2026, before the Pullman ban ended his season',
  'J. Caldwell': 'Injuries interrupted his 2026',
  'C. Rozee': 'Injury wiped out almost all of his 2026',
};

/** Commish calls: bounce-back candidates whose best football came before the usual two-year window. */
export const FORCED_BOUNCE: Record<string, string> = {
  'K. Coleman': 'Big injuries wiped out almost all of his 2024 and 2025',
};

export interface BounceBack { peak: [number, number, number]; g26: number; a26: number; blended: number }

/**
 * A player who scored big in 2024 or 2025 (88+ over 8+ games), then had an interrupted 2026 (18 games or fewer,
 * or a known injury) and fell 10+ points or played 12 or fewer. Aged 31 or under.
 * Blended average: halfway between the peak and 2026, weighted towards 2026 the more games he played
 * (no games = 90% of peak).
 */
export function bounceBack(p: PlayerRow): BounceBack | null {
  if (p.list_status) return null;
  const hist = (p.hist ?? []).filter((h) => h[1] > 0);
  const s26 = hist.find((h) => h[0] === CURRENT_YEAR);
  const g26 = s26?.[1] ?? 0, a26 = s26?.[2] ?? 0;
  const forced = !!FORCED_BOUNCE[p.name];
  const prior = hist.filter((h) => h[0] >= CURRENT_YEAR - (forced ? 5 : 2) && h[0] < CURRENT_YEAR && h[1] >= 8);
  if (!prior.length) return null;
  const peak = prior.reduce((x, y) => (y[2] > x[2] ? y : x));
  const interrupted = !!INJURY_2026[p.name] || g26 <= 18;
  if (!forced && !(peak[2] >= 88 && interrupted && (a26 <= peak[2] - 10 || g26 <= 12))) return null;
  if ((age(p.birth_date) ?? 30) > 31) return null;
  const w26 = g26 === 0 ? 0 : Math.min(0.6, 0.3 + g26 * 0.015);   // 2 games ≈ 0.33, 17 games ≈ 0.55
  const blended = g26 === 0 ? peak[2] * 0.9 : peak[2] * (1 - w26) + a26 * w26;
  return { peak, g26, a26, blended: Math.round(blended * 10) / 10 };
}
