// Player profile: his contract status, plus the right "offer" button for whoever's looking.
//  - Pending or open free agent → make a contract offer (rivals) / see offers (his club)
//  - Under contract at another club → open a trade desk for him; pay his clause too in the mid-season window
//  - On a club list but not contracted → open a trade desk
import Link from 'next/link';
import { offerForPlayer } from '@/app/(app)/contracts/actions';
import { RunButton } from '@/components/contracts/client';
import { clauseKt, getContracts, isFinalYear, kt, money } from '@/lib/contracts';
import './contracts.css';

async function load(playerId: number, ownerTeamId: number | null) {
  const d = await getContracts();
  const s = d.settings;
  if (!s || !d.ready) return null;
  const meId = d.me && !d.me.is_guest ? d.me.team_id : null;
  const c = d.byPlayer.get(playerId);
  const next = d.pending.find((p) => p.player_id === playerId);
  const fa = d.freeAgents.find((f) => f.player_id === playerId);
  const claim = d.claims.find((x) => x.status === 'pending' && x.player_id === playerId);
  const team = (id: number | null) => d.teams.find((t) => t.id === id)?.name ?? '—';
  const holder = c?.team_id ?? ownerTeamId;
  const rate = d.rates.get(playerId) ?? 0;
  const clause = c ? clauseKt(s, c, rate, fa?.kind === 'pending') : null;
  const windowOpen = !!s.window_open && !!s.window_closes_at && new Date(s.window_closes_at) > new Date();
  const myOffer = fa ? d.myOffers.find((o) => o.fa_id === fa.id) : null;
  const leaving = !!(next && next.team_id !== holder);
  return { d, s, meId, c, next, fa, claim, team, holder, rate, clause, windowOpen, myOffer, leaving };
}

const short = (k: number) => `$${Math.round(k)}k`;

/** Offer buttons, shown inline next to the club name (only for someone else's player). */
export async function PlayerOffer({ playerId, ownerTeamId, name }: { playerId: number; ownerTeamId: number | null; name: string }) {
  const x = await load(playerId, ownerTeamId);
  if (!x || x.meId == null) return null;
  const { meId, c, fa, claim, team, holder, clause, windowOpen, myOffer, leaving } = x;
  if (holder === meId) return fa?.kind === 'pending' ? <Link href={`/clubhouse/${meId}?view=contracts`} className="kc-btn small ph-act">See offers</Link> : null;
  return (
    <span className="ph-offer">
      {fa && (fa.kind === 'open' || fa.ex_team !== meId)
        ? <Link href={`/contracts/offer/${fa.id}`} className="kc-btn small dark">{myOffer ? `Raise offer (${myOffer.score})` : 'Make offer'}</Link>
        : holder && !leaving ? <form action={offerForPlayer.bind(null, playerId, holder, name)}><button type="submit" className="kc-btn small dark">Offer</button></form> : null}
      {c && clause != null && windowOpen && !claim && !leaving &&
        <RunButton run="buy" id={c.id} small kind="sage" label={`Pay clause · ${kt(clause)}`} confirmText={`Pay ${kt(clause)} for ${name}? ${team(c.team_id)} get 24 hours to match. If they don't, he joins you at season end on ${money(c.salary_k)} a year to ${c.end_season}.`} />}
    </span>
  );
}

/** Contract / market value / clause in three aligned cells, plus a status line only when something is happening. */
export async function PlayerContractStrip({ playerId, ownerTeamId }: { playerId: number; ownerTeamId: number | null }) {
  const x = await load(playerId, ownerTeamId);
  if (!x) return null;
  const { s, c, next, fa, claim, team, holder, rate, clause, leaving } = x;
  let status: string | null = null; let tone = 'exp';
  if (claim) status = `Clause paid by ${team(claim.buyer_team)}. ${team(claim.seller_team)} can match`;
  else if (leaving && next) status = `Joins ${team(next.team_id)} at season end · ${short(next.salary_k)} to ${next.end_season}`;
  else if (fa?.kind === 'pending') status = `Pending free agent · ${fa.offers} offer${fa.offers === 1 ? '' : 's'}`;
  else if (fa) { status = `Free agent · ${fa.offers} offer${fa.offers === 1 ? '' : 's'}`; tone = 'rook'; }
  else if (c && isFinalYear(s, c) && next) { status = `Extended to ${next.end_season} at ${short(next.salary_k)}`; tone = 'high'; }
  else if (c && isFinalYear(s, c)) status = c.how === 'draft' ? 'Draft deal · final year' : 'Final year';
  const clauseText = !c ? '—' : clause != null ? kt(clause) : c.tier === 'none' ? 'None' : '—';
  return (
    <div className="ph-kc">
      <div className="ph-kc-cells">
        <div><span>Contract value</span><b>{c ? short(c.salary_k) : holder ? 'None' : 'Unsigned'}</b></div>
        <div><span>Until</span><b>{c ? c.end_season : '—'}</b></div>
        <div><span>Market value</span><b>{short(rate)}</b></div>
        <div><span>Release clause</span><b>{clauseText}</b></div>
      </div>
      {status && <span className={`kc-tag ${tone}`}>{status}</span>}
    </div>
  );
}
