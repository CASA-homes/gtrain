'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { TeamBadge } from '@/components/bits';
import { Face } from '@/components/TradeHighlights';
import { evaluate, suggest, verdict, WINDOWS, type PAsset, type PTeam, type SideResult } from '@/lib/trade-plan';

const GREEN = '#1f6b3a', RED = '#b23b2e', INK = '#17201a';
const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const tone = (n: number) => (n > 2 ? GREEN : n < -2 ? RED : INK);
const KEY = 'gtrain-trade-planner';

export function TradePlanner({ myTeamId, teams, assets, initialPartner, initialGet }: {
  myTeamId: number; teams: PTeam[]; assets: PAsset[]; initialPartner: number | null; initialGet: string | null;
}) {
  const [override, setOverride] = useState<Record<number, string>>({});
  const withWindow = (t: PTeam): PTeam => {
    const w = override[t.id] ? WINDOWS.find((x) => x.window === override[t.id]) : null;
    return w ? { ...t, ...w } : t;
  };
  const others = teams.filter((t) => t.id !== myTeamId);
  const meTeam = withWindow(teams.find((t) => t.id === myTeamId)!);
  const [partner, setPartner] = useState<number>(initialPartner ?? others[0].id);
  const [gets, setGets] = useState<string[]>(initialGet ? [initialGet] : []);
  const [gives, setGives] = useState<string[]>([]);

  // Remember the last scenario on this device only (unless the link asked for a specific player)
  useEffect(() => {
    if (initialGet || initialPartner) return;
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.partner && s.partner !== myTeamId) { setPartner(s.partner); setGets(s.gets ?? []); setGives(s.gives ?? []); setOverride(s.override ?? {}); }
    } catch { /* storage unavailable */ }
  }, [initialGet, initialPartner, myTeamId]);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ partner, gets, gives, override })); } catch { /* ignore */ }
  }, [partner, gets, gives, override]);

  const themTeam = withWindow(teams.find((t) => t.id === partner)!);
  const auto = (id: number) => teams.find((t) => t.id === id)!.window;
  const setWin = (id: number, w: string) => setOverride({ ...override, [id]: w === auto(id) ? '' : w });
  const byKey = useMemo(() => new Map(assets.map((a) => [a.key, a])), [assets]);
  const myRoster = useMemo(() => assets.filter((a) => a.teamId === myTeamId), [assets, myTeamId]);
  const theirRoster = useMemo(() => assets.filter((a) => a.teamId === partner), [assets, partner]);
  const getA = gets.map((k) => byKey.get(k)!).filter((a) => a && a.teamId === partner);
  const giveA = gives.map((k) => byKey.get(k)!).filter(Boolean);

  const me = evaluate(meTeam, myRoster, giveA, getA);
  const them = evaluate(themTeam, theirRoster, getA, giveA);
  const v = getA.length || giveA.length ? verdict(me, them) : null;
  const sugg = useMemo(() => (getA.length ? suggest(meTeam, themTeam, myRoster, theirRoster, getA) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gets.join(), partner, override[partner], override[myTeamId]]);

  const switchPartner = (id: number) => { setPartner(id); setGets([]); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: 14, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
          <span className="muted">Trading with</span>
          <select className="input" value={partner} onChange={(e) => switchPartner(Number(e.target.value))} style={{ minWidth: 220 }}>
            {others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => { setGets([]); setGives([]); }}>Clear</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <Side title={`You get from ${themTeam.name}`} team={themTeam} autoWindow={auto(partner)} onWindow={(w) => setWin(partner, w)} chosen={getA} pool={theirRoster}
          onAdd={(k) => setGets([...gets, k])} onRemove={(k) => setGets(gets.filter((x) => x !== k))} />
        <Side title="You give" team={meTeam} autoWindow={auto(myTeamId)} onWindow={(w) => setWin(myTeamId, w)} chosen={giveA} pool={myRoster}
          onAdd={(k) => setGives([...gives, k])} onRemove={(k) => setGives(gives.filter((x) => x !== k))} />
      </div>

      {v && (
        <div className="card" role="status" style={{ padding: '12px 16px', border: 0, background: v.tone === 'good' ? '#dcefd6' : v.tone === 'ok' ? '#f4ead0' : '#f6dcd6', fontWeight: 600 }}>
          {v.text}
        </div>
      )}

      {(getA.length > 0 || giveA.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
          <Result r={me} label="You" />
          <Result r={them} label={themTeam.name} />
        </div>
      )}

      {getA.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <h2 className="h2">Fair packages</h2>
            <span className="muted" style={{ fontSize: 13 }}>Combinations from your list that leave both teams better off for their windows. Best balance first.</span>
          </div>
          {sugg.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {sugg.map((s, i) => (
                <div key={i} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span className="eyebrow">Option {i + 1}: you give</span>
                  {s.gives.map((a) => <AssetLine key={a.key} a={a} />)}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                    <span>You <b style={{ color: tone(s.me.score) }}>{sign(s.me.score)}</b><span className="muted"> ({sign(s.me.dNow)} now, {sign(s.me.dFuture)} future)</span></span>
                    <span>{themTeam.short} <b style={{ color: tone(s.them.score) }}>{sign(s.them.score)}</b><span className="muted"> ({sign(s.them.dNow)} now, {sign(s.them.dFuture)} future)</span></span>
                  </div>
                  <button type="button" className="btn" onClick={() => setGives(s.gives.map((a) => a.key))}>Try this</button>
                </div>
              ))}
            </div>
          ) : <p className="muted" style={{ margin: 0 }}>Nothing on your list balances this cleanly. The target may be worth more to them than anything you can spare, or try adding a second piece from their side.</p>}
        </section>
      )}

      <details className="card" style={{ padding: '12px 16px', fontSize: 13 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>How it’s judged</summary>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
          <li><b>Now</b>: change to the team’s position-valid 2027 best 18 (projected 2027 averages, ruck at half weight), in points a round. A player who doesn’t crack their 18 adds nothing here.</li>
          <li><b>Future</b>: change to their young core, the best six players aged 24 or under on future-build scores plus their best two 2027 picks as prospects.</li>
          <li><b>Window</b>: from each team’s 2027 projection rank and future rank. A contender weighs now about 70–80%, a side entering contention about half and half, a rebuild mostly future. The headline number is that weighted change.</li>
          <li><b>Market points</b> are shown as the neutral scale the rest of the site uses, but the call is made on fit, not points.</li>
        </ul>
        <p className="muted" style={{ margin: '8px 0 0' }}>Private to you. To make it real, list the player or open a <Link href="/market/desk">trade desk</Link>.</p>
      </details>
    </div>
  );
}

function AssetLine({ a, onRemove }: { a: PAsset; onRemove?: () => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto auto', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)' }}>
      {a.kind === 'player' ? <Face p={{ afl_club: a.club, photo_path: a.photo, dfs_id: a.dfs }} label={a.label} size={30} /> : <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--line)', display: 'grid', placeItems: 'center', font: '600 10px var(--mono)' }}>PICK</span>}
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {a.kind === 'player' ? <Link href={`/players/${a.id}`} style={{ fontWeight: 600, color: 'inherit' }}>{a.label}</Link> : <b style={{ fontWeight: 600 }}>{a.label}</b>}
        <span className="muted" style={{ fontSize: 11 }}>{a.sub}{a.kind === 'player' ? ` · ’27 proj ${a.now.toFixed(0)}` : ''}</span>
      </span>
      <span className="mono muted" style={{ fontSize: 11 }}>{a.pts.toLocaleString()}</span>
      {onRemove ? <button type="button" className="btn" aria-label={`Remove ${a.label}`} onClick={onRemove} style={{ minHeight: 26, padding: '0 8px' }}>×</button> : <span />}
    </div>
  );
}

function Side({ title, team, autoWindow, onWindow, chosen, pool, onAdd, onRemove }: {
  title: string; team: PTeam; autoWindow: string; onWindow: (w: string) => void; chosen: PAsset[]; pool: PAsset[]; onAdd: (k: string) => void; onRemove: (k: string) => void;
}) {
  const picked = new Set(chosen.map((a) => a.key));
  const players = pool.filter((a) => a.kind === 'player' && !picked.has(a.key)).sort((a, b) => b.pts - a.pts);
  const picks = pool.filter((a) => a.kind === 'pick' && !picked.has(a.key)).sort((a, b) => b.pts - a.pts);
  return (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="row-between" style={{ alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <TeamBadge code={team.short} size={28} />
          <b style={{ fontWeight: 600 }}>{title}</b>
        </span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span className="muted">Window</span>
          <select className="input" value={team.window} onChange={(e) => onWindow(e.target.value)} style={{ minHeight: 30, fontSize: 12, padding: '0 8px' }}>
            {WINDOWS.map((w) => <option key={w.window} value={w.window}>{w.window}{w.window === autoWindow ? ' (auto)' : ''}</option>)}
          </select>
        </label>
      </div>
      <span className="muted" style={{ fontSize: 12 }}>{team.blurb} 2027 projection #{team.projRank}, future build #{team.futRank}.{team.window !== autoWindow ? ' (Your call, not the auto read.)' : ''}</span>
      <div>
        {chosen.length ? chosen.map((a) => <AssetLine key={a.key} a={a} onRemove={() => onRemove(a.key)} />) : <p className="muted" style={{ fontSize: 13, margin: '6px 0' }}>Nothing yet.</p>}
      </div>
      <label className="sr-only" htmlFor={`add-${team.id}`}>Add a player or pick</label>
      <select id={`add-${team.id}`} className="input" value="" onChange={(e) => e.target.value && onAdd(e.target.value)}>
        <option value="">+ Add a player or pick</option>
        <optgroup label="Players">{players.map((a) => <option key={a.key} value={a.key}>{a.label} · {a.sub}</option>)}</optgroup>
        <optgroup label="Picks">{picks.map((a) => <option key={a.key} value={a.key}>{a.label} · {a.sub}</option>)}</optgroup>
      </select>
    </div>
  );
}

function Result({ r, label }: { r: SideResult; label: string }) {
  const cell = (k: string, val: number, sub: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px', background: 'var(--sunk)', borderRadius: 10 }}>
      <span className="eyebrow">{k}</span>
      <b style={{ font: '700 20px var(--mono)', color: tone(val) }}>{sign(val)}</b>
      <span className="muted" style={{ fontSize: 11 }}>{sub}</span>
    </div>
  );
  return (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row-between" style={{ alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><TeamBadge code={r.team.short} size={26} /><b>{label}</b></span>
        <span className="muted" style={{ fontSize: 12 }}>{r.team.window} · weighs now {Math.round(r.team.wNow * 100)}%</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {cell('Overall', r.score, 'window-weighted')}
        {cell('2027 best 18', r.dNow, 'points a round')}
        {cell('Young core', r.dFuture, 'future score')}
      </div>
      <span className="muted" style={{ fontSize: 12 }}>Market points: in {r.ptsIn.toLocaleString()} · out {r.ptsOut.toLocaleString()} · net <b style={{ color: tone(r.ptsIn - r.ptsOut) }}>{sign(r.ptsIn - r.ptsOut)}</b></span>
      {r.notes.length > 0 && <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.5 }}>{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </div>
  );
}
