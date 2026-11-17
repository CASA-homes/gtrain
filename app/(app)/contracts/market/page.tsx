// The old transfer market now lives on the Trademarket home and its "All" pages.
import { redirect } from 'next/navigation';

export default async function TransferMarket({ searchParams }: { searchParams: Promise<{ line?: string }> }) {
  const { line } = await searchParams;
  redirect(line ? `/market/clauses?line=${encodeURIComponent(line)}` : '/market');
}
