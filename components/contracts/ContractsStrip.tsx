// Clubhouse home: "Important news". Anything waiting on the coach first (a clause paid on one of their players,
// offers on their pending free agents, being over next year's keeper cap), then the latest contract moves.
// Cap numbers live in the Finances tab. Shows nothing until the commish has set contracts up.
import Link from 'next/link';
import { getContracts, kt, moneyK } from '@/lib/contracts';
import { NewsTicker } from '@/components/contracts/NewsTicker';
import './contracts.css';

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${Math.max(1, m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};
const KIND: Record<string, string> = { clause: 'Clause', match: 'Matched', free_agent: 'Signed', release: 'Released', extension: 'Extended', auction: 'Auction', tier: 'Clause', deficit: 'Deficit', draft: 'Draft', pending: 'Mid-season', seed: 'League' };

export async function ContractsStrip({ teamId, mine }: { teamId: number; mine: boolean }) {
  const d = await getContracts();
  const s = d.settings;
  const club = d.clubs.get(teamId);
  if (!s || !d.ready || !club) return null;
  const name = (pid: number | null) => (pid ? d.players.get(pid)?.name ?? 'A player' : '');
  const team = (id: number | null) => d.teams.find((t) => t.id === id)?.short_code ?? '—';
  const base = `/clubhouse/${teamId}`;

  const alerts: { text: string; href: string; tone: 'err' | 'warn' }[] = [];
  if (mine) {
    for (const c of d.claims.filter((x) => x.status === 'pending' && x.seller_team === teamId))
      alerts.push({ text: `${team(c.buyer_team)} paid ${name(c.player_id)}'s clause (${kt(c.price_kt)}). Match or let him go.`, href: `${base}?view=contracts`, tone: 'err' });
    const offers = d.freeAgents.filter((f) => f.kind === 'pending' && f.ex_team === teamId && f.offers > 0);
    if (offers.length) alerts.push({ text: `${offers.reduce((t, f) => t + f.offers, 0)} offers on your pending free agents.`, href: `${base}?view=contracts`, tone: 'warn' });
    const finalYear = d.active.filter((c) => c.team_id === teamId && c.end_season <= s.season && !d.pending.some((p) => p.player_id === c.player_id) && !d.pendingFa.has(c.player_id)).length;
    if (finalYear && !d.midseason) alerts.push({ text: `${finalYear} in their final year. Re-sign before the mid-season window closes or they become free agents.`, href: `${base}?view=contracts`, tone: 'warn' });
    const over = club.salary - club.keeperCapNow;
    if (over > 0) alerts.push({ text: over > (club.deficitUsed ? 0 : s.deficit_max_k) ? `${moneyK(over)} over the ${s.season} keeper cap. Fix it by deadline day or the commish releases a player.` : `${moneyK(over)} over the ${s.season} keeper cap. Deficit allowed on deadline day for ${s.deficit_fee_kt.toLocaleString('en-AU')} KT.`, href: `${base}?view=finances`, tone: over > (club.deficitUsed ? 0 : s.deficit_max_k) ? 'err' : 'warn' });
  }
  const news = d.transfers.filter((t) => t.from_team === teamId || t.to_team === teamId || t.kind === 'pending' || t.kind === 'draft').slice(0, 8);
  if (!alerts.length && !news.length) return null;

  return (
    <section className="card ch-news" aria-labelledby="ch-news-h">
      <div className="row-between">
        <h2 id="ch-news-h" className="eyebrow" style={{ margin: 0 }}>Important news</h2>
        <Link href={`${base}?view=contracts`} className="ch-news-more">All contracts →</Link>
      </div>
      {alerts.map((a, i) => (
        <Link key={i} href={a.href} className={`ch-alert ${a.tone}`}><i aria-hidden="true" />{a.text}<span aria-hidden="true">›</span></Link>
      ))}
      <NewsTicker items={news.map((t) => ({
        kind: KIND[t.kind] ?? t.kind,
        text: `${t.player_id ? name(t.player_id) : ''}${t.player_id && t.from_team && t.to_team && t.from_team !== t.to_team ? ` ${team(t.from_team)} → ${team(t.to_team)}` : ''}${t.note ? `${t.player_id ? ' · ' : ''}${t.note}` : ''}`,
        ago: ago(t.created_at),
      }))} />
    </section>
  );
}
