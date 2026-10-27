import { ScoresBoard } from '@/components/live/kit';
import { FeedDown } from '../FeedDown';
import { loadLive } from '../load';

export const metadata = { title: 'Live scores' };
export const dynamic = 'force-dynamic';

export default async function ScoresPage({ searchParams }: { searchParams: Promise<{ round?: string }> }) {
  const sp = await searchParams;
  const { data, error } = await loadLive(Number(sp.round) || undefined);
  if (!data) return <FeedDown error={error} />;
  return <ScoresBoard initial={data} />;
}
