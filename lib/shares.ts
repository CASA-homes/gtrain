// Player shares: the sums the buy and sell sheets show, matching kc_share_buy / kc_share_sell (migration 0096) to the KT.
// Whole KT; fees and tax round up.

export interface ShareRules { supply: number; maxClub: number; feePct: number; taxPct: number; limitPct: number; lockGames: number; open: boolean }
export const DEFAULT_SHARE_RULES: ShareRules = { supply: 10, maxClub: 3, feePct: 5, taxPct: 10, limitPct: 40, lockGames: 30, open: true };

export function shareRules(s: Record<string, unknown> | null | undefined): ShareRules {
  const n = (k: string, d: number) => (s && s[k] != null ? Number(s[k]) : d);
  return {
    supply: n('share_supply', 10), maxClub: n('share_max_club', 3), feePct: n('share_fee_pct', 5), taxPct: n('share_tax_pct', 10),
    limitPct: n('share_limit_pct', 40), lockGames: n('share_lock_games', 30), open: s?.shares_open == null ? true : !!s.shares_open,
  };
}

/** Buying n shares at price: what it costs. */
export function buyCost(price: number, n: number, feePct: number) {
  const gross = price * n;
  const fee = Math.ceil((gross * feePct) / 100);
  return { gross, fee, total: gross + fee };
}

/** Selling n of qty shares that cost `cost` KT in all, at price: what comes back. */
export function sellReturn(price: number, n: number, qty: number, cost: number, feePct: number, taxPct: number) {
  const gross = price * n;
  const basis = n === qty ? cost : Math.round((cost * n) / qty);
  const fee = Math.ceil((gross * feePct) / 100);
  const tax = Math.ceil((Math.max(0, gross - basis) * taxPct) / 100);
  const net = Math.max(0, gross - fee - tax);
  return { gross, basis, fee, tax, net, pl: net - basis };
}

/** The share price he must reach before selling returns what a share cost (fee included). */
export function breakEven(costPerShare: number, feePct: number, taxPct: number) {
  const f = feePct / 100, t = taxPct / 100;
  return (costPerShare * (1 - t)) / Math.max(0.01, 1 - f - t);
}

/** How much more KT a club can put into shares: limit% of (bank + what it paid for shares held), less what it holds. */
export const shareRoom = (bank: number, heldCost: number, limitPct: number) => Math.max(0, Math.floor(((bank + heldCost) * limitPct) / 100) - heldCost);
