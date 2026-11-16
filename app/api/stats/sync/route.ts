// Commish-only: pull raw match stats from AFL Tables or Footywire, work out fantasy points, and store them.
//   GET /api/stats/sync?source=afltables&season=2026            all 18 clubs in one go
//   GET /api/stats/sync?source=footywire&season=2026&from=0&n=20  a batch of matches (call again with the next "from")
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/data';
import { aflTablesSeason, footywireMatch, footywireMatches, type RawLine } from '@/lib/stats/sources';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const source = u.searchParams.get('source');
  const season = Number(u.searchParams.get('season') ?? new Date().getFullYear());
  const last = Number(u.searchParams.get('last') ?? 24);
  const supabase = await createClient();
  const me = await getMe();
  if (!me?.is_commish) return NextResponse.json({ error: 'Only the commish can sync stats' }, { status: 403 });

  try {
    let lines: RawLine[] = [];
    let next: number | null = null; let total: number | null = null;
    if (source === 'afltables') {
      lines = await aflTablesSeason(season, last);
    } else if (source === 'footywire') {
      const from = Number(u.searchParams.get('from') ?? 0), n = Math.min(30, Number(u.searchParams.get('n') ?? 20));
      const mids = await footywireMatches(season);
      total = mids.length;
      const batch = mids.slice(from, from + n);
      for (let i = 0; i < batch.length; i += 5) lines.push(...(await Promise.all(batch.slice(i, i + 5).map((m) => footywireMatch(m, season, last)))).flat());
      next = from + n < mids.length ? from + n : null;
    } else {
      return NextResponse.json({ error: 'source must be afltables or footywire' }, { status: 400 });
    }
    let stored = 0;
    for (let i = 0; i < lines.length; i += 1000) {
      const { data, error } = await supabase.rpc('stats_upsert', { rows: lines.slice(i, i + 1000) });
      if (error) throw new Error(error.message);
      stored += Number(data ?? 0);
    }
    return NextResponse.json({ source, season, lines: lines.length, stored, next, total });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
