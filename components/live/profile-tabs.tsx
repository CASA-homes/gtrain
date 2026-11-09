'use client';
// Player pop-up body, shared by Squad Selector and Matchups: three tabs.
// This round (passed in by each sheet), the 2026 season, and his scores for your club (only the rounds he was on your field).
import { useEffect, useState } from 'react';
import { loadClubRows } from '@/app/(app)/live/club-rows-action';
import type { MProfile } from '@/lib/mens-round';

type Tab = 'round' | 'season' | 'club';

export function ProfileTabs({ roundLabel, round, prof, proj, clubName, defaultTab = 'season', fullName }: {
  roundLabel: string; round: React.ReactNode; prof: MProfile | undefined; proj: number; clubName: string | null; defaultTab?: Tab;
  /** when the club rows weren't sent with the page, fetch them for this player when the tab opens */
  fullName?: string;
}) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const tabs: [Tab, string][] = defaultTab === 'season' ? [['season', '2026 season'], ['round', roundLabel]] : [['round', roundLabel], ['season', '2026 season']];
  tabs.push(['club', clubName ? `For ${clubName}` : 'For your club']);
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
        {tab === 'round' ? round : tab === 'season' ? <SeasonPane prof={prof} proj={proj} /> : <ClubPane prof={prof} clubName={clubName} fullName={fullName} />}
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
          <div className="mx-bars sc" aria-label="2026 scores by round">
            <i className="mx-projline" style={{ bottom: `${(proj / maxBar) * 100}%` }} title={`2027 projection ${proj}`} />
            {log.map(([r, sc, tog]) => (
              <button key={r} className={`mx-bar ${pick === r ? 'on' : ''}`} onClick={() => setPick(pick === r ? null : r)} aria-label={`Round ${r}: ${sc}${tog != null ? `, ${tog}% time on ground` : ''}`}>
                <i style={{ height: `${(sc / maxBar) * 100}%`, background: sc >= 100 ? '#10a35a' : sc >= proj ? '#7ccf8f' : sc >= proj * 0.75 ? '#e5c84f' : '#f39a4a' }} />
                <small className="rh-mono">{sc}</small>
                <em>{r}</em>
              </button>
            ))}
          </div>
        ) : <span className="rh-dim" style={{ fontSize: 13 }}>No 2026 games on record.</span>}
        {log.length > 0 && <span className="rh-dim" style={{ fontSize: 12 }}>{g ? <><b style={{ color: 'var(--rh-text)' }}>Round {g[0]}: {g[1]}</b>{g[2] != null ? ` · ${g[2]}% TOG` : ''}</> : <>Dashed line: his 2027 projection ({proj}). Tap a bar for that round.</>}</span>}
      </div>
      {statLine.length > 0 && (
        <div className="mx-sh-sec"><span className="rh-k">Averages per game</span>
          <div className="mx-statline one">{statLine.map(([k, v]) => <span key={k}><b className="rh-mono">{v}</b><em>{k}</em></span>)}</div>
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

function ClubPane({ prof, clubName, fullName }: { prof: MProfile | undefined; clubName: string | null; fullName?: string }) {
  const [fetched, setFetched] = useState<MProfile['club'] | null>(null);
  const need = !prof?.club && !!fullName && !!clubName && !!prof;
  useEffect(() => {
    if (!need) return;
    let on = true;
    loadClubRows(fullName!, clubName!, prof!.log).then((r) => { if (on) setFetched(r); }).catch(() => { if (on) setFetched([]); });
    return () => { on = false; };
  }, [need, fullName, clubName, prof]);
  if (need && fetched == null) return <span className="rh-dim" style={{ fontSize: 13 }}>Loading his rounds for {clubName}…</span>;
  const rows = prof?.club ?? fetched ?? [];
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

/** One AFL game in full: score, time on ground, centre bounces, quarter by quarter, where he got the ball, and the AFL heat map. */
export function RoundDetail({ g, playerNo, proj }: { g: [number, string | null, string | null, number, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, string | null] | null; playerNo: string | null; proj?: number | null }) {
  if (!g) return <span className="rh-dim" style={{ fontSize: 13 }}>He didn&apos;t play an AFL game this round.</span>;
  const qs = [g[6], g[7], g[8], g[9]], zones: [string, number | null][] = [['D50', g[10]], ['D-mid', g[11]], ['A-mid', g[12]], ['A50', g[13]]];
  const qMax = Math.max(30, ...qs.map((x) => x ?? 0));
  const zTot = zones.reduce((a, [, v]) => a + (v ?? 0), 0);
  const heat = g[14] && playerNo ? `https://s.afl.com.au/heatmaps/2026/match-${g[14]}-${playerNo}.png` : null;
  return (
    <>
      <div className="pt-tiles">
        <div><b className="rh-mono">{g[3]}</b><span>{proj != null ? `Score · 2026 avg ${proj}` : 'Score'}</span></div>
        <div><b className="rh-mono">{g[4] ?? '–'}%</b><span>Time on ground</span></div>
        <div><b className="rh-mono">{g[5] ?? '–'}%</b><span>Centre bounces</span></div>
        <div><b className="rh-ellip">v {g[1] ?? '–'}</b><span>{g[2] ?? ''}</span></div>
      </div>
      <div className="mx-sh-sec"><span className="rh-k">Quarter by quarter</span>
        <div className="rd-qs">{qs.map((q, i) => (
          <div key={i}><span className="rd-qbar"><i style={{ height: `${Math.max(0, (q ?? 0) / qMax) * 100}%` }} /></span><b className="rh-mono">{q ?? '–'}</b><em>Q{i + 1}</em></div>
        ))}</div>
      </div>
      <div className="mx-sh-sec"><span className="rh-k">Where he won the ball · {zTot} possessions</span>
        <div className="rd-zones">{zones.map(([k, v]) => <div key={k} style={{ flexGrow: Math.max(1, v ?? 0) }}><b className="rh-mono">{v ?? 0}</b><em>{k}</em></div>)}</div>
      </div>
      <div className="mx-sh-sec"><span className="rh-k">Heat map</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {heat ? <img src={heat} alt={`Heat map v ${g[1]}`} className="rd-heat" loading="lazy" /> : <span className="rh-dim" style={{ fontSize: 13 }}>No heat map for this game.</span>}
        {heat && <span className="rh-dim" style={{ fontSize: 11.5 }}>AFL heat map: red is where he spent the most time.</span>}
      </div>
    </>
  );
}
