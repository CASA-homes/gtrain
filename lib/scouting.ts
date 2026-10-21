// Box-score attributes (1–20, FM style) and the written scouting report on each player profile.
// Attributes are percentiles against every rostered player with 5+ AFL games in 2026.
import { age, played, primaryLine, type Box, type PlayerRow, type Ratings } from '@/lib/ratings';

export interface Attr { key: string; label: string; value: number; raw: string }

type Def = { key: string; label: string; f: (b: Box) => number | null; raw: (b: Box) => string };
const n = (x: number | undefined) => x ?? 0;
const f1 = (x: number | undefined) => (x == null ? '–' : x.toFixed(1));

export const ATTRS: Def[] = [
  { key: 'disp', label: 'Ball winning', f: (b) => n(b.k) + n(b.h), raw: (b) => `${f1(n(b.k) + n(b.h))} disposals` },
  { key: 'cp', label: 'Contested ball', f: (b) => b.cp ?? null, raw: (b) => `${f1(b.cp)} contested poss.` },
  { key: 'cl', label: 'Clearances', f: (b) => b.cl ?? null, raw: (b) => `${f1(b.cl)} clearances` },
  { key: 'k', label: 'Kicking', f: (b) => n(b.k) * (0.6 + n(b.de) / 250), raw: (b) => `${f1(b.k)} kicks · ${b.de ?? '–'}% DE` },
  { key: 'mg', label: 'Metres gained', f: (b) => b.mg ?? null, raw: (b) => `${b.mg == null ? '–' : Math.round(b.mg)} m` },
  { key: 'm', label: 'Marking', f: (b) => n(b.m) + n(b.cm) * 1.5, raw: (b) => `${f1(b.m)} marks · ${f1(b.cm)} contested` },
  { key: 't', label: 'Tackling', f: (b) => b.t ?? null, raw: (b) => `${f1(b.t)} tackles` },
  { key: 'def', label: 'Intercept & rebound', f: (b) => n(b.it) + n(b.r5), raw: (b) => `${f1(b.it)} intercepts · ${f1(b.r5)} rebounds` },
  { key: 'fwd', label: 'Scoreboard impact', f: (b) => n(b.g) * 3 + n(b.b) + n(b.mi5) + n(b.i5) * 0.5, raw: (b) => `${f1(b.g)}.${f1(b.b).replace('.', '')} · ${f1(b.i5)} inside 50s` },
  { key: 'ho', label: 'Ruckwork', f: (b) => b.ho ?? null, raw: (b) => `${f1(b.ho)} hitouts` },
  { key: 'cba', label: 'Centre bounces', f: (b) => b.cba ?? null, raw: (b) => `${b.cba ?? 0}% attended` },
  { key: 'tog', label: 'Time on ground', f: (b) => b.tog ?? null, raw: (b) => `${b.tog ?? '–'}%` },
];

const usable = (p: PlayerRow) => !!p.box && n(p.box.gm) >= 5;

function pct(sorted: number[], x: number) {
  if (!sorted.length) return 50;
  let below = 0;
  for (const v of sorted) if (v < x) below++;
  return (below / sorted.length) * 100;
}
const to20 = (p: number) => Math.max(1, Math.min(20, Math.round(p / 5)));

/** Build every player's box-score attributes in one pass. */
export function buildAttrs(all: PlayerRow[]): Map<number, Attr[]> {
  const pool = all.filter(usable);
  const sorted = new Map(ATTRS.map((a) => [a.key, pool.map((p) => a.f(p.box!) ?? 0).sort((x, y) => x - y)]));
  const out = new Map<number, Attr[]>();
  for (const p of all) {
    if (!p.box) continue;
    out.set(p.id, ATTRS.map((a) => ({ key: a.key, label: a.label, value: to20(pct(sorted.get(a.key)!, a.f(p.box!) ?? 0)), raw: a.raw(p.box!) })));
  }
  return out;
}

// ---------------------------------------------------------------- written report

export interface Report { style: string; potential: string; fantasy: string; tags: string[] }

const pick = <T,>(xs: T[], seed: number) => xs[Math.abs(seed) % xs.length];
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/**
 * A three-part scouting note built from his numbers: how he plays, where he's heading, what he scores.
 * Deterministic: the same stats always produce the same words.
 */
export function scoutingReport(p: PlayerRow, r: Ratings, attrs: Attr[] | undefined): Report {
  const b = p.box;
  const a = age(p.birth_date);
  const line = primaryLine(p);
  const first = (p.full_name ?? p.name).split(' ')[0];
  const seed = p.id * 7 + (p.name.length * 13);
  const by = new Map((attrs ?? []).map((x) => [x.key, x.value]));
  const v = (k: string) => by.get(k) ?? 0;
  const tags: string[] = [];

  // ---- play style
  let style: string;
  if (!b || n(b.gm) === 0) {
    style = p.career_games
      ? `${first} didn’t play an AFL game in 2026, so there’s no current box score to read. He has ${p.career_games} career games to fall back on.`
      : `${first} is yet to debut at AFL level, so his game is still a projection rather than a record.`;
  } else {
    const disp = n(b.k) + n(b.h);
    const role =
      n(b.ho) >= 15 ? (v('fwd') >= 12 ? 'a ruck who drifts forward and hurts on the scoreboard' : v('cl') >= 14 ? 'a ruck who follows up at ground level and wins his own clearances' : 'a tap-first ruck')
      : n(b.cba) >= 60 ? (v('cp') >= 15 ? 'an inside midfielder who lives at the stoppages' : v('mg') >= 15 ? 'a run-and-carry midfielder who breaks lines from the centre' : 'a centre-bounce midfielder')
      : line === 'DEF' || v('def') >= 15 ? (v('k') >= 15 && v('mg') >= 13 ? 'a rebounding half-back who takes the kick-ins and sets up the chain' : v('m') >= 15 ? 'an intercept defender who reads the ball in flight' : 'a lockdown-first defender')
      : line === 'FWD' || v('fwd') >= 15 ? (n(b.g) >= 2 ? 'a key target who kicks a bag when the ball goes long' : v('t') >= 15 ? 'a pressure forward who earns his points with tackles' : v('disp') >= 13 ? 'a high half-forward who pushes up the ground to find it' : 'a small forward who lives off crumbs and pressure')
      : n(b.cba) >= 25 ? 'a rotating midfielder who splits time between the centre and a wing'
      : 'an outside runner who finds space on the wing';

    const strengths = (attrs ?? []).filter((x) => x.value >= 16 && x.key !== 'tog' && x.key !== 'cba').sort((x, y) => y.value - x.value).slice(0, 3).map((x) => x.label.toLowerCase());
    const weak = (attrs ?? []).filter((x) => x.value <= 5 && ['disp', 'cp', 't', 'm', 'k'].includes(x.key)).map((x) => x.label.toLowerCase());
    const ratio = n(b.h) ? n(b.k) / n(b.h) : 0;
    const foot = ratio >= 1.7 ? 'He’s a kick-first player' : ratio && ratio <= 1 ? 'He’s handball-heavy and plays in close' : null;

    style = `${first} is ${role}. He averaged ${disp.toFixed(1)} disposals (${f1(b.k)} kicks, ${f1(b.h)} handballs), ${f1(b.m)} marks and ${f1(b.t)} tackles`
      + (b.cl != null && n(b.cl) >= 2 ? `, with ${f1(b.cl)} clearances a game` : '')
      + (n(b.ho) >= 5 ? ` and ${f1(b.ho)} hitouts` : '')
      + (n(b.g) >= 1 ? `, kicking ${f1(b.g)} goals a game` : '') + '. '
      + (strengths.length ? `${pick(['His standout tools are', 'He grades elite for', 'Where he separates himself:'], seed)} ${list(strengths)}. ` : '')
      + (foot ? `${foot}${b.de ? ` and hits ${b.de}% of his targets` : ''}. ` : '')
      + (weak.length ? `The gap in his game is ${list(weak)}.` : '');
    if (n(b.cba) >= 60) tags.push('Centre bounce');
    if (v('cp') >= 16) tags.push('Contested beast');
    if (v('mg') >= 16) tags.push('Line breaker');
    if (v('def') >= 16) tags.push('Interceptor');
    if (v('fwd') >= 16) tags.push('Scoreboard');
    if (v('t') >= 17) tags.push('Pressure');
    if (n(b.ki) >= 15) tags.push('Kick-ins');
    if (n(b.ho) >= 15) tags.push('Ruck');
  }

  // ---- potential
  const cg = p.career_games ?? 0;
  const pot = r.potential;
  let potential: string;
  if (a == null) potential = 'Age data is missing, so potential can’t be graded yet.';
  else if (a <= 21) {
    potential = `At ${a}${cg ? ` with ${cg} games` : ' and yet to debut'}, ${first} is at the very start of the curve. `
      + (pot != null && pot >= 4 ? 'The output he’s already shown for his age points to a genuine future premium. Hold.'
        : pot != null && pot >= 3 ? 'There are enough signs to keep him on the list while the role grows.'
        : 'It’s a long-range bet: he needs a bigger role before the fantasy numbers follow.');
    if (cg <= 10) tags.push('Rookie-keeper eligible');
  } else if (a <= 24) {
    potential = `${first} is ${a} and moving into his best years. `
      + (r.value >= 75 ? 'He’s already producing like a premium, so the ceiling is a top-10 line player for the next five seasons.'
        : r.value >= 50 ? 'He’s a solid contributor with room to add 10–15 points a game if his midfield minutes grow.'
        : 'He hasn’t locked in a role yet. This is the age where it either clicks or he becomes depth.');
  } else if (a <= 28) {
    potential = `At ${a}, ${first} is in his prime. What you see now is close to what you get: ${r.value >= 70 ? 'a premium you can bank on for another three or four seasons.' : 'a reliable squad player, unlikely to jump a tier.'}`;
  } else if (a <= 30) {
    potential = `${first} is ${a} and on the back end of his prime. ${r.value >= 70 ? 'Still elite, but his trade value is at its peak now and only drops from here.' : 'Expect a gradual slide. Keep him for this season’s points, not for the future.'}`;
    tags.push('Sell window');
  } else {
    potential = `At ${a}, ${first} is a short-term asset. ${r.value >= 70 ? 'He can still win you a flag this year, but plan the succession now.' : 'Squad depth with a year or two left.'}`;
    tags.push('Ageing');
  }

  // ---- fantasy output
  let fantasy: string;
  const xs = played(p.last5);
  if (!p.average) fantasy = 'No fantasy scores in 2026.';
  else {
    const tier = p.average >= 110 ? 'a top-tier premium' : p.average >= 100 ? 'a premium' : p.average >= 90 ? 'a reliable scorer just below premium' : p.average >= 80 ? 'a solid starter' : p.average >= 70 ? 'a bench-level scorer' : 'a non-scorer at this stage';
    const ceiling = b?.mx ? ` His best was ${b.mx}.` : '';
    const ppm = b?.ppm ? (b.ppm >= 1.1 ? ` At ${b.ppm.toFixed(2)} points a minute he’s one of the most efficient scorers in the comp.` : b.ppm <= 0.75 ? ` His ${b.ppm.toFixed(2)} points a minute means he needs big time on ground to score.` : '') : '';
    const cons = r.consistency >= 15 ? 'He rarely has a bad day.' : r.consistency <= 6 ? 'Scores swing a lot week to week, so he’s a better captain-loophole than a lock.' : '';
    const formNote = xs.length >= 3 ? (() => {
      const m = xs.reduce((s, x) => s + x, 0) / xs.length;
      return m > p.average * 1.06 ? ` Finished the year hot (${Math.round(m)} over his last ${xs.length}).` : m < p.average * 0.94 ? ` Tailed off late (${Math.round(m)} over his last ${xs.length}).` : '';
    })() : '';
    fantasy = `${p.average.toFixed(1)} average from ${p.games ?? 0} games makes him ${tier}.${ceiling}${ppm} ${cons}${formNote}`.replace(/\s+/g, ' ').trim();
    if (p.average >= 110) tags.unshift('Premium');
  }

  return { style, potential, fantasy, tags: [...new Set(tags)].slice(0, 5) };
}
