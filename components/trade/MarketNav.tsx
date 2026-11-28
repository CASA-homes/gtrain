// Trademarket sections: the market, the trade desk (make a trade, list a player), free agents and the planner.
import Link from 'next/link';

const NAV = [['market', '/market', 'The market'], ['desk', '/market/desk', 'Trade desk'], ['free-agents', '/market/free-agents', 'Free agents'], ['planner', '/market/planner', 'Planner']] as const;
export type MarketSection = (typeof NAV)[number][0];

export function MarketNav({ active }: { active: MarketSection }) {
  return (
    <nav className="th-acts th-nav" aria-label="Trademarket">
      {NAV.map(([k, href, label]) => <Link key={k} href={href} className={`th-btn${k === active ? ' dk' : ''}`} aria-current={k === active ? 'page' : undefined}>{label}</Link>)}
    </nav>
  );
}
