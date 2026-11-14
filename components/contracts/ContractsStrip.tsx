// Clubhouse home: the club's cap at a glance, anything waiting on the coach, and the latest contract news.
// Shows nothing until the commish has set contracts up.
import Link from 'next/link';
import { getContracts, kt, moneyK } from '@/lib/contracts';
import './contracts.css';

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${Math.max(1, m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const KIND: Record<string, string> = { clause: 'Clause', match: 'Matched', free_agent: 'Signed', release: 'Released', extension: 'Extended', auction: 'Auction', tier: 'Clause', deficit: 'Deficit', draft: 'Draft', pending: 'Mid-season', seed: 'League' };

export async function ContractsStrip({ teamId, mine }: { teamId: number; mine: boolean }) {
  const d = await getContracts();
  const s = d.settings;
  const club = d.clubs.get(teamId);
  if (!s || !d.ready || !club) return null;
  const name = (pid: number | null) => (pid ? d.players.get(pid)?.name ?? 'A player' : '');
  const team = (id: number | null) => d.teams.find((t) => t.id === id)?.short_code ?? '—';
  const claims = d.claims.filter((c) => c.status === 'pending' && c.seller_team === teamId).length;
  const offers = d.freeAgents.filter((f) => f.kind === 'pending' && f.ex_team === teamId).reduce((t, f) => t + f.offers, 0);
  const finalYear = d.active.filter((c) => c.team_id === teamId && c.end_season <= s.season && !d.pending.some((p) => p.player_id === c.player_id)).length;
  const news = d.transfers.filter((t) => t.from_team === teamId || t.to_team === teamId || t.kind === 'pending' || t.kind === 'draft').slice(0, 5);
  const nextOver = club.nextSalary - club.keeperCapNext;
  const href = `/clubhouse/${teamId}?view=contracts`;

  return (
    <section className="card ch-cap" aria-labelledby="ch-cap-h">
      <div className="ch-cap-top">
        <div className="ch-cap-head">
          <span className="eyebrow">Contracts & cap{s.shadow ? ' · shadow season' : ''}</span>
          <Link id="ch-cap-h" href={href} style={{ font: '600 17px var(--font)', color: 'inherit' }}>{mine ? 'Your contracts' : 'Their contracts'} →</Link>
        </div>
        <div className="ch-cap-kpi"><span className="eyebrow">{s.season} salary</span><b className="num">{moneyK(club.salary)} <small>/ {moneyK(s.season_cap_k)}</small></b></div>
        <div className="ch-cap-kpi"><span className="eyebrow">{s.season + 1} keepers</span><b className="num" style={{ color: nextOver > 0 ? '#a8461f' : undefined }}>{moneyK(club.nextSalary)} <small>/ {moneyK(club.keeperCapNext)}</small></b></div>
        <div className="ch-cap-kpi"><span className="eyebrow">Bank</span><b className="num">{kt(club.bank)}</b></div>
        <div className="ch-cap-kpi"><span className="eyebrow">Final year</span><b className="num">{finalYear}</b></div>
      </div>
      {mine && (claims > 0 || offers > 0) && (
        <Link href={href} className="kc-msg err" style={{ display: 'block', textDecoration: 'none' }}>
          {claims > 0 ? `Someone has paid a release clause on ${claims === 1 ? 'one of your players' : `${claims} of your players`}. Match or let go within 24 hours. ` : ''}
          {offers > 0 ? `${offers} offer${offers === 1 ? '' : 's'} on your pending free agents.` : ''} →
        </Link>
      )}
      {news.length > 0 && (
        <div className="kc-news">
          {news.map((t) => (
            <div key={t.id}>
              <span className="kc-kind">{KIND[t.kind] ?? t.kind}</span>
              <span>{t.player_id ? <b>{name(t.player_id)}</b> : null}{t.player_id && t.from_team && t.to_team && t.from_team !== t.to_team ? ` ${team(t.from_team)} → ${team(t.to_team)}` : ''}{t.note ? `${t.player_id ? ' · ' : ''}${t.note}` : ''}{t.fee_kt ? ` · ${kt(t.fee_kt)}` : ''}</span>
              <span className="muted" style={{ fontSize: 12 }}>{ago(t.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
