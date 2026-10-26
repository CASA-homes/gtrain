// Awards for the 2026 G-Train redraft: who each pick turned into after a season.
import { GTRAIN_DRAFTS } from '@/lib/gtrain-draft';
import { DRAFTEES } from '@/lib/draft-history';
import { age, type PlayerRow, type Ratings } from '@/lib/ratings';

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();

export interface Award { key: string; title: string; blurb: string; player: PlayerRow; pick: number; team: string; line: string; why: string }

export function draftAwards(players: PlayerRow[], ratings: Map<number, Ratings>): Award[] {
  const byName = new Map<string, PlayerRow>();
  for (const p of players) { if (p.full_name) byName.set(norm(p.full_name), p); if (!byName.has(norm(p.name))) byName.set(norm(p.name), p); }
  // Draft list sometimes uses a short first name (Brad v Bradley): fall back to surname + first-name prefix, if unique.
  const loose = (n: string) => {
    const [first, ...rest] = norm(n).split(' ');
    const last = rest.join(' ');
    const hits = players.filter((p) => {
      const [f, ...r] = norm(p.full_name ?? p.name).split(' ');
      return r.join(' ') === last && (f.startsWith(first) || first.startsWith(f));
    });
    return hits.length === 1 ? hits[0] : undefined;
  };
  const aflPick = new Map(DRAFTEES.filter((d) => d.y === 2025 && d.id).map((d) => [d.id!, d.p]));
  const rows = GTRAIN_DRAFTS[2026].map((g) => {
    const p = byName.get(norm(g.name)) ?? loose(g.name);
    if (!p) return null;
    const r = ratings.get(p.id);
    const a = age(p.birth_date);
    const rookie = p.draft_year === 2025 && (p.debut_year == null || p.debut_year >= 2026);
    return { g, p, r, a, rookie, avg: (p.games ?? 0) > 0 ? p.average ?? 0 : 0, gm: p.games ?? 0, afl: p.dfs_id ? aflPick.get(p.dfs_id) ?? null : null };
  }).filter((x): x is NonNullable<typeof x> => !!x && !!x.r);
  const used = new Set<number>();
  const out: Award[] = [];
  const add = (key: string, title: string, blurb: string, x: (typeof rows)[number] | undefined, why: string) => {
    if (!x) return;
    used.add(x.p.id);
    out.push({ key, title, blurb, player: x.p, pick: x.g.pick, team: x.g.team, line: `${x.gm} games · ${x.avg ? x.avg.toFixed(1) : '–'} avg${x.a != null ? ` · age ${x.a}` : ''}`, why });
  };
  const fresh = (xs: typeof rows) => xs.filter((x) => !used.has(x.p.id));

  // Consensus best rookie: the highest pick in the 2025 AFL national draft that G-Train took
  const rookies = rows.filter((x) => x.rookie);
  const best = [...rookies].filter((x) => x.afl != null).sort((a, b) => a.afl! - b.afl!)[0] ?? [...rookies].sort((a, b) => b.r!.potential! - a.r!.potential!)[0];
  add('rookie', 'Consensus best rookie', 'The top national draft pick G-Train took', best,
    best ? `AFL pick ${best.afl ?? '?'} in 2025. ${best.gm ? `${best.avg.toFixed(0)} average from ${best.gm} games in his first year.` : 'Yet to debut.'}` : '');

  // Diamond in the rough: a rookie taken at pick 30 or later who scored best
  const diamond = fresh(rookies).filter((x) => x.g.pick >= 30 && x.gm >= 3).sort((a, b) => b.avg - a.avg)[0];
  add('diamond', 'Diamond in the rough', 'Best late-pick rookie', diamond,
    diamond ? `Taken at pick ${diamond.g.pick}${diamond.afl ? ` (AFL pick ${diamond.afl})` : ''} and averaged ${diamond.avg.toFixed(0)} as a first-year player.` : '');

  // Best value: biggest average above what that pick slot usually returns (fit avg ~ log(pick) over the whole draft)
  const fit = rows.filter((x) => x.gm >= 8);
  const xs = fit.map((x) => Math.log(x.g.pick)), ys = fit.map((x) => x.avg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const slope = xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0) / xs.reduce((t, x) => t + (x - mx) ** 2, 0);
  const expect = (pick: number) => my + slope * (Math.log(pick) - mx);
  // Worst top-10 pick: the lowest value among picks 1-10
  const value = fresh(fit).map((x) => ({ x, over: x.avg - expect(x.g.pick) })).sort((a, b) => b.over - a.over)[0];
  add('value', 'Best value pick', 'Most points above his draft slot', value?.x,
    value ? `Pick ${value.x.g.pick} usually returns about ${expect(value.x.g.pick).toFixed(0)}; he averaged ${value.x.avg.toFixed(0)}, +${value.over.toFixed(0)}.` : '');

  // Best late pick: round-ten-and-beyond territory (pick 100+), highest scorer
  const late = fresh(rows).filter((x) => x.g.pick >= 100 && x.gm >= 8).sort((a, b) => b.avg - a.avg)[0];
  add('late', 'Best late pick', 'Best of the picks from 100 onwards', late,
    late ? `Nobody wanted him until pick ${late.g.pick}. Averaged ${late.avg.toFixed(0)} from ${late.gm} games.` : '');

  // Best asset: young and already good, judged on value with potential as the tiebreak
  const asset = fresh(rows).filter((x) => (x.a ?? 99) <= 25 && x.gm >= 8 && x.avg >= 80).sort((a, b) => (b.r!.value + (b.r!.potential ?? 0) * 4) - (a.r!.value + (a.r!.potential ?? 0) * 4))[0];
  add('asset', 'Best long-term asset', 'Young, scoring now, years left in him', asset,
    asset ? `Value ${asset.r!.value} at ${asset.a}, potential ${asset.r!.potential} stars. A keeper for years.` : '');

  // Teenagers taken as development picks aren't judged yet; this is for picks meant to score now.
  const worst = fresh(rows).filter((x) => x.g.pick <= 10 && (x.a ?? 0) >= 22).sort((a, b) => (a.avg - expect(a.g.pick)) - (b.avg - expect(b.g.pick)))[0];
  add('worst', 'Worst top-10 pick', 'The early pick that hasn’t paid off yet', worst,
    worst ? (worst.gm ? `Went at pick ${worst.g.pick} as a ready-made player and averaged ${worst.avg.toFixed(0)} from ${worst.gm} games, about ${Math.round(expect(worst.g.pick) - worst.avg)} under what that slot returns.` : `Hasn’t played an AFL game since going at pick ${worst.g.pick}.`) : '');
  const ORDER = ['rookie', 'diamond', 'value', 'late', 'asset', 'worst'];
  return out.sort((x, y) => ORDER.indexOf(x.key) - ORDER.indexOf(y.key));
}
