// Trademarket › Free agents: everyone a club can offer a contract to (open, pending, final year), with their current
// deal and what a new one costs at market rate. Commish tools to close offer periods sit below.
import Link from 'next/link';
import { RunButton } from '@/components/contracts/client';
import { MarketNav } from '@/components/trade/MarketNav';
import { FreeAgentBoard, type FaRow, type FaStatus } from '@/components/trade/FreeAgentBoard';
import { playerAge, priceDeal, TIER_LABEL } from '@/lib/contracts';
import { getMarket } from '@/lib/market';
import '@/components/contracts/contracts.css';
import '@/components/trade/home.css';
import '@/components/trade/board.css';
import '@/components/trade/shares.css';

export const dynamic = 'force-dynamic';

export default async function FreeAgentsPage() {
  const m = await getMarket();
  const { d, s, meId, teamName, allPlayers, pname } = m;
  const rows: FaRow[] = [];
  const seen = new Set<number>();
  const add = (pid: number, st: FaStatus, extra: Partial<FaRow>) => {
    if (seen.has(pid)) return;
    seen.add(pid);
    const p = allPlayers.get(pid);
    const v = d.rates.get(pid) ?? 0;
    const c = d.byPlayer.get(pid);
    const deal = (y: number) => (s ? priceDeal(s, v, y, 'standard').salary : v);
    const log = (p?.games_log ?? []).map((g) => g[1]).filter((x): x is number => x != null);
    rows.push({
      pid, faId: null, n: p?.name ?? pname(pid), pos: p?.positions ?? [], club: p?.afl_club ?? null, age: playerAge(p),
      st, from: null, l5: log.length ? log.slice(-5) : (p?.last5 ?? []).filter((x) => x != null).slice(-5), avg: p?.average ?? null, g: p?.games ?? 0,
      sal: c?.salary_k ?? null, ends: c?.end_season ?? null, tier: c ? TIER_LABEL[c.tier] : null,
      v, d1: deal(1), d3: deal(3), d5: deal(5), offers: 0, closes: null, mine: false, myOffer: false, ...extra,
    });
  };
  for (const f of d.freeAgents) {
    const st: FaStatus = f.kind === 'open' ? 'open' : 'pending';
    add(f.player_id, st, { faId: f.id, from: f.ex_team ? teamName(f.ex_team) : null, offers: f.offers, closes: f.closes_at, mine: f.ex_team === meId, myOffer: d.myOffers.some((o) => o.fa_id === f.id) });
  }
  for (const { c } of m.comingFa) add(c.player_id, 'final', { from: teamName(c.team_id), mine: c.team_id === meId });
  rows.sort((a, b) => b.v - a.v);

  const openFa = d.freeAgents.filter((f) => f.kind === 'open');
  const closable = openFa.filter((f) => d.me?.is_commish || (f.closes_at && new Date(f.closes_at) <= new Date()));
  return (
    <div className="th"><main className="th-main wide">
      <div className="th-head">
        <div>
          <span className="th-eb">Trademarket</span>
          <h1>Free agents</h1>
          <p>Open free agents take blind offers: best score wins, ties go to the lower ladder club. Pending free agents are in the last six months of their deal; his club can match. Final-year players open up at the mid-season window if they aren’t re-signed.</p>
        </div>
        <MarketNav active="free-agents" />
      </div>
      <FreeAgentBoard rows={rows} meId={meId} />
      {closable.length > 0 && (
        <section className="th-card" aria-labelledby="fa-close-h">
          <div className="th-ch"><h2 id="fa-close-h">Close offer periods</h2><span className="th-mut">{d.me?.is_commish ? 'Commish' : 'Offer periods that have run out'}</span></div>
          {closable.map((f) => (
            <div key={f.id} className="th-feed">
              <span className="th-ico">FA</span>
              <span><b><Link href={`/players/${f.player_id}`}>{allPlayers.get(f.player_id)?.name ?? pname(f.player_id)}</Link></b><span className="s">{f.offers} offer{f.offers === 1 ? '' : 's'}</span></span>
              <span className="acts"><RunButton run="close-fa" id={f.id} small kind="plain" label="Close offers" confirmText="Close offers now? The best offer signs him." /></span>
            </div>
          ))}
        </section>
      )}
    </main></div>
  );
}
