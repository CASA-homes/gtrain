// Commish score overrides, applied on top of whatever the feed says. Pure (no database), so the client can use the
// types too; the server loads the rows in lib/scores/server.ts. Rules, in order:
//   1. A locked round uses its frozen snapshot for every player (late feed changes can't move results).
//   2. Otherwise a commish override wins.
//   3. Otherwise the feed's score, unless the feed is paused for the round (manual scores only), when it's blank.
import type { LRound } from './types';

export interface OverrideRow { player_id: number; player_name: string; score: number; feed_score: number | null; reason: string | null; set_at: string }
export interface RoundState { paused: boolean; locked_at: string | null; snapshot: Record<string, number> | null }
export interface LogRow { id: number; what: string; who: string; at: string }

export function applyOverrides(r: LRound, st: RoundState | null, ov: OverrideRow[]): LRound {
  const byId = new Map(ov.map((o) => [o.player_id, o.score]));
  const snap = st?.locked_at && st.snapshot ? st.snapshot : null;
  const paused = !!st?.paused && !snap;
  if (!snap && !paused && !byId.size) return { ...r, scoreState: { paused: false, locked: false, overrides: 0 } };
  return {
    ...r,
    players: r.players.map((p) => {
      const feed = p.score;
      if (snap) { const s = snap[String(p.id)]; return { ...p, feed, score: s ?? feed, manual: byId.has(p.id) }; }
      const o = byId.get(p.id);
      if (o != null) return { ...p, feed, score: o, manual: true };
      return paused ? { ...p, feed, score: null, manual: false } : p;
    }),
    scoreState: { paused, locked: !!snap, overrides: byId.size },
  };
}
