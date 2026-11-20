// League keeper/list rules as plain helpers (safe in client components). G-Train: 18 keepers incl. a rookie, 33-man lists.
type K = { keepers?: number | null; list_size?: number | null } | null | undefined;
/** Keeper spots, including the rookie slot. */
export const keeperSpots = (s: K) => s?.keepers ?? 18;
/** "17 + 1" style label. */
export const keeperLabel = (s: K) => `${keeperSpots(s) - 1} + 1`;
export const listSize = (s: K) => s?.list_size ?? 33;
