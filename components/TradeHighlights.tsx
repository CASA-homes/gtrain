import Link from 'next/link';
import { CLUBS } from '@/lib/clubs';
import { photoUrl } from '@/lib/photos';
import type { PlayerRow } from '@/lib/ratings';
import type { Trade } from '@/lib/trades-2026';

/** Round headshot with a club-colour ring. Falls back to initials when the player isn't on a G-Train list. */
export function Face({ p, label, size = 36 }: { p: Pick<PlayerRow, 'afl_club' | 'photo_path' | 'dfs_id'> | null; label: string; size?: number }) {
  const club = p?.afl_club ? CLUBS[p.afl_club] : null;
  const src = p ? photoUrl(p) : null;
  const ring = club ? (club.m ? `conic-gradient(${club.a} 0 45%, ${club.m} 45% 55%, ${club.b} 55% 100%)` : `conic-gradient(${club.a} 0 50%, ${club.b} 50% 100%)`) : '#d9ddd6';
  const initials = label.split(' ').map((w) => w[0]).join('').slice(0, 2);
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', padding: 2, background: ring, flex: 'none', display: 'inline-block' }}>
      <span style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: '#e8eee5', font: '600 11px var(--font)', color: 'var(--muted)' }}>
        {src
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
          : initials}
      </span>
    </span>
  );
}

/** "Hugo Garcia" → the rostered player named "H. Garcia", preferring one on a team in this trade. */
function finder(players: PlayerRow[], teamIdByName: Map<string, number>) {
  return (full: string, teams: string[]) => {
    const parts = full.split(' ');
    const short = `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
    const hits = players.filter((p) => p.full_name === full || p.name === short);
    const ids = teams.map((t) => teamIdByName.get(t));
    return hits.find((p) => ids.includes(p.team_id)) ?? hits[0] ?? null;
  };
}

const isPick = (s: string) => /^Pick \d+$/.test(s) || /Rnd '\d\d$/.test(s);
const pickLabel = (s: string) => {
  const m = s.match(/^Pick (\d+)$/);
  if (m) return { yr: '2027', txt: `Pick ${m[1]}` };
  const r = s.match(/^(\d+)\w\w Rnd '(\d\d)$/);
  return { yr: r ? `20${r[2]}` : '', txt: r ? `Round ${r[1]}` : s };
};

export function TradeHighlights({ trades, players, teams }: { trades: Trade[]; players: PlayerRow[]; teams: { id: number; name: string }[] }) {
  const teamIdByName = new Map(teams.map((t) => [t.name, t.id]));
  const find = finder(players, teamIdByName);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 720, overflowY: 'auto', paddingRight: 4 }}>
      {trades.map((t, i) => {
        const names = t.sides.map((s) => s.team);
        return (
          <article key={i} className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="mono muted" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }}>{t.date}</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'start' }}>
              {t.sides.map((s, si) => (
                <div key={s.team} style={{ display: 'contents' }}>
                  {si === 1 && <span aria-label="for" style={{ alignSelf: 'center', font: '600 16px var(--font)', color: 'var(--g5)' }}>⇄</span>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                    <span style={{ font: '600 12px var(--font)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <Link href={`/clubhouse/${teamIdByName.get(s.team) ?? ''}`} style={{ color: 'inherit', textDecoration: 'none' }}>{s.team}</Link>
                      <span className="muted" style={{ fontWeight: 400 }}> gave</span>
                    </span>
                    {s.gives.map((g) => {
                      if (isPick(g)) {
                        const pk = pickLabel(g);
                        return (
                          <span key={g} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--ink)', color: 'var(--cream)', display: 'grid', placeItems: 'center', font: '600 9px var(--mono)', flex: 'none' }}>{pk.yr.slice(2)}</span>
                            <span><b>{pk.txt}</b> <span className="muted">{pk.yr}</span></span>
                          </span>
                        );
                      }
                      const p = find(g, names);
                      const body = (
                        <>
                          <Face p={p} label={g} size={28} />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{g}</span>
                        </>
                      );
                      return p
                        ? <Link key={g} href={`/players/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'inherit', textDecoration: 'none', minWidth: 0 }}>{body}</Link>
                        : <span key={g} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 0 }}>{body}</span>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}
