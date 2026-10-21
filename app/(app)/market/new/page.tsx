import { getLeague, getMe } from '@/lib/data';
import { createListing } from '../actions';

export default async function NewListing({ searchParams }: { searchParams: Promise<{ error?: string; player?: string }> }) {
  const sp = await searchParams;
  const [league, me] = await Promise.all([getLeague(), getMe()]);
  const mine = league.players
    .filter((p) => p.team_id === me?.team_id)
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));

  const field = { display: 'flex', flexDirection: 'column', gap: 4 } as const;
  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <div>
        <span className="eyebrow">Market</span>
        <h1 style={{ font: '600 30px var(--font)', letterSpacing: '-.03em' }}>List a player</h1>
        <p className="muted" style={{ margin: 0 }}>Other coaches can offer, comment or bid. Nothing moves until you accept and the commish approves.</p>
      </div>
      {sp.error && <div role="alert" className="card" style={{ padding: 12, color: 'var(--red-fg)', background: 'var(--red-bg)' }}>{sp.error}</div>}
      <form action={createListing} className="card" style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <label style={{ ...field, gridColumn: '1 / -1' }}><span className="eyebrow">Player</span>
          <select name="player_id" required className="input" defaultValue={sp.player}>
            {mine.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.positions.join('/')} · {p.average?.toFixed(1) ?? '–'} avg</option>)}
          </select>
        </label>
        <label style={field}><span className="eyebrow">Listing type</span>
          <select name="kind" className="input">
            <option value="trade">Trade block: open to offers</option>
            <option value="sale">For picks: fixed asking price</option>
            <option value="auction">Live auction</option>
          </select>
        </label>
        <label style={field}><span className="eyebrow">Asking / starting price</span><input name="asking" className="input" placeholder="2027 R2" /></label>
        <label style={field}><span className="eyebrow">Minimum</span><input name="minimum" className="input" placeholder="2027 R3" /></label>
        <label style={field}><span className="eyebrow">Also open to</span><input name="open_to" className="input" placeholder="Ruck swap" /></label>
        <label style={field}><span className="eyebrow">Auction length (hours)</span><input name="hours" type="number" min={1} max={168} defaultValue={48} className="input" /></label>
        <label style={field}><span className="eyebrow">Auction reserve (pick points)</span><input name="reserve_pts" type="number" min={0} step={50} className="input" placeholder="600" /></label>
        <button type="submit" className="btn dark" style={{ justifySelf: 'start' }}>List player</button>
      </form>
    </div>
  );
}
