// Trade page: three ways to buy a player.
//  1. Free agents now: out of contract, make a contract offer.
//  2. Upcoming: pending free agents (offers open, their club picks one) and final-year players who become
//     pending free agents at mid-season unless extended.
//  3. Buy anyone with KT: pick a player on another list, name your price, and a trade desk opens with the offer on it.
import Link from 'next/link';
import { offerKtForPlayer } from '@/app/(app)/market/desk/actions';
import { getContracts, kt, playerAge } from '@/lib/contracts';
import { getLeague } from '@/lib/data';

const k$ = (k: number) => `$${Math.round(k)}k`;

export async function BuyPanel() {
  const [d, league] = await Promise.all([getContracts(), getLeague()]);
  const s = d.settings;
  if (!s || !d.ready) return null;
  const meId = d.me && !d.me.is_guest ? d.me.team_id : null;
  const team = (id: number | null) => d.teams.find((t) => t.id === id)?.short_code ?? '—';
  const bank = meId ? d.clubs.get(meId)?.bank ?? 0 : 0;

  const now = d.freeAgents.filter((f) => f.kind === 'open').map((f) => ({ f, p: d.players.get(f.player_id), rate: d.rates.get(f.player_id) ?? 0 }))
    .sort((a, b) => (b.p?.average ?? 0) - (a.p?.average ?? 0));
  const pending = d.freeAgents.filter((f) => f.kind === 'pending' && f.ex_team !== meId).map((f) => ({ f, p: d.players.get(f.player_id), rate: d.rates.get(f.player_id) ?? 0 }));
  const finalYear = d.midseason ? [] : d.active
    .filter((c) => c.team_id !== meId && c.end_season <= s.season && !d.pending.some((p) => p.player_id === c.player_id) && !d.pendingFa.has(c.player_id))
    .map((c) => ({ c, p: d.players.get(c.player_id), rate: d.rates.get(c.player_id) ?? 0 }))
    .sort((a, b) => (b.p?.average ?? 0) - (a.p?.average ?? 0)).slice(0, 12);
  const targets = league.players
    .filter((p) => p.team_id && p.team_id !== meId && !p.list_status && !d.pending.some((x) => x.player_id === p.id && x.team_id !== p.team_id))
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));

  const Row = ({ href, name, meta, right, sub, tag }: { href: string; name: string; meta: string; right: string; sub?: string; tag?: string }) => (
    <Link href={href} className="bp-row">
      <span className="bp-who"><b>{name}</b><span>{meta}</span>{tag && <i>{tag}</i>}</span>
      <span className="bp-num">{right}{sub && <em>{sub}</em>}</span>
    </Link>
  );

  return (
    <section className="bp" aria-labelledby="bp-h">
      <div className="row-between"><h2 id="bp-h" className="h2" style={{ fontSize: 20 }}>Buy players</h2>{meId && <span className="muted" style={{ fontSize: 13 }}>Your bank <b style={{ color: 'var(--ink)' }}>{kt(bank)}</b></span>}</div>
      <div className="bp-grid">
        <div className="card bp-card bp-fa">
          <input type="radio" name="bp-fa" id="bp-fa-now" defaultChecked hidden />
          <input type="radio" name="bp-fa" id="bp-fa-up" hidden />
          <div className="bp-tabs" role="tablist" aria-label="Free agents">
            <label htmlFor="bp-fa-now" role="tab"><span className="bp-dot" style={{ background: '#2f5d46' }} />Free agents<span className="bp-n">{now.length}</span></label>
            <label htmlFor="bp-fa-up" role="tab"><span className="bp-dot" style={{ background: '#c08a1e' }} />Expiring<span className="bp-n">{pending.length + finalYear.length}</span></label>
          </div>
          <div className="bp-pane bp-pane-now">
            <div className="bp-head"><span className="bp-dot" style={{ background: '#2f5d46' }} /><h3>Free agents now</h3><span className="bp-n">{now.length}</span></div>
            <p className="bp-note">Out of contract. Blind offers, best offer wins when offers close.</p>
            {now.length ? now.slice(0, 8).map(({ f, p, rate }) => (
              <Row key={f.id} href={`/contracts/offer/${f.id}`} name={p?.name ?? `Player ${f.player_id}`} meta={`${p?.positions.join('/') ?? ''} · ${playerAge(p) ?? '–'}y · ${p?.average?.toFixed(1) ?? '–'} · ex ${team(f.ex_team)}`} right={k$(rate)} sub={`${f.offers} offer${f.offers === 1 ? '' : 's'}`} />
            )) : <p className="bp-empty">Nobody right now. Released players land here.</p>}
            {now.length > 8 && <Link href="/market/free-agents" className="bp-more">All {now.length} free agents →</Link>}
          </div>
          <div className="bp-pane bp-pane-up">
            <div className="bp-head"><span className="bp-dot" style={{ background: '#c08a1e' }} /><h3>Upcoming free agents</h3><span className="bp-n">{pending.length + finalYear.length}</span></div>
            <p className="bp-note">{d.midseason ? 'Pending free agents: offer a contract plus a fee. Their club has 48 hours to match; if not, he’s yours from Free Agent Day (1 Jan).' : 'Final-year players. Unless re-signed by the end of the mid-season window, they become free agents.'}</p>
            {pending.map(({ f, p, rate }) => (
              <Row key={`p${f.id}`} href={`/contracts/offer/${f.id}`} name={p?.name ?? ''} meta={`${p?.positions.join('/') ?? ''} · ${playerAge(p) ?? '–'}y · ${p?.average?.toFixed(1) ?? '–'} · ${team(f.ex_team)}`} right={k$(rate)} sub={`${f.offers} offer${f.offers === 1 ? '' : 's'}`} tag="Offers open" />
            ))}
            {finalYear.map(({ c, p, rate }) => (
              <Row key={`c${c.id}`} href={`/players/${c.player_id}`} name={p?.name ?? ''} meta={`${p?.positions.join('/') ?? ''} · ${playerAge(p) ?? '–'}y · ${p?.average?.toFixed(1) ?? '–'} · ${team(c.team_id)}`} right={k$(rate)} sub={`on ${k$(c.salary_k)}`} tag={c.how === 'draft' ? 'Draftee' : 'Final year'} />
            ))}
            {!pending.length && !finalYear.length && <p className="bp-empty">No one coming up.</p>}
          </div>
        </div>

        <div className="card bp-card bp-kt">
          <div className="bp-head"><span className="bp-dot" style={{ background: '#1f3a5c' }} /><h3>Buy anyone with KT</h3></div>
          <p className="bp-note">Name your price for a player on another list. A trade desk opens with your offer on it; they accept, counter or say no. The commish approves like any trade, and his contract comes with him.</p>
          {meId ? (
            <form action={offerKtForPlayer} className="bp-form">
              <label>Player
                <select name="player" required defaultValue="">
                  <option value="" disabled>Choose a player…</option>
                  {targets.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.positions.join('/')} · {p.average?.toFixed(0) ?? '–'} · {team(p.team_id)} · {k$(d.rates.get(p.id) ?? 0)}</option>)}
                </select>
              </label>
              <label>Your offer (KT)
                <input name="kt" type="number" inputMode="numeric" min={1} step={1} max={bank || undefined} placeholder="e.g. 300" required />
              </label>
              <button type="submit" className="btn dark">Make the offer</button>
              <span className="muted" style={{ fontSize: 12 }}>You have {kt(bank)}. Add players or picks on the desk too.</span>
            </form>
          ) : <p className="bp-empty">Sign in as a coach to make offers.</p>}
        </div>
      </div>
    </section>
  );
}
