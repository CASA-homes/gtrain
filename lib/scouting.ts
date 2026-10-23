// Box-score attributes (1–20, FM style) and the written scouting report on each player profile.
// Attributes are percentiles against every rostered player with 5+ AFL games in 2026.
import { age, played, primaryLine, type Box, type PlayerRow, type Ratings } from '@/lib/ratings';
import { noteFor, type Verdict } from '@/lib/notes';
import { bounceBack, CURRENT_YEAR, FORCED_BOUNCE, INJURY_2026 } from '@/lib/injury';


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
  { key: 'ki', label: 'Kick-ins', f: (b) => (n(b.gm) ? n(b.ki) / n(b.gm) : null), raw: (b) => `${f1(n(b.gm) ? n(b.ki) / n(b.gm) : 0)} a game · ${Math.round(n(b.ki))} for the season` },
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

export interface Report { style: string; potential: string; fantasy: string; health: string | null; outlook: string; position: string | null; verdict: Verdict; extra: Verdict[]; tags: string[] }



const pick = <T,>(xs: T[], seed: number) => xs[Math.abs(seed) % xs.length];
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const ord = (n: number) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] ?? 'th');
const EXPECTED_BY_SEASON = [55, 55, 65, 75, 82, 88];

/** What he actually does on the ground, from height, ruck share, centre bounces and where he gets the ball. */
function roleOf(p: PlayerRow, b: Box, v: (k: string) => number): string {
  const ht = p.height_cm ?? 0;
  const rc = n(b.rc), ho = n(b.ho), cba = n(b.cba), goals = n(b.g), disp = n(b.k) + n(b.h);
  const line = primaryLine(p);
  if (rc >= 60 || ho >= 22) {
    return cba >= 60 && n(b.cl) >= 4 ? 'a No.1 ruck who follows up at ground level and wins his own clearances'
      : goals >= 1 ? 'a No.1 ruck who rests forward and hits the scoreboard' : 'a tap-first No.1 ruck';
  }
  if (rc >= 20 || ho >= 8 || (ht >= 199 && p.positions.includes('RUC'))) {
    return goals >= 1 ? 'a ruck-forward who splits his time between the centre circle and the goal square'
      : 'a ruck who shares the load in a two-man rotation';
  }
  const mid = (c: number) => c >= 60 || (line === 'MID' && c >= 45);
  if (mid(cba)) return v('cp') >= 15 ? 'an inside midfielder who lives at the stoppages' : v('mg') >= 15 ? 'a run-and-carry midfielder who breaks lines from the centre' : 'a centre-bounce midfielder';
  // Defender branch: DEF-listed, or a non-forward who clearly plays off half-back (no centre bounces, defensive numbers).
  if (line === 'DEF' || (line !== 'FWD' && cba < 25 && v('def') >= 15)) {
    if (ht >= 193 && v('m') >= 12) return 'a key defender who takes the big intercept marks';
    if (ht >= 193) return 'a key defender whose job is to beat his man, not rack up the ball';
    // ki is kick-ins taken across the season.
    if (n(b.ki) >= 30) return 'a rebounding half-back who takes the kick-ins and sets up the chain';
    if (v('k') >= 15 && v('mg') >= 13) return 'a rebounding half-back whose kicking sets up the chain';
    if (v('m') >= 15 || n(b.m) >= 6) return 'an intercept defender who reads the ball in flight';
    if (disp >= 17) return 'a half-back flanker who gets plenty of the ball and uses it going forward';
    return ht && ht < 186 ? 'a small defender who plays on the opposition’s danger forwards' : 'a medium defender who plays a lockdown role';
  }
  if (line === 'FWD' || (cba < 25 && v('fwd') >= 15)) {
    if (ht >= 192) return goals >= 2 ? 'a key forward who kicks a bag when the ball goes long' : 'a tall forward who presents up the ground and competes in the air';
    if (cba >= 20) return 'a forward who rotates through the midfield';
    // Judge on what he actually does: volume and marking first, so a winger listed as a forward isn't called a crumber.
    if (disp >= 17) return n(b.m) >= 4.5 ? 'a winger and half-forward who runs hard both ways and takes marks up the ground' : goals >= 1.5 ? 'a high-volume forward who finds plenty of the ball and still hits the scoreboard' : 'a wing and half-forward who pushes up the ground to find the ball';
    if (disp >= 14) return n(b.m) >= 4.5 ? 'a medium forward who leads up the ground and marks well' : 'a high half-forward who pushes up the ground to find it';
    if (n(b.t) >= 4 || v('t') >= 15) return 'a pressure forward who earns his points with tackles';
    if (ht && ht < 184) return 'a small forward who lives off crumbs and pressure';
    return n(b.m) >= 4 ? 'a medium forward who leads and marks inside 50' : 'a forward who plays a lower-possession role inside 50';
  }
  if (cba >= 25) return 'a rotating midfielder who splits time between the centre and a wing';
  if (disp >= 14) return n(b.m) >= 4.5 ? 'a winger who covers the ground and takes marks' : 'an outside runner who finds space on the wing';
  return 'a role player still looking for a fixed spot in the side';
}

/**
 * The verdict label, plus any secondary labels. Line-adjusted average first (forwards +10, defenders +5, so a 90
 * forward reads like a 100 midfielder; half that lift for the tiers below gun):
 *   Win-now asset: 30 or older and 95+ (or gun-level for his line).
 *   Fantasy star 110+, Fantasy gun 99+ (any age under 30).
 *   24 and under, it's about potential:
 *     Potential fantasy star: 23 or younger at 90+, 21 or younger at 80+, 20 or younger at 76+, or a top-10 pick aged 20 or under with top potential.
 *     Potential great fantasy player: 78+, strong potential, 22 or younger at 72+, a hot finish (80+ over his last five),
 *       or 65+ in an injury-shortened season.
 *     Potential good fantasy player: 60+. Below that: Role dependent.
 *     Fewer than 10 AFL games: Too early to tell for a top-20 pick (with his potential tier), otherwise Unknown quantity. Top-20 picks with 20 or
 *     fewer games are at least Potential great, tagged Too early to tell. Under 70 with a real sample: Role dependent tag.
 *   Key-position players (193cm+ defenders and forwards) drop one potential rung.
 *   Missed a lot of football (under 9 games a year on a list, 8 or fewer in 2026): Unknown quantity tag.
 *   Over 24: Great fantasy player 90–99, Reliable starter 80–90, Depth piece 70–80, Role dependent under 70.
 *   Under 30 with an injury-hit season: Bounce-back candidate. 30 or older and not a win-now asset: Sell now tag.
 */
function verdictFor(p: PlayerRow, r: Ratings, a: number | null, bounce: boolean): { verdict: Verdict; extra: Verdict[] } {
  const pot = r.potential ?? 0, cg = p.career_games ?? 0, avg = p.average ?? 0, g = p.games ?? 0;
  const adj = avg + r.lineBonus;            // full scarcity lift for the elite tiers
  const adjMid = avg + r.lineBonus / 2;     // half lift lower down, where depth on every line is easy to find
  const extra: Verdict[] = [];
  const out = (v: Verdict) => ({ verdict: v, extra: extra.filter((x) => x !== v) });
  const age = a ?? 27;
  const recent = played(p.last5);
  const hot = recent.length >= 3 && recent.reduce((s2, x) => s2 + x, 0) / recent.length >= 80;
  const pickN = p.draft_pick ?? 99;

  // Missed a lot of footy: few games for his years on a list, and barely played in 2026.
  const yrs = p.draft_year ? CURRENT_YEAR - p.draft_year : 0;
  if (yrs >= 3 && cg / yrs < 9 && g <= 8 && cg >= 10) extra.push('Unknown quantity');
  if (age >= 30 && (avg >= 95 || adj >= 99)) return out('Win-now asset');
  if (age >= 30) extra.push('Sell now');
  if (adj >= 110 && g >= 8) return out('Fantasy star');
  if (adj >= 99 && g >= 8) return out('Fantasy gun');

  if (age <= 24) {
    let tier: Verdict =
      age <= 23 && (avg >= 90 || (age <= 21 && avg >= 80) || (age <= 20 && avg >= 76) || (age <= 20 && pickN <= 10 && pot >= 4.5)) ? 'Potential fantasy star'
      : avg >= 78 || pot >= 4 || (age <= 22 && avg >= 72) || hot || (g <= 16 && avg >= 65) ? 'Potential great fantasy player'
      : avg >= 60 ? 'Potential good fantasy player' : 'Role dependent';
    // Key-position players (193cm+ defenders and forwards) are a slower, lower-scoring build: one rung down.
    const keyPos = (r.line === 'DEF' || r.line === 'FWD') && (p.height_cm ?? 0) >= 193;
    if (keyPos) tier = tier === 'Potential fantasy star' ? 'Potential great fantasy player' : tier === 'Potential great fantasy player' ? 'Potential good fantasy player' : tier;
    if (cg <= 20 && pickN <= 20 && (tier === 'Potential good fantasy player' || tier === 'Role dependent')) tier = 'Potential great fantasy player';
    if (cg < 10) {
      // A high pick who hasn't played much: too early. Anyone else with a handful of games (mid-season and rookie
      // picks, or players who got hurt early) is an unknown quantity.
      if (pickN <= 20) { extra.push(tier); return out('Too early to tell'); }
      return out('Unknown quantity');
    }
    if (cg <= 20) extra.push('Too early to tell');
    if (avg < 70 && tier !== 'Role dependent' && cg > 20 && !(g <= 16 && avg >= 65)) extra.push('Role dependent');
    return out(tier);
  }
  if (bounce && age < 30) return out('Bounce-back candidate');
  if (adjMid >= 90) return out('Great fantasy player');
  if (adjMid >= 80) return out('Reliable starter');
  if (adjMid >= 70) return out('Depth piece');
  return out('Role dependent');
}

/**
 * Four-part scouting note: how he plays, where he's heading, what he scores, and the real-world outlook.
 * Hand-written notes (lib/notes.ts) take over the outlook for players with off-field, trade or role news.
 */
export function scoutingReport(p: PlayerRow, r: Ratings, attrs: Attr[] | undefined): Report {
  const b = p.box;
  const a = age(p.birth_date);
  const first = (p.full_name ?? p.name).split(' ')[0];
  const seed = p.id * 7 + p.name.length * 13;
  const by = new Map((attrs ?? []).map((x) => [x.key, x.value]));
  const v = (k: string) => by.get(k) ?? 0;
  const tags: string[] = [];
  const note = noteFor(p.name, p.afl_club);
  const hist = (p.hist ?? []).filter((h) => h[1] > 0);
  const full = hist.filter((h) => h[1] >= 5);
  const cg = p.career_games ?? 0;
  const pk = p.draft_pick && p.draft_pick <= 40 ? p.draft_pick : null;

  // ---- play style
  let style: string;
  if (!b || n(b.gm) === 0) {
    style = cg
      ? `${first} didn’t play an AFL game in 2026, so there’s no current box score to read. He has ${cg} career games to go on.`
      : `${first} is yet to debut at AFL level, so his game is still a projection rather than a record.`;
  } else {
    const disp = n(b.k) + n(b.h);
    const role = roleOf(p, b, v);
    const strengths = (attrs ?? []).filter((x) => x.value >= 16 && x.key !== 'tog' && x.key !== 'cba').sort((x, y) => y.value - x.value).slice(0, 3).map((x) => x.label.toLowerCase());
    const weak = (attrs ?? []).filter((x) => x.value <= 5 && ['disp', 'cp', 't', 'm', 'k'].includes(x.key)).map((x) => x.label.toLowerCase());
    const ratio = n(b.h) ? n(b.k) / n(b.h) : 0;
    const foot = ratio >= 1.7 ? 'He’s a kick-first player' : ratio && ratio <= 1 ? 'He’s handball-heavy and plays in close' : null;
    const isRuck = /ruck/.test(role);
    style = `${first} is ${role}${p.height_cm ? ` (${p.height_cm}cm)` : ''}. `
      + (isRuck
        ? `He averaged ${f1(b.ho)} hitouts${b.rc ? ` and contested ${b.rc}% of the ruck contests` : ''}, with ${disp.toFixed(1)} disposals and ${f1(b.m)} marks around the ground`
        : `He averaged ${disp.toFixed(1)} disposals (${f1(b.k)} kicks, ${f1(b.h)} handballs), ${f1(b.m)} marks and ${f1(b.t)} tackles`)
      + (b.cl != null && n(b.cl) >= 2 ? `, plus ${f1(b.cl)} clearances a game` : '')
      + (n(b.g) >= 1 ? `, kicking ${f1(b.g)} goals a game` : '') + '. '
      + (strengths.length ? `${pick(['His standout tools are', 'He grades elite for', 'Where he separates himself:'], seed)} ${list(strengths)}. ` : '')
      + (foot && !isRuck ? `${foot}${b.de ? ` and hits ${b.de}% of his targets` : ''}. ` : '')
      + (weak.length && !isRuck ? `The gap in his game is ${list(weak)}.` : '');
    if (n(b.cba) >= 60 && !isRuck) tags.push('Centre bounce');
    if (v('cp') >= 16) tags.push('Contested beast');
    if (v('mg') >= 16) tags.push('Line breaker');
    if (v('def') >= 16) tags.push('Interceptor');
    if (v('fwd') >= 16) tags.push('Scoreboard');
    if (v('t') >= 17) tags.push('Pressure');
    if (n(b.ki) >= 15) tags.push('Kick-ins');
    if (isRuck) tags.push('Ruck');
  }

  // ---- potential
  const pot = r.potential;
  let potential: string;
  const draftLine = pk ? (pk === 1 ? `the No.1 pick in ${p.draft_year}` : `pick ${pk} in ${p.draft_year}`) : null;
  const last = full[full.length - 1], prev = full[full.length - 2];
  const jump = last && prev ? Math.round(last[2] - prev[2]) : null;
  const seasonNo = last ? hist.filter((h) => h[0] <= last[0]).length : 0;
  const vsNorm = last ? Math.round(last[2] - EXPECTED_BY_SEASON[Math.min(seasonNo, 5)]) : null;

  if (a == null) potential = 'Age data is missing, so potential can’t be graded yet.';
  else if (a <= 23 || seasonNo <= 2) {
    const parts: string[] = [];
    parts.push(`${first} is ${a}${draftLine ? `, ${draftLine}` : ''}${cg ? `, with ${cg} games` : ' and yet to debut'}.`);
    if (last && vsNorm != null) {
      parts.push(vsNorm >= 12 ? `Averaging ${Math.round(last[2])} in his ${ord(seasonNo)} season puts him ${vsNorm} points ahead of where players usually are at that stage${a >= 23 ? '. He came in as a mature-age player, though, so some of that is physical readiness rather than upside' : ', which is the clearest sign of a future premium'}.`
        : vsNorm >= 3 ? `His ${Math.round(last[2])} in his ${ord(seasonNo)} season is ahead of the usual curve for that stage.`
        : vsNorm >= -6 ? `His ${Math.round(last[2])} in his ${ord(seasonNo)} season is about where you’d expect for that stage.`
        : `His ${Math.round(last[2])} in his ${ord(seasonNo)} season is behind the usual curve for that stage.`);
    }
    if (jump != null && Math.abs(jump) >= 6) parts.push(jump > 0 ? `He went up ${jump} points on the year before, and that trajectory matters more than the raw number.` : `He went backwards by ${-jump} points, which needs explaining.`);
    if (!full.length && pk && pk <= 10) parts.push('The draft pedigree is doing the heavy lifting for now. It fades quickly if the games don’t come.');
    parts.push('{{VERDICT}}');
    potential = parts.join(' ');
    if (cg <= 10) tags.push('Rookie-keeper eligible');
  } else if (a <= 27) {
    potential = `At ${a}, ${first} is in his prime. ` + (r.value >= 85
      ? pick(['He’s already producing like a premium. Expect more of the same for four or five seasons.', 'This is peak-years output. Bank it and don’t overthink it.'], seed)
      : r.value >= 60 ? `${jump && jump > 5 ? `The ${jump}-point jump this year says there may be one more step in him. ` : ''}A solid contributor who isn’t likely to jump a tier from here.`
      : 'He hasn’t locked in a scoring role. At this age that tends to be who he is.');
  } else if (a <= 30) {
    potential = `${first} is ${a} and on the back end of his prime. ${r.value >= 80 ? 'Still elite, but his trade value is at its peak now and only goes down from here.' : 'Expect a gradual slide. Keep him for this season’s points, not the future.'}`;
  } else {
    potential = `At ${a}, ${first} is a short-term asset. ${r.value >= 80 ? 'He can still help win you a flag this year, but plan the succession now.' : 'He’s squad depth with a year or two left.'}`;
    tags.push('Ageing');
  }

  // ---- fantasy output
  let fantasy: string;
  const xs = played(p.last5);
  if (!p.average) fantasy = 'No fantasy scores in 2026.';
  else {
    const tier = p.average >= 110 ? 'a top-tier premium' : p.average >= 100 ? 'a premium' : p.average >= 90 ? 'a reliable scorer just below premium' : p.average >= 80 ? 'a solid starter' : p.average >= 70 ? 'a bench-level scorer' : (a ?? 30) <= 23 ? 'a developing scorer rather than a fantasy option yet' : 'not a fantasy option on these numbers';
    const ceiling = b?.mx ? ` His best was ${b.mx}.` : '';
    const ppm = b?.ppm ? (b.ppm >= 1.1 ? ` At ${b.ppm.toFixed(2)} points a minute he’s one of the most efficient scorers in the comp.` : b.ppm <= 0.75 ? ` His ${b.ppm.toFixed(2)} points a minute means he needs big time on ground to score.` : '') : '';
    const cons = r.consistency >= 15 ? 'He rarely has a bad day.' : r.consistency <= 6 ? 'His scores swing a lot week to week.' : '';
    const formNote = xs.length >= 3 ? (() => {
      const m = xs.reduce((s2, x) => s2 + x, 0) / xs.length;
      return m > p.average * 1.06 ? ` He finished the year hot (${Math.round(m)} over his last ${xs.length}).` : m < p.average * 0.94 ? ` He tailed off late (${Math.round(m)} over his last ${xs.length}).` : '';
    })() : '';
    const history = full.length >= 3 ? ` His last three seasons: ${full.slice(-3).map((h) => `${Math.round(h[2])} (’${String(h[0]).slice(2)})`).join(', ')}.` : '';
    fantasy = `${p.average.toFixed(1)} average from ${p.games ?? 0} games makes him ${tier}.${ceiling}${ppm} ${cons}${formNote}${history}`.replace(/\s+/g, ' ').trim();
    if (p.average >= 110) tags.unshift('Premium');
  }

  // ---- body & ceiling: injured or down on a recent big season
  let health: string | null = null;
  let bounce = false;
  {
    const s26 = hist.find((h) => h[0] === CURRENT_YEAR);
    const g26 = s26?.[1] ?? 0, a26 = s26?.[2] ?? 0;
    const prior = hist.filter((h) => h[0] >= CURRENT_YEAR - 2 && h[0] < CURRENT_YEAR && h[1] >= 8);
    let peak = prior.length ? prior.reduce((x, y) => (y[2] > x[2] ? y : x)) : null;
    const forced = FORCED_BOUNCE[p.name];
    const known = INJURY_2026[p.name] ?? forced;
    const yy = (y: number) => `’${String(y).slice(2)}`;
    const stillYoung = (a ?? 30) <= 31;
    const interrupted = !!known || g26 <= 18;
    const an = (x: number) => (/^(8|11|18)/.test(String(x)) ? 'an' : 'a');
    const gms = (g: number) => `${g} game${g === 1 ? '' : 's'}`;
    if (p.list_status) {
      health = null;
    } else if (forced || (peak && peak[2] >= 88 && interrupted && (a26 <= peak[2] - 10 || g26 <= 12))) {
      const fb = forced ? bounceBack(p) : null;
      if (fb) peak = fb.peak;
      if (!peak) throw new Error('unreachable');
      const pk = Math.round(peak[2]), cur = Math.round(a26);
      const what = g26 === 0 ? (known ? '' : `, but he didn’t play a game in ${CURRENT_YEAR}`)
        : g26 <= 12 ? `, but only managed ${gms(g26)} in ${CURRENT_YEAR} for ${an(cur)} ${cur} average`
        : known ? `, then dropped to ${cur} from ${gms(g26)} in ${CURRENT_YEAR}` : `, but an interrupted ${CURRENT_YEAR} dragged him down to ${cur} from ${gms(g26)}`;
      const level = peak[2] >= 100 ? 'a premium' : peak[2] >= 92 ? 'a 90-plus scorer' : 'a strong scorer';
      health = `${known ? `${known}. ` : ''}${first} averaged ${pk} in ${yy(peak[0])}${what}. `
        + (stillYoung
          ? (g26 === 0 ? `Missing a season doesn’t change what he is. He has proven he can score big, and if the body gets right he’s ${level} again.` : pick([
            `Don’t read the ${CURRENT_YEAR} number as his true level. He has proven he can score big, and if the body gets right he’s ${level} again.`,
            `The ceiling hasn’t gone anywhere. Get the body right and he can score big again, back to ${level}.`,
            `Judge him on the ${pk}, not the ${CURRENT_YEAR} number. If he gets a clean preseason he can score big again, and he’s ${level} when fit.`,
          ], seed)) + ' That makes him a buy-low target, as long as you price in the injury risk.'
          : `At ${a}, getting all the way back there is a big ask, but a clean run could still see him well above his ${CURRENT_YEAR} output.`);
      bounce = stillYoung;
      const bb = bounceBack(p);
      if (bb) health += ` The 2027 projection uses a blended ${Math.round(bb.blended)} rather than his ${CURRENT_YEAR} average.`;
      tags.unshift(stillYoung ? 'Bounce-back' : 'Injury-hit');
    } else if (a26 >= 95 && g26 > 0 && (g26 <= 16 || known)) {
      health = `${known ? `${known}. ` : ''}${first} played only ${gms(g26)} in ${CURRENT_YEAR} but averaged ${Math.round(a26)} when he was out there. The scoring is premium. The only question is the body: a full season out of him and he’s among the top scorers in the comp.`;
      tags.push('Injury-hit');
    } else if (known) {
      health = `${known}. ${g26 ? `He still got through ${gms(g26)} for ${an(Math.round(a26))} ${Math.round(a26)} average` : 'There’s no 2026 form to go on'}, so judge him on a clean run in 2027 before writing anything off.`;
      tags.push('Injury-hit');
    } else if (peak && peak[2] >= 95 && g26 >= 19 && a26 <= peak[2] - 12 && stillYoung) {
      health = `Form dip: ${first} played ${gms(g26)} but fell from ${Math.round(peak[2])} in ${yy(peak[0])} to ${Math.round(a26)}. The ceiling is proven. If his role swings back his way, the scoring should follow.`;
    }
  }

  // ---- positional value
  const LNAME: Record<string, [string, string]> = { FWD: ['forward', 'forwards'], DEF: ['defender', 'defenders'], RUC: ['ruck', 'rucks'], MID: ['midfielder', 'midfielders'] };
  const [one, many] = LNAME[r.line];
  let position: string | null = null;
  if (p.average && (r.line !== 'MID' || p.positions.length > 1) && (r.lineRank <= 15 || r.statusRisk)) {
    const parts: string[] = [];
    parts.push(`Valued as a ${one}: he’s the No.${r.lineRank} ${one} in the league by average, ${r.lineEdge >= 0 ? `${r.lineEdge.toFixed(1)} points better than` : `${Math.abs(r.lineEdge).toFixed(1)} points short of`} a typical starting ${one}.`);
    if (r.line === 'FWD') parts.push('Forwards are the hardest line to fill in this format, because the scoring drops away fast after the top ten. That scarcity is why his value stars sit higher than his raw average would suggest.');
    else if (r.line === 'DEF') parts.push('Premium defenders are rarer than premium midfielders, so his average goes further on the back line.');
    else if (r.line === 'RUC') parts.push('There’s only one ruck slot, so the gap between a top ruck and the rest is worth a lot each week.');
    if (r.statusRisk) {
      parts.push(`Status watch: he attended ${b?.cba ?? 0}% of centre bounces in 2026, which is midfielder territory. There’s a real chance he loses ${one} status at the next position update. Until it changes, he’s valued as a ${one}, and a premium one, but price the risk into any trade.`);
      tags.unshift('Status risk');
    } else if (r.line !== 'MID' && p.positions.includes('MID')) {
      parts.push(`His role (${b?.cba ?? 0}% of centre bounces) means the ${one} status looks safe.`);
    }
    if (r.line !== 'MID' && r.lineRank <= 10) tags.splice(r.statusRisk ? 1 : 0, 0, `Top-10 ${r.line}`);
    position = parts.join(' ');
  }

  // ---- outlook
  const { verdict, extra } = verdictFor(p, r, a, bounce);
  const VERDICT_LINE: Partial<Record<Verdict, string>> = {
    'Fantasy star': 'Verdict: already a fantasy star.', 'Fantasy gun': 'Verdict: already a fantasy gun.',
    'Potential fantasy star': 'Verdict: a potential fantasy star.', 'Potential great fantasy player': 'Verdict: a potential great fantasy player.',
    'Potential good fantasy player': 'Verdict: a potential good fantasy player.', 'Too early to tell': 'Verdict: too early to tell.', 'Unknown quantity': 'Verdict: an unknown quantity.',
    'Role dependent': 'Verdict: role dependent for now.', 'Bounce-back candidate': 'Verdict: a bounce-back candidate.',
  };
  potential = potential.replace('{{VERDICT}}', VERDICT_LINE[verdict] ?? 'Verdict: a long-range bet that needs a bigger role.');
  let outlook: string;
  if (note) outlook = note.outlook;
  else {
    const map: Record<Verdict, string> = {
      'Fantasy star': `${first} is a fantasy star, one of the handful of players who can win you a week on his own. Build around him.`,
      'Fantasy gun': `${first} is a fantasy gun: a 100-plus scorer (or the positional equivalent) you lock in every week. He’s not quite in the top handful, but he’s close.`,
      'Great fantasy player': `${first} is a great fantasy player: a 90-plus scorer who carries a starting spot every week. Not a gun, but the kind of player good teams are built on.`,
      'Reliable starter': `${first} is a reliable starter. He’s unlikely to win you a week on his own, but he rarely costs you one either.`,
      'Depth piece': `${first} is a depth piece: fine cover through the byes and injuries, but not someone to build around.`,
      'Role dependent': `${first}’s scoring depends on his role, and right now it isn’t a scoring one. A move on-ball, or a teammate leaving, could change that.`,
      'Win-now asset': `${first} is a win-now piece. He’s worth plenty this season and less every season after. Keep him if you’re chasing the flag and sell him if you’re not.`,
      'Sell now': `${first}’s value only goes one way from here. If anyone still pays for his name, now is the time to move him.`,
      'Bounce-back candidate': `${first} is a bounce-back candidate. His ${CURRENT_YEAR} average undersells him because of time out of the side. Bet on a clean preseason and he’s worth well more than his current price.`,
      'Unknown quantity': `${first} is an unknown quantity. He’s only had a handful of AFL games, so there’s not enough to judge either way. Cheap to hold while you find out.`,
      'Too early to tell': `${first} hasn’t played enough AFL footy to judge yet. Hold him while you find out, especially if he came in high in the draft.`,
      'Potential fantasy star': `${first} is tracking like a future premium. The numbers for his age and stage are rare, and the role to go with them is already there. Hold him.`,
      'Potential great fantasy player': `${first} has the profile to become a 90-plus scorer. The scoring curve is going the right way. What decides it is whether his club gives him more midfield minutes.`,
      'Potential good fantasy player': `${first} looks like he can become a solid scorer. He may not reach premium, but there’s a useful player in there if the role grows.`,
    };
    outlook = map[verdict];
  }

  return { style, potential, fantasy, health, outlook, position, verdict, extra, tags: [...new Set(tags)].slice(0, 5) };
}
