// A short, personal summary for the top of a player page: who he is, his story right now, and the question
// hanging over his footy. Built from his career averages, 2026 games, age, draft path, trade moves and known injuries.
import type { PlayerRow } from '@/lib/ratings';
import { age } from '@/lib/ratings';
import { CLUBS } from '@/lib/clubs';
import { INJURY_2026 } from '@/lib/injury';

const NICK: Record<string, string> = {
  ADE: 'Crows', BRL: 'Lions', CAR: 'Blues', COL: 'Magpies', ESS: 'Bombers', FRE: 'Dockers', GEE: 'Cats', GCS: 'Suns', GWS: 'Giants',
  HAW: 'Hawks', MEL: 'Demons', NTH: 'Kangaroos', PTA: 'Power', RIC: 'Tigers', STK: 'Saints', SYD: 'Swans', WCE: 'Eagles', WBD: 'Bulldogs',
};
/** 2026 trade and free agency period (afl.com.au trade tracker): players.name → the club he left. */
export const MOVED_2026: Record<string, string> = {
  'L. Pedlar': 'ADE', 'K. Coleman': 'BRL', 'T. Rivers': 'MEL', 'J. Viney': 'MEL', 'L. Whitfield': 'GWS', 'N. Blakey': 'SYD', 'S. Marshall': 'BRL',
  'Z. Butters': 'PTA', 'R. Marshall': 'STK', 'J. Ridley': 'ESS', 'J. Bowes': 'GEE', "N. O'Driscoll": 'FRE', 'Z. Merrett': 'ESS',
  'S. Pendlebury': 'COL', 'L. Neale': 'BRL', 'K. Briggs': 'GWS', 'T. Greene': 'GWS',
};
const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const club = (c: string | null | undefined) => (c ? CLUBS[c]?.name ?? c : null);

function role(p: PlayerRow): { label: string; area: string } {
  if (!p.box || !(p.box.gm ?? 0)) return ({ DEF: { label: 'defender', area: 'in defence' }, MID: { label: 'midfielder', area: 'in the midfield' }, RUC: { label: 'ruck', area: 'around the stoppages' }, FWD: { label: 'forward', area: 'up forward' } } as Record<string, { label: string; area: string }>)[p.positions[0]] ?? { label: 'player', area: 'on the ground' };
  const b = p.box ?? {}, gm = Math.max(1, b.gm ?? p.games ?? 1), h = p.height_cm ?? 0;
  const kiPg = (b.ki ?? 0) / gm, pos = p.positions;
  if (pos.includes('RUC') || (b.ho ?? 0) >= 15) return { label: (b.cba ?? 0) >= 50 ? 'number-one ruck' : 'ruck who splits time forward', area: 'around the stoppages' };
  if (pos[0] === 'DEF') {
    if (kiPg >= 1.8) return { label: 'half-back who takes the kick-ins', area: 'across half-back' };
    if (h >= 192) return { label: 'key defender', area: 'in defence' };
    if ((b.it ?? 0) >= 5) return { label: 'intercepting defender', area: 'across half-back' };
    if ((b.r5 ?? 0) >= 3.5) return { label: 'rebounding half-back', area: 'off half-back' };
    return { label: 'small defender', area: 'in defence' };
  }
  if (pos[0] === 'MID') {
    if ((b.cba ?? 0) >= 60) return { label: 'inside midfielder', area: 'in the middle' };
    if ((b.cba ?? 0) >= 25) return { label: 'midfielder who rotates through the centre', area: 'in the midfield' };
    if ((b.g ?? 0) >= 1) return { label: 'half-forward who pushes up the ground', area: 'between the arcs' };
    return { label: 'outside midfielder', area: 'on the wing' };
  }
  if (h >= 192 && (b.g ?? 0) >= 1.3) return { label: 'key forward', area: 'up forward' };
  if ((b.g ?? 0) >= 1.5) return { label: 'goalkicking forward', area: 'up forward' };
  if ((b.t ?? 0) >= 4) return { label: 'pressure forward', area: 'inside 50' };
  return { label: 'forward', area: 'up forward' };
}

/** rank: where his 2026 average sits among every player with 10+ games (1 = highest). */
export function playerSummary(p: PlayerRow, ctx: { rank?: number | null } = {}): string[] {
  const a = age(p.birth_date);
  const r = role(p);
  const first = (p.full_name ?? p.name).split(' ')[0];
  const nick = p.afl_club ? NICK[p.afl_club] : null;
  const from = MOVED_2026[p.name];
  const hist = [...(p.hist ?? [])].filter((h) => h[1] > 0).sort((x, y) => x[0] - y[0]);
  const s26 = hist.find((h) => h[0] === 2026);
  const before = hist.filter((h) => h[0] < 2026 && h[1] >= 5);
  const prev = before[before.length - 1];
  const a26 = s26 ? Math.round(s26[2]) : null, g26 = s26?.[1] ?? 0;
  const pa = prev ? Math.round(prev[2]) : null;
  const seasons = hist.length;
  const draftAge = p.draft_year && p.birth_date ? p.draft_year - Number(p.birth_date.slice(0, 4)) : null;
  const mature = draftAge != null && draftAge >= 21;
  const peak = before.reduce<number>((m, h) => (h[1] >= 8 ? Math.max(m, h[2]) : m), 0);
  const rank = ctx.rank ?? null;

  // 1. Who he is
  const out: string[] = [];
  const who = `${a != null ? `${a}-year-old ` : ''}${r.label}`;
  if (from) out.push(`${who.replace(/^./, (c) => c.toUpperCase())}, now at ${club(p.afl_club)} after ${(a26 ?? 0) >= 95 ? 'one of the biggest moves of the trade period' : 'a trade-period move'} from ${club(from)}.`);
  else out.push(`${who.replace(/^./, (c) => c.toUpperCase())} for ${club(p.afl_club) ?? 'no AFL club'}.`);

  // 2. His story right now, and 3. the question over him
  let story = '', question = '';
  const injury = INJURY_2026[p.name];
  if (!s26 && peak >= 85) {
    story = `${injury ?? 'He missed all of 2026'}, a year after averaging ${pa ?? Math.round(peak)}.`;
    question = peak >= 100 ? `When he's right he's a genuine premium. Does the body hold up in 2027?` : 'Can he win his spot back and pick up where he left off?';
  } else if (s26 && injury && pa != null && a26 != null && a26 <= pa - 8) {
    story = `${injury}, and his average fell from ${pa} to ${a26}.`;
    question = pa >= 100 ? 'Back to full fitness, he is a premium again. Do you back him in?' : 'A clean run at it and he should bounce back.';
  } else if (s26 && g26 <= 14 && (prev?.[1] ?? 0) >= 15) {
    story = `${injury ? `${injury}: ` : 'An interrupted 2026: '}just ${g26} games${a26 ? ` at ${a26}` : ''}.`;
    question = (a26 ?? 0) >= 95 || peak >= 95 ? 'Fit, he is as good as anyone in his position. That is the whole question.' : 'A clean pre-season and he could be one of the value picks of the year.';
  } else if (rank === 1) {
    story = `Nobody in the competition scored more in 2026: ${a26} a game${g26 ? ` across ${g26} games` : ''}. Right now he is the best fantasy player in the game.`;
    question = 'Can he do it again with every tag in the league coming his way?';
  } else if (rank != null && rank <= 3) {
    story = `Finished ${ord(rank)} in the whole competition for points per game in 2026 (${a26}).`;
    question = 'A genuine contender for the top spot. Is this the year he takes it?';
  } else if (a26 != null && pa != null && a26 - pa >= 15) {
    story = seasons <= 2
      ? `A huge jump in just his second season${mature ? ' for a mature-age recruit' : ''}: from ${pa} to ${a26}.`
      : `A massive leap in 2026, from ${pa} to ${a26}.`;
    question = (a ?? 30) <= 25 ? 'Breakout or one-off? Another pre-season should tell us which.' : 'He has found a new level late. Can he hold it?';
  } else if (a26 != null && pa != null && a26 - pa >= 8 && (a ?? 30) <= 24) {
    story = `Took a real step up in 2026, from ${pa} to ${a26}.`;
    question = `Looming as the ${nick ?? 'club'}’ main ball-winner ${r.area}, and growing every year.`;
  } else if (rank != null && rank <= 10) {
    story = `A top-10 scorer in the competition last year (${a26}).`;
    question = (a ?? 0) >= 30 ? 'Still elite, but the clock is ticking. How long can he hold it off?' : 'Locked in as a premium for years to come.';
  } else if (a26 != null && pa != null && pa - a26 >= 12) {
    story = `Slipped from ${pa} to ${a26} in 2026.`;
    question = (a ?? 0) >= 29 ? 'Is this the start of the decline, or a blip?' : 'A role change or a down year? Worth watching in the pre-season.';
  } else if (a26 != null) {
    const streak = before.slice(-2).map((h) => Math.round(h[2]));
    const rising = streak.length === 2 && streak[0] < streak[1] && streak[1] < a26;
    story = rising ? `His average has gone up every year: ${[...streak, a26].join(', ')}.` : `Averaged ${a26} in 2026${g26 ? ` from ${g26} games` : ''}.`;
    if ((a ?? 30) <= 23) question = rising ? `Looming as the ${nick ?? 'club'}’ main ball-winner ${r.area}, and still growing every year.` : `Young enough that more time ${r.area} could change everything.`;
    else if ((a ?? 0) >= 31) question = 'On the back nine. How much is left in the tank?';
    else question = rising ? `${first} keeps getting better. Is there another step in him?` : `Rock solid ${r.area}: you know what you are getting.`;
  } else {
    story = 'No AFL games in 2026.';
    question = 'One to watch through the pre-season.';
  }
  if (from) question = `New club, new expectations. Can he deliver at the ${nick}?`;
  out.push(story, question);
  return out.filter(Boolean);
}
