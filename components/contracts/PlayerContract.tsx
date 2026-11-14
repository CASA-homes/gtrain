// Player profile: his contract status, plus the right "offer" button for whoever's looking.
//  - Pending or open free agent → make a contract offer (rivals) / see offers (his club)
//  - Under contract at another club → open a trade desk for him; pay his clause too in the mid-season window
//  - On a club list but not contracted → open a trade desk
import Link from 'next/link';
import { offerForPlayer } from '@/app/(app)/contracts/actions';
import { RunButton } from '@/components/contracts/client';
import { clauseKt, getContracts, isFinalYear, kt, money, yearsLeft } from '@/lib/contracts';
import './contracts.css';

export async function PlayerContractBits({ playerId, ownerTeamId, name }: { playerId: number; ownerTeamId: number | null; name: string }) {
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

  let status: string; let tone: 'exp' | 'high' | 'rook' | 'std' = 'std';
  if (claim) { status = `Clause paid by ${team(claim.buyer_team)} · ${team(claim.seller_team)} can match`; tone = 'exp'; }
  else if (next && next.team_id !== holder) { status = `Joins ${team(next.team_id)} at season end · ${money(next.salary_k)} to ${next.end_season}`; tone = 'exp'; }
  else if (fa?.kind === 'pending') { status = `Pending free agent · ${fa.offers} offer${fa.offers === 1 ? '' : 's'}`; tone = 'exp'; }
  else if (fa) { status = `Free agent · ${fa.offers} offer${fa.offers === 1 ? '' : 's'}`; tone = 'rook'; }
  else if (c && isFinalYear(s, c) && next) { status = `Extended to ${next.end_season} at ${money(next.salary_k)}`; tone = 'high'; }
  else if (c && isFinalYear(s, c)) { status = c.how === 'draft' ? 'Draft deal · final year' : 'Final year'; tone = 'exp'; }
  else if (c) { status = `${yearsLeft(s, c)} years left${c.rookie ? ' · rookie deal' : ''}`; tone = c.rookie ? 'rook' : 'std'; }
  else { status = holder ? 'Not on contract' : 'Unsigned'; }

  const isMine = meId != null && holder === meId;
  return (
    <>
      {meId && !isMine && (
        <span className="ph-offer">
          {fa && (fa.kind === 'open' || fa.ex_team !== meId)
            ? <Link href={`/contracts/offer/${fa.id}`} className="kc-btn small dark">{myOffer ? `Raise offer (${myOffer.score})` : 'Make offer'}</Link>
            : holder && !(next && next.team_id !== holder) ? (
              <form action={offerForPlayer.bind(null, playerId, holder, name)}><button type="submit" className="kc-btn small dark">Offer</button></form>
            ) : null}
          {c && clause != null && windowOpen && !claim && !(next && next.team_id !== holder) &&
            <RunButton run="buy" id={c.id} small kind="sage" label={`Pay clause · ${kt(clause)}`} confirmText={`Pay ${kt(clause)} for ${name}? ${team(c.team_id)} get 24 hours to match. If they don't, he joins you at season end on ${money(c.salary_k)} a year to ${c.end_season}.`} />}
        </span>
      )}
      {isMine && fa?.kind === 'pending' && <Link href={`/clubhouse/${meId}?view=contracts`} className="kc-btn small" style={{ marginLeft: 8 }}>See offers</Link>}
      <span className="ph-contract" style={{ flexBasis: '100%' }}>
        <span className={`kc-tag ${tone}`}>{status}</span>
        {c && <span>Contract <b>{money(c.salary_k)}</b> a year to <b>{c.end_season}</b></span>}
        <span>Market value <b>{money(rate)}</b></span>
        {c && <span>Clause <b>{clause != null ? kt(clause) : c.tier === 'none' ? 'none' : isFinalYear(s, c) ? 'none (final year)' : '—'}</b></span>}
        {holder && <Link href={`/clubhouse/${holder}?view=contracts`} style={{ fontSize: 12 }}>{team(holder)} contracts →</Link>}
      </span>
    </>
  );
}
