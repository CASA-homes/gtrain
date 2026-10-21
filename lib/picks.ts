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

export function pickLabel(p: { year: number; round: number; overall: number | null }) {
  return `${p.year} R${p.round}${p.overall ? ` #${p.overall}` : ''}`;
}

export function pickValue(p: { round: number; overall: number | null }) {
  return p.overall ? pickPoints(p.overall) : roundPoints(p.round);
}
