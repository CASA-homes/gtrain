// Where each 2026 prospect is expected to go in the real AFL draft (before it's run). The G-Train draft follows AFL pick
// numbers closely (every mid/small AFL top-10 pick went inside G-Train pick 16 last year), so the mock draft values
// rookies on this, not on the scouts' rankings. Fixed spots are the commish's read or known bids; everyone else fills
// the remaining picks in consensus-board order (Twomey / Rookie Me / Zero Hanger). Replace with the real order after the draft.
export const AFL_LANDING_2026: Record<string, { pick: number; club?: string }> = {
  'Dougie Cochrane': { pick: 1, club: 'Port Adelaide' },   // Essendon expected to bid at 1, Port match (NGA)
  'Cody Walker': { pick: 2, club: 'Carlton' },              // father-son, bid expected very early
  'Heath Mellody': { pick: 3, club: 'West Coast' },          // commish: likely pick 3 to the Eagles
};

/** Projected AFL pick for every prospect: fixed spots first, then the consensus order fills the gaps. */
export function projectedAflPicks(prospects: { name: string; slot?: number; rank: number }[]): Map<string, { pick: number; club?: string }> {
  const out = new Map<string, { pick: number; club?: string }>();
  const taken = new Set<number>();
  for (const p of prospects) { const f = AFL_LANDING_2026[p.name]; if (f) { out.set(p.name, f); taken.add(f.pick); } }
  let next = 1;
  for (const p of [...prospects].filter((p) => !out.has(p.name)).sort((a, b) => (a.slot ?? a.rank) - (b.slot ?? b.rank))) {
    while (taken.has(next)) next++;
    out.set(p.name, { pick: next }); taken.add(next);
  }
  return out;
}
