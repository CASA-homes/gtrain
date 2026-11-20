import Link from 'next/link';
import { SubHead } from '@/components/LeagueSubpage';

export const metadata = { title: 'Import your league' };

// Placeholder until the importer ships (spreadsheet first, then screenshots).
export default function ImportPage() {
  return (
    <div className="wrap stack" style={{ gap: 14 }}>
      <SubHead eyebrow="League" title="Import your league" sub="Bring your rosters across from another app" />
      <div className="card" style={{ padding: 18 }}>
        <p style={{ margin: 0 }}>The importer is nearly ready. Your league is set up, so you can invite your coaches now and import rosters as soon as it lands.</p>
        <p style={{ margin: '12px 0 0' }}><Link href="/clubhouse">Go to your clubhouse</Link></p>
      </div>
    </div>
  );
}
