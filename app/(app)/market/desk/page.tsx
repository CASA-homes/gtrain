import Link from 'next/link';
import { TeamBadge } from '@/components/bits';
import { getLeague, getMe } from '@/lib/data';
import { C } from '@/lib/ratings';
import { createClient } from '@/lib/supabase/server';
import { openDesk } from './actions';

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
  const live = (desks ?? []).filter((d) => d.status === 'open' || d.status === 'agreed');
  const past = (desks ?? []).filter((d) => !(d.status === 'open' || d.status === 'agreed')).slice(0, 10);

  const card = (d: NonNullable<typeof desks>[number]) => {
    const parts = (d.desk_teams ?? []) as { team_id: number; accepted: boolean }[];
    const [label, bg, fg] = STATUS[d.status] ?? STATUS.open;
    return (
      <Link key={d.id} href={`/market/desk/${d.id}`} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, color: 'inherit', textDecoration: 'none' }}>
        <div className="row-between" style={{ alignItems: 'flex-start', gap: 10 }}>
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span className="eyebrow">{team(d.team_id).name} wants</span>
            <b style={{ font: '600 18px/1.2 var(--font)' }}>{d.title}</b>
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
        <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>Trade desk</h1>
        <p className="muted" style={{ margin: '4px 0 0', maxWidth: '72ch' }}>
          For deals that need more than two teams. Say what you’re after, then let anyone join and build the deal on one board.
          Everyone in it accepts, the commish approves, and every player and pick moves at once.
        </p>
      </div>

      {error && <div role="alert" className="card" style={{ padding: '10px 14px', background: C.redBg, color: C.redFg, border: 0 }}>{error}</div>}

      {me && (
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
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 className="h2">Open desks <span className="muted" style={{ fontWeight: 400 }}>{live.length}</span></h2>
        {live.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>{live.map(card)}</div>
          : <p className="muted" style={{ margin: 0 }}>No desks open. Start one above.</p>}
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
