// Pick points: the scale every offer is judged on. Pick 1 = 3,000 and value decays ~7% per pick.
export function pickPoints(overall: number) {
  return Math.round(3000 * Math.exp(-0.07 * (overall - 1)));
}

/** Points for a pick whose overall number isn't known yet: assume the middle of the round. */
export function roundPoints(round: number) {
  return pickPoints((round - 1) * 10 + 5);
}

/** A player's value score (0–100) on the same points scale, so player-for-pick trades can be compared. */
export function playerPoints(value: number) {
  // Value 100 ≈ pick 1, value 50 ≈ a late first-rounder.
  return Math.round(3000 * Math.pow(value / 100, 2.2));
}

type PickLike = { year: number; round: number; overall: number | null; kind?: string | null };
export function pickLabel(p: PickLike) {
  const tag = p.kind === 'msd' ? ' MSD' : p.kind === 'bonus' ? ' Bonus' : '';
  return `${p.year}${tag} R${p.round}${p.overall ? ` #${p.overall}` : ''}`;
}

/** Mid-season draft picks come from a thinner pool: MSD pick 1 is valued like national pick 16. */
export const MSD_OFFSET = 15;
export function pickValue(p: { round: number; overall: number | null; kind?: string | null }) {
  const off = p.kind === 'msd' ? MSD_OFFSET : 0;
  return p.overall ? pickPoints(p.overall + off) : pickPoints((p.round - 1) * 10 + 5 + off);
}
