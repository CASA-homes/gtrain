import { notFound } from 'next/navigation';
import { getLeague } from '@/lib/data';
import { getContracts, playerAge } from '@/lib/contracts';
import { OfferFlow } from '@/components/contracts/OfferFlow';
import '@/components/contracts/contracts.css';

export const dynamic = 'force-dynamic';

export default async function OfferPage({ params }: { params: Promise<{ faId: string }> }) {
  const { faId } = await params;
  const [d, league] = await Promise.all([getContracts(), getLeague()]);
  const f = d.freeAgents.find((x) => x.id === Number(faId));
  if (!f || !d.settings || !d.me || d.me.is_guest) notFound();
  const s = d.settings;
  const p = d.players.get(f.player_id);
  const club = d.clubs.get(d.me.team_id)!;
  const mine = d.myOffers.find((o) => o.fa_id === f.id) ?? null;
  const longUsed = d.contracts.filter((c) => c.team_id === d.me!.team_id && (c.status === 'active' || c.status === 'pending') && c.end_season - c.start_season + 1 >= 4).length;
  const picks = [...league.picks, ...league.extraPicks].filter((pk) => pk.owner_team_id === d.me!.team_id)
    .map((pk) => ({ id: pk.id, label: `${pk.year} ${pk.kind === 'msd' ? 'MSD ' : ''}R${pk.round}${pk.overall ? ` · pick ${pk.overall}` : ''}`, overall: pk.overall ?? (pk.round - 1) * 10 + 5 }));
  return (
    <div className="kc-page" style={{ minHeight: '100dvh' }}>
      <OfferFlow
        fa={{ id: f.id, offers: f.offers, closesAt: f.closes_at, exTeam: d.teams.find((t) => t.id === f.ex_team)?.name ?? null, exRank: f.ex_team ? d.ladderRank.get(f.ex_team) ?? null : null }}
        player={{ name: p?.name ?? `Player ${f.player_id}`, positions: p?.positions ?? [], club: p?.afl_club ?? null, age: playerAge(p), average: p?.average ?? null, games: p?.games ?? null }}
        rate={d.rates.get(f.player_id) ?? 0}
        settings={s} bank={club.bank} salary={club.salary} longUsed={longUsed} picks={picks} existing={mine}
      />
    </div>
  );
}
