'use client';
// Player pop-up body, shared by Squad Selector and Matchups: three tabs.
// This round (passed in by each sheet), the 2026 season, and his scores for your club (only the rounds he was on your field).
import { useState } from 'react';
import type { MProfile } from '@/lib/mens-round';

type Tab = 'round' | 'season' | 'club';

export function ProfileTabs({ roundLabel, round, prof, proj, clubName }: {
  roundLabel: string; round: React.ReactNode; prof: MProfile | undefined; proj: number; clubName: string | null;
}) {
  const [tab, setTab] = useState<Tab>('round');
  const tabs: [Tab, string][] = [['round', roundLabel], ['season', '2026 season'], ['club', clubName ? `For ${clubName}` : 'For your club']];
  return (
    <>
      <div className="pt-tabs" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" id={`pt-${k}`} aria-selected={tab === k} className={`pt-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            <span className="rh-ellip">{l}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={`pt-${tab}`} className="pt-pane">
        {tab === 'round' ? round : tab === 'season' ? <SeasonPane prof={prof} proj={proj} /> : <ClubPane prof={prof} clubName={clubName} />}
      </div>
    </>
  );
}

function SeasonPane({ prof, proj }: { prof: MProfile | undefined; proj: number }) {
  const [pick, setPick] = useState<number | null>(null);
  const log = prof?.log ?? [], scores = log.map((g) => g[1]);
  const hi = scores.length ? Math.max(...scores) : null, lo = scores.length ? Math.min(...scores) : null;
  const l5 = scores.slice(-5), l5avg = l5.length ? Math.round(l5.reduce((a, b) => a + b, 0) / l5.length) : null;
  const tons = scores.filter((x) => x >= 100).length;
  const maxBar = Math.max(130, ...scores, proj);
  const b = prof?.box;
  const statLine: [string, string][] = b ? ([['K', b.k], ['HB', b.h], ['D', b.k != null && b.h != null ? b.k + b.h : null], ['M', b.m], ['T', b.t], ['G', b.g], ['B', b.b], ['HO', b.ho || null], ['CP', b.cp], ['CL', b.cl], ['DE%', b.de], ['TOG%', b.tog], ['CBA%', b.cba]] as [string, number | null | undefined][])
    .filter(([, v]) => v != null).map(([k, v]) => [k, Number.isInteger(v) ? String(v) : (v as number).toFixed(1)]) : [];
  const g = log.find((x) => x[0] === pick);
  return (
    <>
      <div className="pt-tiles">
        <div><b className="rh-mono">{prof?.avg?.toFixed(1) ?? '–'}</b><span>Average</span></div>
        <div><b className="rh-mono">{prof?.games ?? scores.length}</b><span>Games</span></div>
        <div><b className="rh-mono">{hi ?? '–'}</b><span>Highest</span></div>
        <div><b className="rh-mono">{tons}</b><span>Tons</span></div>
      </div>
      <div className="mx-sh-sec">
        <div className="mx-sh-row"><span className="rh-k">2026 scores by AFL round</span><span className="rh-dim rh-mono" style={{ fontSize: 12 }}>L5 {l5avg ?? '–'} · low {lo ?? '–'}</span></div>
        {log.length ? (
          <div className="mx-bars" aria-label="2026 scores by round">
            <i className="mx-projline" style={{ bottom: `${(proj / maxBar) * 100}%` }} title={`2027 projection ${proj}`} />
            {log.map(([r, sc, tog]) => (
              <button key={r} className={`mx-bar ${pick === r ? 'on' : ''}`} onClick={() => setPick(pick === r ? null : r)} aria-label={`Round ${r}: ${sc}${tog != null ? `, ${tog}% time on ground` : ''}`}>
                <i style={{ height: `${(sc / maxBar) * 100}%`, background: sc >= 100 ? '#10a35a' : sc >= proj ? '#7ccf8f' : sc >= proj * 0.75 ? '#e5c84f' : '#f39a4a' }} />
                <em>{r}</em>
              </button>
            ))}
          </div>
        ) : <span className="rh-dim" style={{ fontSize: 13 }}>No 2026 games on record.</span>}
        {log.length > 0 && <span className="rh-dim" style={{ fontSize: 12 }}>{g ? <><b style={{ color: 'var(--rh-text)' }}>Round {g[0]}: {g[1]}</b>{g[2] != null ? ` · ${g[2]}% TOG` : ''}</> : <>Dashed line: his 2027 projection ({proj}). Tap a bar for that round.</>}</span>}
      </div>
      {statLine.length > 0 && (
        <div className="mx-sh-sec"><span className="rh-k">Averages per game</span>
          <div className="mx-statline">{statLine.map(([k, v]) => <span key={k}><b className="rh-mono">{v}</b><em>{k}</em></span>)}</div>
        </div>
      )}
      {prof && prof.hist.length > 0 && (
        <div className="mx-sh-sec"><span className="rh-k">Career</span>
          <table className="mx-hist"><thead><tr><th>Season</th><th>Games</th><th>Avg</th><th /></tr></thead>
            <tbody>{prof.hist.map(([y, gm, a]) => <tr key={y}><td>{y}</td><td className="rh-mono">{gm}</td><td className="rh-mono">{a.toFixed(1)}</td><td><span className="mx-histbar"><i style={{ width: `${Math.min(100, a / 1.3)}%` }} /></span></td></tr>)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ClubPane({ prof, clubName }: { prof: MProfile | undefined; clubName: string | null }) {
  const rows = prof?.club ?? [];
  const counted = rows.filter((r) => r.sc != null && !r.cup);
  const avg = counted.length ? counted.reduce((a, r) => a + (r.sc ?? 0), 0) / counted.length : null;
  const w = counted.filter((r) => r.res === 'W').length, l = counted.filter((r) => r.res === 'L').length;
  const best = counted.reduce<typeof counted[number] | null>((a, r) => (!a || (r.sc ?? 0) > (a.sc ?? 0) ? r : a), null);
  if (!rows.length) return <span className="rh-dim" style={{ fontSize: 13 }}>He hasn&apos;t played a game for {clubName ?? 'this club'} yet. Rounds show here once he&apos;s on your field.</span>;
  return (
    <>
      <div className="pt-tiles">
        <div><b className="rh-mono">{counted.length}</b><span>Games for you</span></div>
        <div><b className="rh-mono">{avg != null ? avg.toFixed(1) : '–'}</b><span>Average</span></div>
        <div><b className="rh-mono">{w}–{l}</b><span>Record with him</span></div>
        <div><b className="rh-mono">{best?.sc ?? '–'}</b><span>{best ? `Best · ${/^F/.test(best.rd) ? best.rd : `R${best.rd}`}` : 'Best'}</span></div>
      </div>
      <div className="pt-club">
        <table className="pt-club-t">
          <thead><tr><th>Rd</th><th className="l">Opponent</th><th>Result</th><th>Score</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.season}-${r.cup ? 'c' : ''}${r.rd}`} className={r.sc == null ? 'dnp' : ''}>
                <td className="rh-mono">{r.cup ? `Cup ${r.rd}` : r.rd}</td>
                <td className="l"><span className="rh-ellip">{r.opp}</span></td>
                <td>{r.cup ? <i className="pt-res cup">CUP</i> : <><i className={`pt-res ${r.res}`}>{r.res || '–'}</i>{r.f != null && <span className="rh-dim rh-mono"> {r.f}–{r.a}</span>}</>}</td>
                <td className="rh-mono"><b>{r.sc ?? 'DNP'}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="rh-dim" style={{ fontSize: 12 }}>2026 G-Train, only the rounds he was on your field (bench weeks aren&apos;t counted). DNP: named, but didn&apos;t play that AFL round. Cup games show as their own rows from 2027.</span>
    </>
  );
}
