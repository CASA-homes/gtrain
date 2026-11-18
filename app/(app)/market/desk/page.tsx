import Link from 'next/link';
import { TeamBadge } from '@/components/bits';
import { getLeague, getMe } from '@/lib/data';
import { C } from '@/lib/ratings';
import { createClient } from '@/lib/supabase/server';
import { openDesk, startTrade } from './actions';

const STATUS: Record<string, [string, string, string]> = {
  open: ['Open', C.green2, C.ink],
  agreed: ['Agreed', C.green4, '#fff'],
  done: ['Done', C.green5, '#fff'],
  vetoed: ['Vetoed', C.redBg, C.redFg],
  closed: ['Closed', C.empty, C.muted],
};

export default async function DeskList({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  const supabase = await createClient();
  const { data: desks } = await supabase.from('desks').select('*, desk_teams(team_id, accepted), desk_items(id)').order('created_at', { ascending: false }).limit(40);
  const team = (id: number) => league.teams.find((t) => t.id === id)!;
  const myId = me && !me.is_guest ? me.team_id : -1;
  const liveAll = (desks ?? []).filter((d) => d.status === 'open' || d.status === 'agreed');
  const mine = liveAll.filter((d) => ((d.desk_teams ?? []) as { team_id: number }[]).some((t) => t.team_id === myId));
  const live = liveAll.filter((d) => !mine.includes(d));
  const past = (desks ?? []).filter((d) => !(d.status === 'open' || d.status === 'agreed')).slice(0, 10);

  const card = (d: NonNullable<typeof desks>[number]) => {
    const parts = (d.desk_teams ?? []) as { team_id: number; accepted: boolean }[];
    const [label, bg, fg] = STATUS[d.status] ?? STATUS.open;
    return (
      <Link key={d.id} href={`/market/desk/${d.id}`} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, color: 'inherit', textDecoration: 'none' }}>
        <div className="row-between" style={{ alignItems: 'flex-start', gap: 10 }}>
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {(() => { const ps = ((d.desk_teams ?? []) as { team_id: number }[]).map((x) => x.team_id); const other = ps.filter((x) => x !== myId);
              return ps.includes(myId) && other.length === 1
                ? <><span className="eyebrow">Trade</span><b style={{ font: '600 18px/1.2 var(--font)' }}>With {team(other[0]).name}</b></>
                : <><span className="eyebrow">{team(d.team_id).name}</span><b style={{ font: '600 18px/1.2 var(--font)' }}>{d.title}</b></>; })()}
          </span>
          <span className="pill" style={{ background: bg, color: fg, padding: '3px 10px' }}>{label}</span>
        </div>
        <div className="row-between" style={{ alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', gap: 4 }}>
            {parts.map((p) => (
              <span key={p.team_id} title={`${team(p.team_id).name}${p.accepted ? ' · accepted' : ''}`} style={{ position: 'relative' }}>
                <TeamBadge code={team(p.team_id).short_code} logo={team(p.team_id).logo_url} size={24} />
                {p.accepted && <span aria-hidden="true" style={{ position: 'absolute', right: -3, bottom: -3, width: 11, height: 11, borderRadius: 99, background: C.green5, border: '2px solid #fff' }} />}
              </span>
            ))}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>{parts.length} team{parts.length === 1 ? '' : 's'} · {(d.desk_items ?? []).length} assets</span>
        </div>
      </Link>
    );
  };

  return (
    <div className="wrap" style={{ maxWidth: 1180 }}>
      <span className="mono muted" style={{ fontSize: 12 }}><Link href="/market">Trademarket</Link> / Trade desk</span>
      <div>
        <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>Make a trade</h1>
        <p className="muted" style={{ margin: '4px 0 0', maxWidth: '72ch' }}>
          Pick a club, put players, picks or KT on each side, then put it forward. They can accept, counter or decline.
          Once both clubs accept, the commish approves and everything moves at once. Add a third club from inside the trade.
        </p>
      </div>

      {error && <div role="alert" className="card" style={{ padding: '10px 14px', background: C.redBg, color: C.redFg, border: 0 }}>{error}</div>}

      {me && !me.is_guest && (
        <form action={startTrade} className="card" style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, flex: '1 1 260px' }} className="muted">
            Trade with
            <select name="with" className="input" required defaultValue="">
              <option value="" disabled>Choose a club…</option>
              {league.teams.filter((t) => t.id !== myId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <button className="btn dark">Start a trade</button>
        </form>
      )}

      {mine.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="h2">Your trades <span className="muted" style={{ fontWeight: 400 }}>{mine.length}</span></h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>{mine.map(card)}</div>
        </section>
      )}

      {me && (
        <details className="card" style={{ padding: 14 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Or post what you’re after and let any club join</summary>
        <form action={openDesk} className="card" style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }} className="muted">
            What do you want?
            <input name="title" className="input" required minLength={3} maxLength={140} placeholder="e.g. Pick 8 in 2027" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }} className="muted">
            What can you put up? (optional)
            <input name="details" className="input" maxLength={1000} placeholder="e.g. Picks 14 + 31, open to moving a forward" />
          </label>
          <button className="btn dark" style={{ justifySelf: 'start' }}>Open a desk</button>
        </form>
        </details>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 className="h2">Other open trades <span className="muted" style={{ fontWeight: 400 }}>{live.length}</span></h2>
        {live.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>{live.map(card)}</div>
          : <p className="muted" style={{ margin: 0 }}>No other trades open.</p>}
      </section>
      {past.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="h2">Recent</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>{past.map(card)}</div>
        </section>
      )}
    </div>
  );
}
