// A short, plain-English summary for the top of a player page: who he is, what he does on the ground, and where
// his fantasy scoring is heading. Built from his 2026 box score, career averages, age and the 2027 projection.
import type { PlayerRow } from '@/lib/ratings';
import { age } from '@/lib/ratings';
import { CLUBS } from '@/lib/clubs';
import { projected2027 } from '@/lib/projection';

const NICK: Record<string, string> = {
  ADE: 'Crows', BRL: 'Lions', CAR: 'Blues', COL: 'Magpies', ESS: 'Bombers', FRE: 'Dockers', GEE: 'Cats', GCS: 'Suns', GWS: 'Giants',
  HAW: 'Hawks', MEL: 'Demons', NTH: 'Kangaroos', PTA: 'Power', RIC: 'Tigers', STK: 'Saints', SYD: 'Swans', WCE: 'Eagles', WBD: 'Bulldogs',
};

function role(p: PlayerRow): { label: string; area: string } {
  const b = p.box ?? {}, gm = Math.max(1, b.gm ?? p.games ?? 1), h = p.height_cm ?? 0;
  const kiPg = (b.ki ?? 0) / gm, pos = p.positions;
  if (pos.includes('RUC') || (b.ho ?? 0) >= 15) return { label: (b.cba ?? 0) >= 50 ? 'number-one ruck' : 'ruck who splits time forward', area: 'through the ruck' };
  if (pos[0] === 'DEF') {
    if (kiPg >= 1.8) return { label: 'half-back who takes the kick-ins', area: 'across half-back' };
    if (h >= 192) return { label: 'key defender', area: 'in defence' };
    if ((b.it ?? 0) >= 5) return { label: 'intercepting defender', area: 'across half-back' };
    if ((b.r5 ?? 0) >= 3.5) return { label: 'rebounding half-back', area: 'off half-back' };
    return { label: 'small defender', area: 'in defence' };
  }
  if (pos[0] === 'MID') {
    if ((b.cba ?? 0) >= 60) return { label: 'inside midfielder who lives at the centre bounces', area: 'in the middle' };
    if ((b.cba ?? 0) >= 25) return { label: 'midfielder who rotates between the centre and a wing', area: 'in the midfield' };
    if ((b.g ?? 0) >= 1) return { label: 'half-forward who pushes up the ground', area: 'between the arcs' };
    return { label: 'outside midfielder', area: 'on the wing' };
  }
  if (h >= 192 && (b.g ?? 0) >= 1.3) return { label: 'key forward', area: 'up forward' };
  if ((b.g ?? 0) >= 1.5) return { label: 'goalkicking forward', area: 'up forward' };
  if ((b.t ?? 0) >= 4) return { label: 'pressure forward', area: 'inside 50' };
  return { label: 'forward', area: 'up forward' };
}

export function playerSummary(p: PlayerRow): string[] {
  const a = age(p.birth_date);
  const club = p.afl_club ? CLUBS[p.afl_club]?.name ?? p.afl_club : null;
  const nick = p.afl_club ? NICK[p.afl_club] ?? club : null;
  const r = role(p);
  const dpp = p.positions.length > 1 ? ` (${p.positions.join('/')} in fantasy)` : '';
  const lines: string[] = [];
  lines.push(`${a != null ? `${a}-year-old ` : ''}${r.label}${club ? ` for ${club}` : ''}${dpp}.`.replace(/^./, (c) => c.toUpperCase()));

  // Scoring trend across his last three seasons with 5+ games.
  const hist = [...(p.hist ?? [])].filter((h) => h[1] >= 5).sort((x, y) => x[0] - y[0]).slice(-3);
  const avgs = hist.map((h) => Math.round(h[2]));
  const last = avgs[avgs.length - 1], prev = avgs[avgs.length - 2];
  const rising = avgs.length >= 3 && avgs[0] < avgs[1] && avgs[1] < avgs[2];
  const falling = avgs.length >= 3 && avgs[0] > avgs[1] && avgs[1] > avgs[2];
  if (rising) lines.push(`His average has gone up every year: ${avgs.join(', ')}.`);
  else if (falling) lines.push(`His average has slid each year: ${avgs.join(', ')}.`);
  else if (last != null && prev != null && Math.abs(last - prev) >= 8) lines.push(`${last > prev ? 'Jumped' : 'Dropped'} from ${prev} to ${last} last season.`);
  else if (last != null) lines.push(`Averaged ${last} last season${p.games ? ` across ${p.games} games` : ''}.`);

  // Outlook
  const proj = Math.round(projected2027(p) || 0);
  const grow = rising || (last != null && prev != null && last > prev);
  let out: string;
  if (a != null && a <= 24 && (last ?? 0) >= 105) out = `Already a premium at ${a} and still improving: the ceiling isn’t in sight yet.`;
  else if (a != null && a <= 23) out = grow ? `Looming as ${nick ? `the ${nick}’` : 'his club’s'} main ball-winner ${r.area}, and still growing every year.` : `Still young: more time ${r.area} should lift his output.`;
  else if (a != null && a <= 28) out = grow ? `Entering his prime and trending up: a bankable scorer ${r.area}.` : (last ?? 0) >= 100 ? 'In his prime and a reliable premium.' : `In his prime; his role ${r.area} sets his ceiling more than his age does.`;
  else if (a != null && a <= 31) out = (last ?? 0) >= 100 ? 'Still elite, but the age curve is coming: enjoy the next season or two.' : 'On the back nine: expect a steady fade from here.';
  else out = 'Late career: valuable week to week, but a one-year proposition.';
  lines.push(`${out}${proj ? ` We project ${proj} for 2027.` : ''}`);
  return lines;
}
