'use client';
// A completed G-Train round from 2026: final scores around the grounds, your matchup, both teams mirrored with each
// player's real score, and the player pop-up with that game's quarters, zones and heat map.
import { useEffect, useState } from 'react';
import type { HPlayer, HRound, HSide } from '@/lib/history';
import type { MPlayer } from '@/lib/mens-round';
import { CLUBS } from '@/lib/clubs';
import { MFace, pairCols } from './mens';
import { ProfileTabs, RoundDetail } from './profile-tabs';

const LINES: [string, string][] = [['DEF', 'Defence'], ['MID', 'Midfield'], ['RUC', 'Ruck'], ['FWD', 'Forwards']];

function Row({ p, side, onOpen }: { p: HPlayer; side: 'a' | 'b'; onOpen: () => void }) {
  const g = p.game;
  const face = <MFace p={p as unknown as MPlayer} size={24} />;
  const who = (
    <div className="mx-who">
      <span className="mx-name"><button className="mx-pname rh-ellip" onClick={onOpen}>{p.name}</button></span>
      <span className="mx-sub"><span>{p.club}{g ? ` · v ${g[1]}` : ' · didn’t play'}</span>{g?.[5] ? <span className="rh-mono">CBA {g[5]}%</span> : null}</span>
    </div>
  );
  const tog = <span className="mx-tog rh-mono">{g?.[4] != null ? `${g[4]}%` : ''}</span>;
  const avg = <span className="mx-projn rh-mono" title="His 2026 average">{p.avg ?? ''}</span>;
  const sc = <b className={`rh-mono ${g ? '' : 'mx-dash'}`}>{g ? g[3] : '–'}</b>;
  const score = <div className={`mx-score ${side}`}>{side === 'a' ? <>{avg}{sc}</> : <>{sc}{avg}</>}</div>;
  return <div className={`mx-row hx ${side} ${p.emg ? 'bench' : ''}`}>{side === 'a' ? <>{face}{who}{tog}{score}</> : <>{score}{tog}{who}{face}</>}</div>;
}

function Col({ t, side, onOpen }: { t: HSide; side: 'a' | 'b'; onOpen: (p: HPlayer) => void }) {
  const field = t.players.filter((p) => !p.emg), emg = t.players.filter((p) => p.emg);
  return (
    <div className="mx-col">
      {LINES.map(([k, n]) => { const ps = field.filter((p) => p.line === k); return ps.length ? (
        <div key={k} className="mx-line"><span className="rh-k">{n}</span>{ps.map((p) => <Row key={p.key} p={p} side={side} onOpen={() => onOpen(p)} />)}</div>
      ) : null; })}
      {emg.length > 0 && <div className="mx-line"><span className="rh-k">Emergencies</span>{emg.map((p) => <Row key={p.key} p={p} side={side} onOpen={() => onOpen(p)} />)}</div>}
    </div>
  );
}

function Sheet({ p, team, round, onClose }: { p: HPlayer; team: string; round: HRound; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="rh-sheet-back" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mx-sheet" role="dialog" aria-modal="true" aria-label={`${p.name} profile`}>
        <div className="mx-sh-head">
          <MFace p={p as unknown as MPlayer} size={56} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <span className="rh-k">{team}{p.emg ? ' · emergency' : ''} · {round.season} {round.label}</span>
            <h3 className="mx-sh-name">{p.name}</h3>
            <span className="rh-dim" style={{ fontSize: 13 }}>{CLUBS[p.club]?.name ?? p.club}</span>
          </div>
          <button className="rh-btn alt" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <ProfileTabs defaultTab="season" roundLabel={round.label} prof={p.prof} proj={p.avg ?? 0} clubName={team} round={<RoundDetail g={p.game} playerNo={p.playerNo} proj={p.avg} />} />
        {p.id != null && <a href={`/players/${p.id}`} className="rh-btn go lg" style={{ alignSelf: 'stretch', textAlign: 'center' }}>Open full profile →</a>}
      </div>
    </div>
  );
}

export function HistoryBoard({ round }: { round: HRound }) {
  const [open, setOpen] = useState<{ p: HPlayer; team: string } | null>(null);
  const m = round.mine;
  const [A, B] = m ?? [null, null];
  const [ca, cb] = pairCols(A, B);
  const margin = A && B && A.total != null && B.total != null ? A.total - B.total : null;
  return (
    <div className="mx-compact">
      <div className="mx-toprow">
        <div className="mx-scrub rh-card hx-done">
          <div className="mx-scrubtop"><span className="rh-k">{round.season} · {round.label} · final scores</span></div>
          <span className="rh-dim" style={{ fontSize: 12.5 }}>Each player shows his score that round, with his 2026 average faded beside it. Tap a name for his game: quarters, where he won the ball and the heat map.</span>
        </div>
        <div className="mx-matchups">
          {round.matchups.map((x) => {
            const mine = x.a === round.myName || x.b === round.myName;
            return (
              <div key={x.a} className={`mx-mu ${mine ? 'on' : ''}`}>
                <span className="mx-mu-t"><span className="rh-ellip">{x.a}</span><b className="rh-mono" style={{ fontWeight: (x.as ?? 0) >= (x.bs ?? 0) ? 700 : 500 }}>{x.as ?? '–'}</b></span>
                <span className="mx-mu-t"><span className="rh-ellip">{x.b}</span><b className="rh-mono" style={{ fontWeight: (x.bs ?? 0) > (x.as ?? 0) ? 700 : 500 }}>{x.bs ?? '–'}</b></span>
                <span className="mx-mu-p rh-mono"><span>Final</span><span>by {Math.abs((x.as ?? 0) - (x.bs ?? 0))}</span></span>
              </div>
            );
          })}
        </div>
      </div>
      {!A || !B ? <section className="rh-card"><span className="rh-dim">You didn’t have a game in {round.label.toLowerCase()} of {round.season}.</span></section> : (<>
        <section className="rh-card mx-board hx-board">
          <div className="mx-sb">
            <div className="mx-sbt a"><span className="rh-k">{A.coach}</span><b>{A.name}</b><span className="mx-big rh-mono" style={{ color: ca }}>{A.total ?? '–'}</span></div>
            <div className="mx-sbm"><span className="rh-k">Completed</span><span className="hx-res" style={{ background: A.res === 'W' ? ca : cb }}>{margin == null ? '' : margin === 0 ? 'Draw' : `${margin > 0 ? A.short : B.short} by ${Math.abs(margin)}`}</span></div>
            <div className="mx-sbt b"><span className="rh-k">{B.coach}</span><b>{B.name}</b><span className="mx-big rh-mono" style={{ color: cb }}>{B.total ?? '–'}</span></div>
          </div>
        </section>
        <div className="mx-teams">
          <div className="mx-side a"><h2 className="rh-h2" style={{ color: ca }}>{A.name}</h2><Col t={A} side="a" onOpen={(p) => setOpen({ p, team: A.name })} /></div>
          <div className="mx-side b"><h2 className="rh-h2" style={{ color: cb }}>{B.name}</h2><Col t={B} side="b" onOpen={(p) => setOpen({ p, team: B.name })} /></div>
        </div>
        <p className="rh-dim" style={{ fontSize: 12, margin: 0 }}>Team totals are the official G-Train scores for the week (captain doubled, emergencies applied). Player scores are their AFL Fantasy points that round.</p>
      </>)}
      {open && <Sheet p={open.p} team={open.team} round={round} onClose={() => setOpen(null)} />}
    </div>
  );
}
