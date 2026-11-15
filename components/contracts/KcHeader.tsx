import Link from 'next/link';
import { KcClock } from '@/components/contracts/client';
import type { KcSettings } from '@/lib/contracts';
import './contracts.css';

type Tab = 'overview' | 'club' | 'market' | 'admin';

export function KcHeader({ settings, title, crumb, sub, kpis, tab, myTeamId, isCommish, children }: {
  settings: KcSettings | null; title: string; crumb: string; sub?: React.ReactNode; tab: Tab; myTeamId?: number | null; isCommish?: boolean;
  kpis?: { label: string; value: string; note?: string; bad?: boolean }[]; children?: React.ReactNode;
}) {
  const open = !!settings?.window_open && !!settings.window_closes_at && new Date(settings.window_closes_at) > new Date();
  return (
    <>
      <div className="kc-hero">
        <div className="kc-hero-in">
          <div>
            <span className="kc-crumb">{crumb}</span>
            <h1>{title}</h1>
            {sub && <p>{sub}</p>}
          </div>
          {kpis && kpis.length > 0 && (
            <div className="kc-hero-kpis">
              {kpis.map((k) => (
                <div key={k.label} className="kc-hero-kpi"><span>{k.label}</span><b>{k.value}</b>{k.note && <em className={k.bad ? 'bad' : ''}>{k.note}</em>}</div>
              ))}
            </div>
          )}
        </div>
        <div className="kc-hero-in" style={{ marginTop: 18, alignItems: 'center' }}>
          <nav className="kc-tabs" aria-label="Contracts">
            <Link href="/contracts" aria-current={tab === 'overview' ? 'page' : undefined} style={tab === 'overview' ? undefined : { color: '#c9d4cb' }}>League</Link>
            {myTeamId ? <Link href={`/clubhouse/${myTeamId}?view=contracts`} aria-current={tab === 'club' ? 'page' : undefined} style={tab === 'club' ? undefined : { color: '#c9d4cb' }}>My contracts</Link> : null}
            <Link href="/contracts/market" aria-current={tab === 'market' ? 'page' : undefined} style={tab === 'market' ? undefined : { color: '#c9d4cb' }}>Transfer Market</Link>
            {isCommish && <Link href="/contracts/admin" aria-current={tab === 'admin' ? 'page' : undefined} style={tab === 'admin' ? undefined : { color: '#c9d4cb' }}>Commish</Link>}
          </nav>
          {children}
        </div>
      </div>
      <div className="kc-strip">
        <div className="kc-strip-in">
          {settings?.shadow && <span className="kc-shadow">SHADOW SEASON</span>}
          <span className={`kc-live${open ? '' : ' off'}`}><i />{open ? 'MID-SEASON WINDOW OPEN' : settings?.midseason_at ? 'WINDOW CLOSED · PENDING FREE AGENCY ON' : 'WINDOW CLOSED'}</span>
          {open && settings?.window_closes_at && <span style={{ color: '#c9d4cb' }}>Closes in <KcClock endsAt={settings.window_closes_at} /></span>}
          <span style={{ color: '#a9b5aa' }}>
            {settings?.shadow ? 'Paper league: moves here never change real lists, tokens or picks.' : 'Contracts are live.'}
          </span>
        </div>
      </div>
    </>
  );
}
