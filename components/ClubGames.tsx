'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Face } from '@/components/TradeHighlights';
import type { ClubGamesRow } from '@/lib/club-games';
import { saveClubGames } from '@/app/(app)/clubhouse/[id]/club-games-actions';

const SEASONS = [2022, 2023, 2024, 2025, 2026];

/** Games played for this club, all-time, with a quick way for the club to add past seasons. */
export function ClubGames({ rows, teamId, editable, current, links, tableReady }: {
  rows: ClubGamesRow[]; teamId: number; editable: boolean; current: string[]; tableReady: boolean;
  links: Record<string, { id: number; afl_club: string | null; photo_path: string | null; dfs_id: string | null }>;
}) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const shown = all ? rows : rows.slice(0, 12);
  const onList = new Set(current);
  const missing = SEASONS.slice(0, 4).filter((s) => !rows.some((r) => r.bySeason[s] != null));
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
        <h2 className="h2">Games for the club</h2>
        <span className="muted" style={{ fontSize: 12 }}>All-time · {missing.length ? `${missing.join(', ')} still to add` : '2022–2026'}</span>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="cg-row cg-head">
          <span>#</span><span>Player</span>{SEASONS.map((s) => <span key={s} className="cg-yr">’{String(s).slice(2)}</span>)}<span className="cg-tot">Total</span>
        </div>
        {shown.map((r, i) => (
          <div key={r.key} className="cg-row" style={{ opacity: onList.has(r.key) ? 1 : 0.6 }}>
            <span className="mono muted">{i + 1}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Face p={links[r.key] ?? (r.dfs ? { afl_club: null, photo_path: null, dfs_id: r.dfs } : null)} label={r.name} size={26} />
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {links[r.key] ? <Link href={`/players/${links[r.key].id}`} style={{ color: 'inherit', fontWeight: 600 }}>{r.name}</Link> : <b style={{ fontWeight: 600 }}>{r.name}</b>}
                {!onList.has(r.key) && <span className="muted" style={{ fontSize: 10, marginLeft: 5 }}>gone</span>}
              </span>
            </span>
            {SEASONS.map((s) => <span key={s} className="cg-yr mono">{r.bySeason[s] ?? <span className="muted">·</span>}</span>)}
            <span className="cg-tot mono">{r.total}</span>
          </div>
        ))}
        {!rows.length && <div className="muted" style={{ padding: '12px 14px', fontSize: 13 }}>No games recorded yet.</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {rows.length > 12 && <button type="button" className="btn" onClick={() => setAll(!all)} style={{ fontSize: 12 }}>{all ? 'Top 12' : `Show all ${rows.length}`}</button>}
        {editable && <button type="button" className="btn" onClick={() => setOpen(!open)} style={{ fontSize: 12 }}>{open ? 'Close' : 'Add past seasons'}</button>}
        <span className="muted" style={{ fontSize: 11 }}>2026 counted from Keeper lineups: a game counts when he was on your list and played. Faded = no longer on the list.</span>
      </div>
      {editable && open && (
        <form className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
          action={(fd) => start(async () => {
            const res = await saveClubGames(teamId, fd);
            if ('error' in res && res.error) setMsg({ text: res.error, bad: true });
            else { setMsg({ text: `Saved ${res.saved} player${res.saved === 1 ? '' : 's'}${res.skipped?.length ? `; couldn’t read ${res.skipped.length} line(s)` : ''}.` }); router.refresh(); }
          })}>
          {!tableReady && <span style={{ fontSize: 12, color: '#b4532a' }}>Heads up: the history table isn’t switched on yet, so saving won’t work until the commish runs the setup.</span>}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="eyebrow">Season</span>
            <select name="season" className="input" defaultValue="2025">{SEASONS.slice(0, 4).reverse().map((s) => <option key={s}>{s}</option>)}</select></label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="eyebrow">One player per line: name, games</span>
            <textarea name="lines" rows={7} className="input" style={{ fontFamily: 'var(--mono)', fontSize: 13, padding: 10, minHeight: 140 }} placeholder={'Bailey Smith, 22\nNoah Anderson, 21\nJ. Dunkley 1'} /></label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="submit" className="btn dark" disabled={pending}>{pending ? 'Saving…' : 'Save season'}</button>
            {msg && <span role="status" style={{ fontSize: 12, color: msg.bad ? '#b4532a' : 'var(--g5)' }}>{msg.text}</span>}
          </div>
          <span className="muted" style={{ fontSize: 11 }}>Saving a player again for the same season replaces his number. Full names or “B. Smith” both work.</span>
        </form>
      )}
    </section>
  );
}
