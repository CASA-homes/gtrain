import Link from 'next/link';
import { MarketSub } from '@/components/trade/MarketSub';
import { ago, getMarket } from '@/lib/market';
import '@/components/trade/home.css';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const m = await getMarket();
  return (
    <div className="th"><main className="th-main">
      <MarketSub tab="transactions" title="Transactions" sub="Every signing, extension, release, clause, auction and approved trade, newest first." />
      <section className="th-card">
        {m.feed.map((f) => (
          <div key={f.id} className="th-feed"><span className={`th-ico ${f.tone}`}>{f.tag}</span>
            <span><b>{f.player_id ? <Link href={`/players/${f.player_id}`}>{f.title}</Link> : f.title}</b><span className="s">{f.sub}</span></span>
            <span className="th-mut" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{ago(f.at)}</span></div>
        ))}
        {!m.feed.length && <p className="th-mut" style={{ margin: 0 }}>Nothing yet.</p>}
      </section>
    </main></div>
  );
}
