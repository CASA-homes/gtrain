// Clubhouse: the club's star player and its best young player (21 and under), each as a feature card with photo,
// core numbers and a short case for why he's the one.
import Link from 'next/link';
import type { PlayerRow } from '@/lib/ratings';
import { age } from '@/lib/ratings';
import { photoUrl } from '@/lib/photos';
import { CLUBS } from '@/lib/clubs';
import { playerSummary } from '@/lib/player-summary';

const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const firstSentences = (s: string, n: number) => (s.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [s]).slice(0, n).join('').trim();

interface Pick { p: PlayerRow; kind: 'star' | 'rising' }

/** The squad's best player (highest 2026 average, 8+ games) and best player aged 21 or under (falls back to 23). */
export function pickHighlights(players: PlayerRow[]): Pick[] {
  const ok = players.filter((p) => !p.list_status && p.average != null && (p.games ?? 0) >= 8);
  const star = [...ok].sort((a, b) => (b.average ?? 0) - (a.average ?? 0))[0];
  const young = (max: number) => ok.filter((p) => p !== star && (age(p.birth_date) ?? 99) <= max).sort((a, b) => (b.average ?? 0) - (a.average ?? 0))[0];
  const rising = young(21) ?? young(23);
  return [...(star ? [{ p: star, kind: 'star' as const }] : []), ...(rising ? [{ p: rising, kind: 'rising' as const }] : [])];
}

export function PlayerHighlights({ players, all, clubName }: { players: PlayerRow[]; all: PlayerRow[]; clubName: string }) {
  const picks = pickHighlights(players);
  if (!picks.length) return null;
  const ranked = all.filter((p) => (p.games ?? 0) >= 10 && p.average != null).sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  const compRank = (p: PlayerRow) => { const i = ranked.findIndex((x) => x.id === p.id); return i >= 0 ? i + 1 : null; };
  return (
    <section className="hl-hl" aria-label="Player highlights">
      <div className="row-between" style={{ alignItems: 'baseline' }}>
        <h2 className="h2">Player highlights</h2>
        <span className="muted" style={{ fontSize: 12 }}>2026 season</span>
      </div>
      {picks.map(({ p, kind }) => {
        const club = p.afl_club ? CLUBS[p.afl_club] : undefined;
        const img = photoUrl(p);
        const a = age(p.birth_date);
        const r = compRank(p);
        const sorted = [...players].filter((x) => x.average != null && (x.games ?? 0) >= 8).sort((x, y) => (y.average ?? 0) - (x.average ?? 0));
        const clubRank = sorted.findIndex((x) => x.id === p.id) + 1;
        const tons = (p.games_log ?? []).filter((g) => (g[1] ?? 0) >= 100).length;
        const why = kind === 'star'
          ? `${clubName}’s top scorer at ${p.average!.toFixed(1)} a game${r ? `, ${ord(r)} in the whole competition` : ''}${tons ? ` with ${tons} ton${tons > 1 ? 's' : ''}` : ''}.`
          : `Best of the club’s young brigade: ${p.average!.toFixed(1)} a game at ${a ?? '?'}${clubRank ? `, already ${ord(clubRank)} at the club` : ''}.`;
        const note = firstSentences(playerSummary(p, { rank: r })[0] ?? '', 2);
        return (
          <Link key={p.id} href={`/players/${p.id}`} className={`hl-card ${kind}`}>
            <div className="hl-photo" style={{ ['--c1' as string]: club?.a ?? '#1c3c63', ['--c2' as string]: club?.m ?? club?.b ?? '#2c5236' }}>
              <span className="hl-tag">{kind === 'star' ? 'Star player' : 'Rising star'}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {img ? <img src={img} alt="" loading="lazy" /> : <b className="hl-ini">{(p.full_name ?? p.name).split(' ').map((w) => w[0]).slice(0, 2).join('')}</b>}
            </div>
            <dl className="hl-stats">
              <div className="hl-name"><dt className="sr-only">Player</dt><dd>{p.full_name ?? p.name}<small>{club?.name ?? p.afl_club ?? ''}</small></dd></div>
              <div className="hl-avg"><dt><span className="hl-dl">2026 average</span><span className="hl-ds">Avg</span></dt><dd>{p.average!.toFixed(1)}</dd></div>
              <div><dt><span className="hl-dl">Games</span><span className="hl-ds">Gms</span></dt><dd>{p.games ?? '–'}</dd></div>
              <div><dt>Age</dt><dd>{a ?? '–'}</dd></div>
              <div><dt>Pos</dt><dd>{p.positions.join('/')}</dd></div>
            </dl>
            <div className="hl-why">
              <span className="hl-k">{kind === 'star' ? 'Why he’s the best' : 'Why he’s the one to watch'}</span>
              <p><b>{why}</b> <span className="hl-note">{note}</span></p>
            </div>
          </Link>
        );
      })}
    </section>
  );
}
