// A small Contracts & cap summary for the clubhouse. Shows nothing until the commish has set contracts up.
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

const moneyK = (k: number) => `$${Math.round(k).toLocaleString('en-AU')}k`;

export async function ContractsStrip({ teamId, mine }: { teamId: number; mine: boolean }) {
  const supabase = await createClient();
  const set = await supabase.from('kc_settings').select('season, keeper_cap_k, season_cap_k, tax_line_k, shadow, seeded_at, window_open').maybeSingle();
  const s = set.data as { season: number; keeper_cap_k: number; season_cap_k: number; tax_line_k: number; shadow: boolean; seeded_at: string | null; window_open: boolean } | null;
  if (set.error || !s?.seeded_at) return null;
  const [sal, bank, fy] = await Promise.all([
    supabase.rpc('kc_salary', { t: teamId, s: s.season }),
    supabase.rpc('kc_bank', { t: teamId }),
    supabase.from('kc_contracts').select('id', { count: 'exact', head: true }).eq('team_id', teamId).eq('status', 'active').lte('end_season', s.season),
  ]);
  const salary = Number(sal.data ?? 0), over = salary - s.keeper_cap_k;
  return (
    <Link href={`/contracts/${teamId}`} className="card" style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: '10px 28px', alignItems: 'center', textDecoration: 'none', color: 'inherit', borderColor: 'var(--khq-line)', background: 'var(--khq-bg)' }}>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="eyebrow">Contracts & cap{s.shadow ? ' · shadow season' : ''}</span>
        <b style={{ font: '600 16px var(--font)' }}>{mine ? 'Your contracts' : 'Their contracts'} →</b>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column' }}><span className="eyebrow">Keeper cap</span><b className="num" style={{ color: over > 0 ? '#a8461f' : undefined }}>{moneyK(salary)} / {moneyK(s.keeper_cap_k)}</b></span>
      <span style={{ display: 'flex', flexDirection: 'column' }}><span className="eyebrow">Bank</span><b className="num">{Number(bank.data ?? 0).toLocaleString('en-AU')} KT</b></span>
      <span style={{ display: 'flex', flexDirection: 'column' }}><span className="eyebrow">Final-year players</span><b className="num">{fy.count ?? 0}</b></span>
      {s.window_open && <span className="pill" style={{ background: '#e4ebe3', color: '#2f4536' }}>Window open</span>}
    </Link>
  );
}
