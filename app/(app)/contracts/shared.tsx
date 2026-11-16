import type { ContractsData, KcSettings } from '@/lib/contracts';
import { kt, moneyK } from '@/lib/contracts';

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

const KIND: Record<string, [string, string, string]> = {
  clause: ['CLAUSE', '#f6e3d8', '#8a3816'], auction: ['AUCTION', '#f3ebd9', '#6e5220'], free_agent: ['SIGNED', '#e4ebe3', '#2f4536'],
  release: ['RELEASED', '#f4f3ee', '#5b625c'], extension: ['EXTENDED', '#e4ebe3', '#2f4536'], tier: ['CLAUSE SET', '#f4f3ee', '#5b625c'], seed: ['LEAGUE', '#1c211e', '#ffffff'],
};

export function DealsFeed({ d, limit = 8 }: { d: ContractsData; limit?: number }) {
  const team = (id: number | null) => (id ? d.teams.find((t) => t.id === id)?.name ?? 'a club' : null);
  const who = (id: number | null) => (id ? d.players.get(id)?.name ?? 'A player' : null);
  const rows = d.transfers.filter((t) => t.kind !== 'tier').slice(0, limit);
  const levy = d.transfers.reduce((a, t) => a + t.levy_kt, 0);
  return (
    <section className="kc-card" aria-labelledby="feed-h">
      <h2 id="feed-h">Deals</h2>
      <div className="kc-feed" style={{ marginTop: 8 }}>
        {rows.length === 0 && <p className="kc-sub">Nothing yet.</p>}
        {rows.map((t) => {
          const [label, bg, fg] = KIND[t.kind] ?? [t.kind.toUpperCase(), '#f4f3ee', '#5b625c'];
          const p = who(t.player_id), from = team(t.from_team), to = team(t.to_team);
          const text = t.kind === 'clause' ? `${to} paid ${p}’s release clause at ${from}: ${kt(t.fee_kt)}`
            : t.kind === 'auction' ? `${from} sold ${p} to ${to} at auction: ${kt(t.fee_kt)}`
            : t.kind === 'free_agent' ? `${to} signed free agent ${p}${t.note ? ` · ${t.note}` : ''}`
            : t.kind === 'release' ? `${from} released ${p}${t.note ? ` · ${t.note}` : ''}`
            : t.kind === 'extension' ? `${from} extended ${p}${t.note ? ` · ${t.note}` : ''}`
            : t.note ?? '';
          return (
            <div key={t.id}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="kc-kind" style={{ background: bg, color: fg }}>{label}</span>
                <span className="muted" style={{ fontSize: 12 }}>{new Date(t.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.4 }}>{text}</p>
            </div>
          );
        })}
      </div>
      {levy > 0 && <p className="kc-sub" style={{ marginTop: 8 }}>Transfer levy burned so far: <strong>{kt(levy)}</strong></p>}
    </section>
  );
}

export function Rules({ s }: { s: KcSettings }) {
  const items = [
    `Keep 17 + 1 rookie under the ${moneyK(s.keeper_cap_k)} keeper cap at lock-in. You can go up to ${moneyK(s.deficit_max_k)} over; the overage comes off next year's keeper cap, and you can't do it two years running.`,
    `In season the whole list must fit under ${moneyK(s.season_cap_k)}.`,
    `Contracts run 1–${s.max_years} years. Longer is cheaper per year. Draftees sign one-season deals priced by round (rookies half).`,
    `Nobody changes clubs mid-season. Players only move at season end. Coach-to-coach trades still run on the Trademarket.`,
    `Release clauses are set at signing: standard ${s.clause_std_pct}% of market value, high ${s.clause_high_pct}% (+${s.high_pct}% salary), none (+${s.none_pct}% salary). Paid only in the mid-season window, max ${s.max_buys} per club. A player has a clause right up to his last 6 months: final-year players keep theirs through the window.`,
    `A paid clause gives his club 24 hours to match (pay the same, burned; his clause steps up a level). If they don't, they're paid now (less ${s.levy_pct}%) and he joins the buyer straight away on the rest of his contract; the buyer drops a player to make room.`,
    `Extend a player any time, up to ${s.max_years} seasons out. Added years cost his market value now (home-grown players ${s.home_grown_pct}% off) plus ${s.ext_premium_pct}%, and a ${s.ext_fee_kt} KT fee. He's then locked for 12 months. When the mid-season window closes, every final-year player not re-signed (draftees too) becomes a free agent: rivals bid, his club picks one, and he moves at season end.`,
    `Releasing a player under contract costs a KT fee of ${s.release_fee_pct}% of what's left on his deal, plus dead money on your cap: 50% of his salary this season and 20% for each season after that.`,
  ];
  return (
    <section className="kc-card brass" aria-labelledby="rules-h">
      <h2 id="rules-h">The rules</h2>
      <ul style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#4d3a16' }}>
        {items.map((t) => <li key={t}>{t}</li>)}
      </ul>
    </section>
  );
}
