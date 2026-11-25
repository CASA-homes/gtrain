// Player profile: his contract status, plus the right "offer" button for whoever's looking.
//  - Pending or open free agent → make a contract offer (rivals) / see offers (his club)
//  - Under contract at another club → open a trade desk for him; pay his clause too in the mid-season window
//  - On a club list but not contracted → open a trade desk
import Link from 'next/link';
import { offerForPlayer, openUnsigned } from '@/app/(app)/contracts/actions';
import { RunButton } from '@/components/contracts/client';
import { clauseKt, getContracts, isFinalYear, kt, money, yearsLeft } from '@/lib/contracts';
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
  const { meId, c, fa, claim, holder, clause, myOffer, leaving } = x;
  if (holder === meId) return fa?.kind === 'pending' ? <Link href={`/clubhouse/${meId}?view=contracts`} className="kc-btn small ph-act">See offers</Link> : null;
  return (
    <span className="ph-offer">
      {holder && !leaving
        ? <form action={offerForPlayer.bind(null, playerId, holder, name)}><button type="submit" className="kc-btn small">Trade</button></form>
        : <span className="kc-btn small" aria-disabled="true">Trade</span>}
      {fa && (fa.kind === 'open' || fa.ex_team !== meId)
        ? <Link href={`/contracts/offer/${fa.id}`} className="kc-btn small dark">{myOffer ? `Raise offer (${myOffer.score})` : 'Offer contract'}</Link>
        : !c && holder
          ? <form action={openUnsigned.bind(null, playerId)}><button type="submit" className="kc-btn small dark">Offer contract</button></form>
          : <span className="kc-btn small dark" aria-disabled="true" title="Only free agents and out-of-contract players can be offered a contract">Offer contract</span>}
      {c && clause != null && !claim && !leaving &&
        <Link href={`/clubhouse/${c.team_id}?view=contracts`} className="kc-btn small sage">Pay clause · {kt(clause)}</Link>}
    </span>
  );
}

/** Contract / market value / clause in three aligned cells, plus a status line only when something is happening. */
export async function PlayerContractStrip({ playerId, ownerTeamId }: { playerId: number; ownerTeamId: number | null }) {
  const x = await load(playerId, ownerTeamId);
  if (!x) return null;
  const { s, c, next, fa, claim, team, holder, rate, clause, leaving } = x;
  // Contract status: a short label in its own cell, the full story in the tooltip.
  let status = c ? `${yearsLeft(s, c)} yrs left` : holder ? 'No contract' : 'Unsigned'; let full = status; let tone = '';
  if (claim) { status = 'Clause paid'; full = `Clause paid by ${team(claim.buyer_team)}. ${team(claim.seller_team)} can match`; tone = 'warn'; }
  else if (leaving && next) { status = 'Signed elsewhere'; full = `Joins ${team(next.team_id)} at season end · ${short(next.salary_k)} to ${next.end_season}`; tone = 'move'; }
  else if (fa) { status = 'Free agent'; full = `Free agent · ${fa.offers} offer${fa.offers === 1 ? '' : 's'}`; tone = 'fa'; }
  else if (c && isFinalYear(s, c) && next) { status = `Extended to ${next.end_season}`; full = `Extended to ${next.end_season} at ${short(next.salary_k)}`; tone = 'ok'; }
  else if (c && isFinalYear(s, c)) { status = c.how === 'draft' ? 'Draft deal' : 'Final year'; full = c.how === 'draft' ? 'Draft deal · final year' : 'Final year'; tone = 'warn'; }
  const clauseText = !c ? '—' : clause != null ? kt(clause) : c.tier === 'none' ? 'None' : '—';
  return (
    <div className="ph-kc">
      <div className="ph-kc-cells">
        <div><span>Contract value</span><b>{c ? short(c.salary_k) : holder ? 'None' : 'Unsigned'}</b></div>
        <div><span>Until</span><b>{c ? c.end_season : '—'}</b></div>
        <div title={full}><span>Contract status</span><b className={tone ? `ph-st ${tone}` : undefined}>{status}</b></div>
        <div><span>Market value</span><b>{short(rate)}</b></div>
        <div><span>Release clause</span><b>{clauseText}</b></div>
      </div>
    </div>
  );
}

/** The Contract row of the profile header: label + four cells on the shared grid (salary, until, clause, status pill). */
export async function PlayerContractRow({ playerId, ownerTeamId }: { playerId: number; ownerTeamId: number | null }) {
  const x = await load(playerId, ownerTeamId);
  if (!x) return null;
  const { s, c, next, fa, claim, team, holder, clause, leaving } = x;
  let status = c ? `${yearsLeft(s, c)} yr${yearsLeft(s, c) === 1 ? '' : 's'} left` : holder ? 'No contract' : 'Unsigned'; let full = status; let tone = c ? 'ok' : 'warn';
  if (claim) { status = 'Clause paid'; full = `Clause paid by ${team(claim.buyer_team)}. ${team(claim.seller_team)} can match`; tone = 'red'; }
  else if (leaving && next) { status = 'Signed elsewhere'; full = `Joins ${team(next.team_id)} at season end · ${short(next.salary_k)} to ${next.end_season}`; tone = 'move'; }
  else if (fa) { status = 'Free agent'; full = `Free agent · ${fa.offers} offer${fa.offers === 1 ? '' : 's'}`; tone = 'fa'; }
  else if (c && isFinalYear(s, c) && next) { status = `Extended to ${next.end_season}`; full = `Extended to ${next.end_season} at ${short(next.salary_k)}`; tone = 'ok'; }
  else if (c && isFinalYear(s, c)) { status = c.how === 'draft' ? 'Draft deal' : 'Final year'; full = c.how === 'draft' ? 'Draft deal · final year' : 'Final year'; tone = 'warn'; }
  const clauseText = !c ? '—' : clause != null ? kt(clause) : c.tier === 'none' ? 'None' : '—';
  return (
    <>
      <div className="phx-lab phx-sep">Contract</div>
      <div className="phx-cell phx-sep"><b className="phx-md">{c ? short(c.salary_k) : '—'}</b><span>{c ? 'a year' : 'salary'}</span></div>
      <div className="phx-cell phx-sep"><b className="phx-md">{c ? c.end_season : '—'}</b><span>until</span></div>
      <div className="phx-cell phx-sep"><b className="phx-md">{clauseText}</b><span>release clause</span></div>
      <div className="phx-cell phx-sep phx-pillcell" title={full}><span className={`phx-pill ${tone}`}>{status}</span></div>
    </>
  );
}
