import Link from 'next/link';
import { AvgChip, ClubDot } from '@/components/bits';
import { DraftProfileCard } from '@/components/DraftProfileCard';
import { YearSelect } from '@/components/YearSelect';
import { getLeague } from '@/lib/data';
import { bestSeason, current, DRAFT_YEARS, DRAFTEES, draftStatus, type DraftStatus } from '@/lib/draft-history';
import { draftProfileFor } from '@/lib/draft-profiles';
import { PHANTOM_2026, PHANTOM_2026_SOURCE } from '@/lib/phantom-2026';
import { C } from '@/lib/ratings';

const STATUS_STYLE: Record<DraftStatus, { bg: string; fg: string }> = {
  Active: { bg: '#d8ecd0', fg: '#1f6b3a' },
  'Yet to debut': { bg: '#f1e8a8', fg: '#151a16' },
  'Delisted / retired': { bg: '#eceee9', fg: '#6b726c' },
  'Never played': { bg: '#eceee9', fg: '#6b726c' },
};

export default async function DraftHistoryPage({ searchParams }: { searchParams: Promise<{ year?: string; top?: string }> }) {
  const sp = await searchParams;
  const league = await getLeague();
  const year = sp.year === '2026' ? 2026 : DRAFT_YEARS.includes(Number(sp.year)) ? Number(sp.year) : 2022;
  const top = sp.top === '1';
  const years = [{ value: '2026', label: '2026 (phantom)' }, ...DRAFT_YEARS.map((y) => ({ value: String(y), label: String(y) }))];
  const tabs = (
    <div role="tablist" aria-label="Draft section" style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: 'var(--line)', gap: 2 }}>
      {([['G-Train picks', '/draft', false], ['AFL draft review', '/draft/history', true]] as const).map(([label, href, on]) => (
        <Link key={href} href={href} role="tab" aria-selected={on}
          style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', background: on ? '#fff' : 'transparent', color: on ? C.ink : C.muted, boxShadow: on ? '0 1px 2px rgb(0 0 0 / .08)' : 'none' }}>{label}</Link>
      ))}
    </div>
  );
  const header = (
    <div className="row-between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <span className="eyebrow">Every national draft pick since 2016, and what they’re doing now</span>
        <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>AFL draft review</h1>
      </div>
      {tabs}
    </div>
  );

  if (year === 2026) {
    return (
      <div className="wrap">
        {header}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <YearSelect years={years} value="2026" />
          <span className="muted" style={{ fontSize: 13 }}>
            Projected order from <a href={PHANTOM_2026_SOURCE.url} target="_blank" rel="noreferrer">{PHANTOM_2026_SOURCE.title}</a> ({PHANTOM_2026_SOURCE.date}). It’s a ranking, not a mock draft. We’ll swap in the real order after the draft.
          </span>
        </div>
        <div className="table-box">
          <table className="squad" style={{ minWidth: 640 }}>
            <thead><tr><th style={{ width: 54 }}>Rank</th><th>Prospect</th><th>From</th><th>Position</th><th>Draft profile</th></tr></thead>
            <tbody>
              {PHANTOM_2026.map((p) => {
                const prof = draftProfileFor(2026, p.name);
                return (
                  <tr key={p.rank}>
                    <td className="mono" style={{ fontWeight: 600 }}>{p.rank}</td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{p.name}</td>
                    <td className="muted">{p.from || '–'}</td>
                    <td>{p.position || '–'}</td>
                    <td>{prof ? <details><summary style={{ cursor: 'pointer' }}>View</summary><div style={{ paddingTop: 10 }}><DraftProfileCard d={prof} compact /></div></details> : <span className="muted">Coming</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const byDfs = new Map(league.players.filter((p) => p.dfs_id).map((p) => [p.dfs_id!, p]));
  const rows = DRAFTEES.filter((d) => d.y === year).sort((a, b) => a.p - b.p).map((d) => {
    const g = d.id ? byDfs.get(d.id) : undefined;
    const st = draftStatus(d, !!g, g?.list_status ?? null);
    return { d, g, st, cur: current(d), best: bestSeason(d), games: (d.h ?? []).reduce((s, h) => s + h[1], 0), prof: draftProfileFor(d.y, d.n) };
  });
  const topIds = new Map(
    rows.filter((r) => r.cur && r.cur.games >= 5).sort((a, b) => b.cur!.avg - a.cur!.avg).slice(0, 10).map((r, i) => [r.d.p, i + 1]),
  );
  const active = rows.filter((r) => r.st.status === 'Active').length;
  const owner = (teamId: number) => league.teams.find((t) => t.id === teamId)?.name ?? '';

  return (
    <div className="wrap">
      {header}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <YearSelect years={years} value={String(year)} />
          <Link href={`/draft/history?year=${year}${top ? '' : '&top=1'}`} className="btn" aria-pressed={top}
            style={top ? { background: C.green5, color: '#fff', borderColor: C.green5 } : undefined}>
            {top ? '★ Showing best 10 now' : '★ Highlight best 10 now'}
          </Link>
        </div>
        <span className="muted" style={{ fontSize: 13 }}>{rows.length} picks · {active} still on an AFL list · best 10 by 2026 AFL Fantasy average (5+ games)</span>
      </div>

      <div className="table-box">
        <table className="squad" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ width: 46 }}>Pick</th><th>Player</th><th style={{ width: 150 }}>Drafted by</th><th>Recruited from</th>
              <th style={{ width: 22, padding: 0 }} aria-hidden="true" />
              <th style={{ width: 150 }}>Status</th><th style={{ width: 90, textAlign: 'center' }}>2026 avg</th><th style={{ width: 70, textAlign: 'center' }}>Games</th><th style={{ width: 110 }}>Best season</th><th>G-Train</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ d, g, st, cur, best, games, prof }) => {
              const rank = topIds.get(d.p);
              const lit = top && rank;
              const grey = st.status === 'Delisted / retired' || st.status === 'Never played';
              const s = STATUS_STYLE[st.status];
              return (
                <tr key={d.p} style={{ opacity: grey && !lit ? 0.45 : 1, background: lit ? '#eef6ea' : undefined, boxShadow: lit ? `inset 4px 0 0 ${C.green5}` : undefined }}>
                  <td className="mono" style={{ fontWeight: 600 }}>{d.p}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {g ? <Link href={`/players/${g.id}`} style={{ fontWeight: 600 }}>{d.n}</Link> : <span style={{ fontWeight: 600 }}>{d.n}</span>}
                    {lit && <span className="pill" style={{ marginLeft: 8, background: C.green5, color: '#fff' }}>#{rank}</span>}
                    {prof && (
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ cursor: 'pointer', fontSize: 12, color: C.muted }}>Draft profile</summary>
                        <div style={{ padding: '10px 0', whiteSpace: 'normal', maxWidth: 640 }}><DraftProfileCard d={prof} compact /></div>
                      </details>
                    )}
                  </td>
                  <td><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><ClubDot code={d.c} size={14} />{d.c}</span></td>
                  <td className="muted" style={{ fontSize: 13 }}>{d.f}{d.l ? ` · ${d.l}` : ''}</td>
                  <td aria-hidden="true" style={{ padding: 0, borderLeft: '2px solid var(--line)' }} />
                  <td><span className="pill" style={{ background: s.bg, color: s.fg }}>{st.status}</span>{grey && st.last ? <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>last {st.last}</span> : null}</td>
                  <td style={{ textAlign: 'center' }}>{cur ? <AvgChip value={cur.avg} /> : <span className="muted">–</span>}</td>
                  <td style={{ textAlign: 'center' }} className="mono">{games || '–'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{best ? `${Math.round(best.avg)} (’${String(best.year).slice(2)})` : '–'}</td>
                  <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{g ? owner(g.team_id) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        Draft order from each year’s Wikipedia draft page; careers and averages from DFS Australia. Status is our best read: anyone who played in 2026 or is on a G-Train list counts as active. Players who missed 2026 injured but are still listed may show as delisted until they play again.
      </p>
    </div>
  );
}
