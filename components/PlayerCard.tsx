'use client';
import { useState } from 'react';

/** One 2026 game: round, opponent, venue, score, TOG %, CBA %, Q1–Q4 points, possessions by zone (D50, D-mid, A-mid, A50), heat map id. */
export type CardGame = [number | null, string | null, string | null, number, number | null, number | null, number | null, number | null, number | null, number | null,
  number | null, number | null, number | null, number | null, string | null];
export interface CardProps {
  playerNo: string | null;               // AFL champion id digits, for heat map images
  games: CardGame[];                     // 2026, in round order
  prev: [string | null, string | null, number][];   // 2025: opponent, venue, score
  pct: { label: string; value: string; pct: number }[];
  lineName: string;
  poolNote: string;
  seasons: [number, number, number][];  // [year, games, average], newest first
  current: number;
}

const tone = (s: number): [string, string] => s >= 120 ? ['#1f6b3a', '#fff'] : s >= 100 ? ['#4f9a5f', '#fff'] : s >= 80 ? ['#9ccb84', '#151a16'] : s >= 70 ? ['#d6e49a', '#151a16'] : s >= 50 ? ['#f1e8a8', '#151a16'] : ['#f3c2b9', '#7a1d12'];
const pctTone = (p: number) => (p >= 80 ? '#1f6b3a' : p >= 60 ? '#4f9a5f' : p >= 40 ? '#b59a2a' : '#c4573f');
const rnd = (r: number | null) => (r == null ? '' : r === 0 ? 'OR' : r >= 25 ? ['QF', 'SF', 'PF', 'GF'][Math.min(3, r - 25)] ?? `R${r}` : `R${r}`);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function Card({ title, note, o, children }: { title: string; note?: string; o?: number; children: React.ReactNode }) {
  return (
    <section className={`pc-card${o ? ` pc-o${o}` : ''}`}>
      <h3><span>{title}</span>{note && <small>{note}</small>}</h3>
      {children}
    </section>
  );
}

export function PlayerCard({ playerNo, games, prev, pct, lineName, poolNote, seasons, current }: CardProps) {
  const [heatIdx, setHeatIdx] = useState(() => {
    for (let i = games.length - 1; i >= 0; i--) if (games[i][14]) return i;
    return -1;
  });
  if (!games.length) return null;
  const scores = games.map((g) => g[3]);
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const n = scores.length;
  const bands: [string, number, string][] = [
    ['Under 70', scores.filter((s) => s < 70).length, '#f1e8a8'],
    ['70–99', scores.filter((s) => s >= 70 && s < 100).length, '#9ccb84'],
    ['100–119', scores.filter((s) => s >= 100 && s < 120).length, '#4f9a5f'],
    ['120+', scores.filter((s) => s >= 120).length, '#1f6b3a'],
  ];
  const under70 = bands[0][1] / n, over100 = (bands[2][1] + bands[3][1]) / n;
  const rangeNote = under70 === 0 ? 'Never dropped under 70.' : under70 >= 0.3 ? `Under 70 in ${Math.round(under70 * 100)}% of games: a risky floor.` : `Under 70 in ${bands[0][1]} of ${n} games.`;
  const rangeNote2 = over100 >= 0.5 ? ` ${Math.round(over100 * 100)}% of games were 100+.` : bands[3][1] ? ` ${bands[3][1]} game${bands[3][1] > 1 ? 's' : ''} of 120+.` : '';

  // Role: score bars with centre-bounce and time-on-ground lines.
  const W = 340, H = 120, bw = W / n, top = Math.max(150, ...scores);
  const cbas = games.map((g) => g[5]).filter((x): x is number => x != null);
  const mid = cbas.length && Math.max(...cbas) >= 30;
  const cut = mid ? (mean(cbas) >= 60 ? 75 : Math.round(mean(cbas) / 5) * 5) : null;
  const hi = cut != null ? games.filter((g) => (g[5] ?? 0) >= cut).map((g) => g[3]) : [];
  const lo = cut != null ? games.filter((g) => (g[5] ?? 0) < cut).map((g) => g[3]) : [];
  const togs = games.map((g) => g[4]).filter((x): x is number => x != null);
  const last5 = games.slice(-5);

  // Quarters
  const q = ([6, 7, 8, 9] as const).map((k) => mean(games.map((g) => g[k]).filter((x): x is number => x != null)));
  const qNote = q[3] < mean(q.slice(0, 3)) - 3 ? 'Fades in the last quarter.' : q[3] > mean(q.slice(0, 3)) + 3 ? 'Finishes strongest: best in the last quarter.' : q[0] > mean(q.slice(1)) + 3 ? 'Fast starter: does most damage early.' : 'Even across all four quarters.';

  // Zones: where he won the ball across the season, attacking left to right.
  const zones = ([10, 11, 12, 13] as const).map((k) => games.reduce((t, g) => t + (g[k] ?? 0), 0));
  const zt = zones.reduce((a, b) => a + b, 0);

  // Opponents and venues over two seasons
  const all = [...prev, ...games.map((g) => [g[1], g[2], g[3]] as [string | null, string | null, number])];
  const split = (i: 0 | 1, min: number) => {
    const m = new Map<string, number[]>();
    for (const r of all) if (r[i]) m.set(r[i]!, [...(m.get(r[i]!) ?? []), r[2]]);
    return [...m].filter(([, v]) => v.length >= min).map(([k, v]) => ({ k, avg: Math.round(mean(v)), gm: v.length }));
  };
  const opps = split(0, 2).sort((a, b) => b.avg - a.avg);
  const vens = split(1, 3).sort((a, b) => b.gm - a.gm).slice(0, 5);

  const heat = heatIdx >= 0 ? games[heatIdx] : null;
  const heatUrl = heat?.[14] && playerNo ? `https://s.afl.com.au/heatmaps/2026/match-${heat[14]}-${playerNo}.png` : null;
  const oRow = (o: { k: string; avg: number; gm: number }) => (
    <div key={o.k} className="pc-orow"><span>{o.k}</span><em>{o.gm} gm</em><b style={{ background: tone(o.avg)[0], color: tone(o.avg)[1] }}>{o.avg}</b></div>
  );

  return (
    <div className="pc-grid">
      <div className="pc-top">
      {seasons.length > 0 && (
        <Card title="Season averages" note={`${seasons.length} season${seasons.length > 1 ? 's' : ''} · AFL Fantasy`}>
          <div className="pc-form pc-season">
            {seasons.slice(0, 10).map(([y, gm, avg]) => (
              <div key={y} className="pc-fchip" title={`${y}: ${gm} games`}>
                <b style={{ background: tone(avg)[0], color: tone(avg)[1], outline: y === current ? '2px solid #151a16' : 'none', outlineOffset: 1 }}>{Math.round(avg)}</b>
                <span>’{String(y).slice(2)}</span><i>{gm} gm</i>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card title="Form" note={`all ${games.length} game${games.length === 1 ? '' : 's'} this season · tap one for its heat map`}>
        <div className="pc-form pc-season">
          {games.map((g, idx) => {
            return (
              <button key={idx} type="button" onClick={() => setHeatIdx(idx)} aria-pressed={heatIdx === idx} className="pc-fchip">
                <b style={{ background: tone(g[3])[0], color: tone(g[3])[1], outline: heatIdx === idx ? '2px solid #151a16' : 'none', outlineOffset: 1 }}>{g[3]}</b>
                <span>{g[1]}</span><i>{rnd(g[0])}</i>
              </button>
            );
          })}
        </div>
      </Card>

      </div>

      {/* Desktop: four stacked columns so short cards don't leave gaps. Narrower screens flatten them back into card order (pc-oN). */}
      <div className="pc-cols">
      <div className="pc-col">
      <Card o={1} title="Scoring range" note={`floor ${sorted[0]} · median ${median} · ceiling ${sorted[n - 1]}`}>
        <div className="pc-dist">{bands.filter((b) => b[1]).map(([l, c, bg]) => <div key={l} style={{ flex: c, background: bg }} title={l} />)}</div>
        <div className="pc-distl">{bands.map(([l, c, bg]) => <div key={l}><span><i style={{ background: bg }} />{l}</span><b>{Math.round((c / n) * 100)}%</b></div>)}</div>
        <p className="pc-note">{rangeNote}{rangeNote2}</p>
      </Card>

      {zt > 0 && (
        <Card o={5} title="Where he wins the ball" note={`${zt} possessions in 2026`}>
          <div className="pc-zones">
            {(['Defensive 50', 'Defensive mid', 'Attacking mid', 'Attacking 50'] as const).map((z, i) => {
              const s = zones[i] / zt;
              return (
                <div key={z} style={{ background: `rgb(31 107 58 / ${0.08 + s * 1.6})`, color: s > 0.3 ? '#fff' : '#151a16' }}>
                  <b>{Math.round(s * 100)}%</b><span>{z}</span>
                </div>
              );
            })}
          </div>
          <div className="pc-legend"><span>← defending</span><span style={{ marginLeft: 'auto' }}>attacking →</span></div>
        </Card>
      )}

      </div>
      <div className="pc-col">
      <Card o={2} title="Role" note={mid ? `centre bounces ${Math.round(mean(cbas))}% · last 5: ${Math.round(mean(last5.map((g) => g[5] ?? 0)))}%` : `time on ground ${Math.round(mean(togs))}% · last 5: ${Math.round(mean(last5.map((g) => g[4] ?? 0)))}%`}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Score per game with centre bounce and time on ground">
          {games.map((g, i) => <rect key={i} x={i * bw + 1.2} y={H - (g[3] / top) * H} width={Math.max(1, bw - 2.4)} height={(g[3] / top) * H} rx={2} fill={tone(g[3])[0]} />)}
          <polyline points={games.map((g, i) => `${i * bw + bw / 2},${H - ((g[4] ?? 0) / 100) * H}`).join(' ')} fill="none" stroke="#6b726c" strokeWidth={1.2} strokeDasharray="3 3" />
          {mid && <polyline points={games.map((g, i) => `${i * bw + bw / 2},${H - ((g[5] ?? 0) / 100) * H}`).join(' ')} fill="none" stroke="#c48a1f" strokeWidth={2} />}
        </svg>
        <div className="pc-legend"><span><i style={{ background: '#4f9a5f', width: 8, height: 8 }} />Score</span>{mid && <span><i style={{ background: '#c48a1f' }} />Centre bounce %</span>}<span><i style={{ borderTop: '1.5px dashed #6b726c', height: 0 }} />Time on ground</span></div>
        {cut != null && hi.length >= 2 && lo.length >= 2 && (
          <p className="pc-note">With {cut}%+ of centre bounces he averaged <b>{Math.round(mean(hi))}</b> ({hi.length} games); under that, <b>{Math.round(mean(lo))}</b> ({lo.length} games).</p>
        )}
      </Card>

      <Card o={6} title="By quarter" note="average points">
        <div className="pc-q">{q.map((v, i) => <div key={i}><span>Q{i + 1}</span><b>{Math.round(v)}</b></div>)}</div>
        <p className="pc-note">{qNote}</p>
      </Card>

      </div>
      <div className="pc-col">
      {pct.length > 0 && (
        <Card o={3} title={`Against other ${lineName}s`} note={poolNote}>
          {pct.map((x) => (
            <div key={x.label} className="pc-pbar">
              <span>{x.label}</span><b>{x.value}</b>
              <div className="pc-track"><div style={{ width: `${Math.max(3, x.pct)}%`, background: pctTone(x.pct) }} /></div>
              <em style={{ color: pctTone(x.pct) }}>{x.pct}</em>
            </div>
          ))}
        </Card>
      )}

      {(opps.length >= 2 || vens.length > 0) && (
        <Card o={7} title="Opponents and venues" note="2025–26 · 2+ games">
          <div className="pc-two">
            <div>
              {opps.length >= 2 && <><div className="eyebrow">Best against</div>{opps.slice(0, 3).map(oRow)}
                <div className="eyebrow" style={{ marginTop: 8 }}>Toughest</div>{opps.slice(-3).reverse().map(oRow)}</>}
            </div>
            <div>{vens.length > 0 && <><div className="eyebrow">Venues</div>{vens.map(oRow)}</>}</div>
          </div>
        </Card>
      )}
      </div>
      <div className="pc-col">
      <Card o={4} title="Heat map" note={heat ? `${rnd(heat[0])} v ${heat[1]} · ${heat[3]} points` : undefined}>
        {heatUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heatUrl} alt={`Heat map, ${rnd(heat![0])} v ${heat![1]}`} className="pc-heat" loading="lazy" />
        ) : <p className="pc-note">No heat map for this game.</p>}
        <div className="pc-games" role="tablist" aria-label="Pick a game">
          {games.map((g, i) => [g, i] as const).reverse().map(([g, i]) => g[14] && (
            <button key={i} type="button" role="tab" aria-selected={heatIdx === i} onClick={() => setHeatIdx(i)}
              style={{ background: heatIdx === i ? '#151a16' : '#f2f4ef', color: heatIdx === i ? '#fff' : '#151a16' }}>
              {rnd(g[0])}<small>{g[1]}</small>
            </button>
          ))}
        </div>
        <p className="pc-note" style={{ fontSize: 11 }}>AFL heat map: red is where he spent the most time. His team attacks left to right in the first half; use it for role, not direction.</p>
      </Card>

      </div>
      </div>
    </div>
  );
}
