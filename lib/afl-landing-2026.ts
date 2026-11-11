// Where each 2026 prospect is expected to go in the real AFL draft (before it's run). The G-Train draft follows AFL pick
// numbers closely (every mid/small AFL top-10 pick went inside G-Train pick 16 last year), so the mock draft values
// rookies on this, not on the scouts' rankings. Fixed spots are the commish's read or known bids; everyone else fills
// the remaining picks in consensus-board order (Twomey / Rookie Me / Zero Hanger). Replace with the real order after the draft.
export const AFL_LANDING_2026: Record<string, { pick: number; club?: string }> = {
  // From Cal Twomey's November Phantom Form Guide, plus the commish's read on Mellody.
  'Dougie Cochrane': { pick: 1, club: 'Port Adelaide' },   // Essendon bid at 1, Port match (NGA)
  'Ethan Drever': { pick: 2, club: 'Essendon' },            // favourite for Essendon's top pick once Port match the bid
  'Cody Walker': { pick: 3, club: 'Carlton' },              // father-son: Carlton can't match before 3, Richmond the likely bidder
  'Heath Mellody': { pick: 4, club: 'West Coast' },          // commish: the Eagles' top pick (Twomey: West Coast big contenders)
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
