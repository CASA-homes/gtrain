'use client';
// Squad setup (0078). Coaches: pick your squad off the AFL list (first in gets him; "He's mine" flags a taken player),
// review, submit. Commish: the squad board — sign squads off, settle flags, edit any club's squad, move traded picks,
// then lock squads and go live.
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Guernsey } from '@/components/Guernsey';
import { adminSet, approveSquad, flagPlayer, lockSquads, movePick, pickPlayer, resolveFlag, submitSquad, type Res } from '@/app/(app)/league/setup/actions';
import './setup.css';

type Status = 'picking' | 'submitted' | 'approved';
type Line = 'DEF' | 'MID' | 'RUC' | 'FWD';
const LINES: Line[] = ['DEF', 'MID', 'RUC', 'FWD'];

export interface SetupData {
  ready: boolean; leagueName: string; mode: 'picks' | 'draft' | 'import' | null; locked: boolean; listSize: number;
  myTeamId: number; isCommish: boolean;
  teams: { id: number; name: string; coach: string; code: string }[];
  owners: Record<number, number>;
  status: Record<number, Status>;
  flags: { id: number; player: number; claimant: number; holder: number | null }[];
  picks: { id: number; year: number; round: number; overall: number | null; original: number; owner: number }[];
  players: { id: number; name: string; club: string | null; pos: string[] }[];
}

const SHOW = 60;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '');

export function SquadSetup({ data }: { data: SetupData }) {
  const router = useRouter();
  const [owners, setOwners] = useState(data.owners);
  const [status, setStatus] = useState(data.status);
  const [flagged, setFlagged] = useState<Record<number, true>>(() => Object.fromEntries(data.flags.filter((f) => f.claimant === data.myTeamId).map((f) => [f.player, true])));
  const [view, setView] = useState<'pick' | 'review' | 'board'>(data.isCommish ? 'board' : 'pick');
  const [editTeam, setEditTeam] = useState<number>(data.myTeamId);
  const [q, setQ] = useState('');
  const [line, setLine] = useState<Line | 'ALL' | 'MINE'>('ALL');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [pending, start] = useTransition();

  const team = useMemo(() => new Map(data.teams.map((t) => [t.id, t])), [data.teams]);
  const player = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players]);
  const asCommish = data.isCommish && editTeam !== data.myTeamId;
  const editing = team.get(editTeam);
  const myStatus: Status | undefined = status[editTeam];
  const signedOff = myStatus === 'approved' && !data.isCommish;
  const counts = useMemo(() => {
    const by = new Map<number, number>();
    for (const t of Object.values(owners)) by.set(t, (by.get(t) ?? 0) + 1);
    return by;
  }, [owners]);
  const count = counts.get(editTeam) ?? 0;
  const mine = useMemo(() => data.players.filter((p) => owners[p.id] === editTeam), [data.players, owners, editTeam]);
  const lineCount = (l: Line) => mine.filter((p) => p.pos[0] === l).length;

  const run = (fn: () => Promise<Res>, undo: () => void, okText?: string) => start(async () => {
    const r = await fn();
    if (!r.ok) { undo(); setMsg({ tone: 'err', text: r.error }); return; }
    setMsg(okText ? { tone: 'ok', text: okText } : null);
    router.refresh();
  });

  const toggle = (id: number) => {
    const own = owners[id];
    const has = own === editTeam;
    if (!has && count >= data.listSize) return setMsg({ tone: 'err', text: `${editing?.name ?? 'This club'}'s list is full (${data.listSize}).` });
    // The commish uses his own path for other clubs, for his own signed-off squad, and to move a taken player.
    const admin = asCommish || (data.isCommish && (status[editTeam] === 'approved' || (own != null && !has)));
    const before = owners, beforeSt = status;
    const next = { ...owners };
    if (has) delete next[id]; else next[id] = editTeam;
    setOwners(next);
    if (!admin) setStatus({ ...status, [editTeam]: 'picking' });
    run(() => admin ? adminSet(id, has ? null : editTeam) : pickPlayer(id, !has), () => { setOwners(before); setStatus(beforeSt); });
  };
  const flag = (id: number) => {
    setFlagged({ ...flagged, [id]: true });
    const holder = team.get(owners[id])?.name ?? 'another club';
    run(() => flagPlayer(id), () => { const f = { ...flagged }; delete f[id]; setFlagged(f); }, `Sent to the commish: you say ${player.get(id)?.name} is yours, ${holder} has him.`);
  };

  const results = useMemo(() => {
    const words = norm(q).split(' ').filter(Boolean);
    const list = data.players.filter((p) => {
      if (line === 'MINE') { if (owners[p.id] !== editTeam) return false; }
      else if (line !== 'ALL' && !p.pos.includes(line)) return false;
      if (!p.club && owners[p.id] == null) return false;   // not on an AFL list
      if (words.length) { const n = norm(p.name); if (!words.every((w) => n.includes(w))) return false; }
      return true;
    });
    if (line === 'MINE') list.sort((a, b) => LINES.indexOf(a.pos[0] as Line) - LINES.indexOf(b.pos[0] as Line) || a.name.localeCompare(b.name));
    else list.sort((a, b) => (owners[a.id] === editTeam ? 0 : 1) - (owners[b.id] === editTeam ? 0 : 1) || a.name.localeCompare(b.name));
    return list;
  }, [data.players, q, line, owners, editTeam]);

  if (!data.ready) return (
    <div className="card su-note"><b>Almost there.</b> Squad setup needs one database update before coaches can pick. The commish has been told.</div>
  );
  if (data.locked && !data.isCommish) return (
    <div className="card su-note"><b>Squads are locked.</b> {data.leagueName} is live. Ask the commish if something on your list is wrong.</div>
  );

  return (
    <div className="su">
      {data.isCommish && (
        <nav className="bf-tabs su-tabs" aria-label="Squad setup">
          <button className={view === 'board' ? 'on' : ''} onClick={() => { setView('board'); setMsg(null); }}>Squad board</button>
          <button className={view !== 'board' ? 'on' : ''} onClick={() => { setEditTeam(data.myTeamId); setView('pick'); setMsg(null); }}>My squad</button>
        </nav>
      )}

      {msg && <p role={msg.tone === 'err' ? 'alert' : 'status'} className={`su-msg ${msg.tone}`}>{msg.text}</p>}

      {view === 'board' && data.isCommish && (
        <Board data={data} owners={owners} status={status} counts={counts} team={team} player={player} pending={pending}
          onEdit={(id) => { setEditTeam(id); setLine('MINE'); setQ(''); setView('pick'); setMsg(null); }}
          onApprove={(id, on) => { const b = status; setStatus({ ...status, [id]: on ? 'approved' : 'picking' }); run(() => approveSquad(id, on), () => setStatus(b)); }}
          onResolve={(f, move) => run(() => resolveFlag(f, move), () => {}, move ? 'Moved.' : 'Kept where he is.')}
          onLock={(on) => run(() => lockSquads(on), () => {}, on ? `${data.leagueName} is live. Squads are locked.` : 'Squads unlocked.')}
          onPick={(id, t) => run(() => movePick(id, t), () => {}, 'Pick moved.')} />
      )}

      {view === 'pick' && (
        <section className="su-panel">
          {asCommish && (
            <div className="su-banner">Editing <b>{editing?.name}</b> as commish. <button className="su-link" onClick={() => setView('board')}>Done</button></div>
          )}
          <header className="su-head">
            <div>
              <span className="eyebrow">{editing?.name}</span>
              <h2 className="su-h">{asCommish ? 'Their squad' : 'Pick your squad'}</h2>
            </div>
            <div className="su-count"><b>{count}</b><span> / {data.listSize}</span></div>
          </header>
          <div className="su-bar" aria-hidden><span style={{ width: `${Math.min(100, (count / data.listSize) * 100)}%`, background: count >= data.listSize ? 'var(--khq-brass)' : undefined }} /></div>
          <p className="su-lines">{LINES.map((l) => `${l} ${lineCount(l)}`).join(' · ')}</p>
          {signedOff
            ? <p className="su-msg ok">Your squad is signed off. Ask the commish if something needs changing.</p>
            : <>
              <label htmlFor="su-q" className="sr-only">Search AFL players</label>
              <input id="su-q" className="lg-in su-q" placeholder="Search AFL players" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
              <div className="su-chips" role="group" aria-label="Filter by line">
                {(['ALL', ...LINES, 'MINE'] as const).map((l) => (
                  <button key={l} aria-pressed={line === l} onClick={() => setLine(l)}>{l === 'ALL' ? 'All' : l === 'MINE' ? (asCommish ? 'Their squad' : 'My squad') : l}</button>
                ))}
              </div>
              <ul className="su-list">
                {results.slice(0, SHOW).map((p) => {
                  const own = owners[p.id];
                  const isMine = own === editTeam;
                  const holder = own != null && !isMine ? team.get(own) : undefined;
                  return (
                    <li key={p.id} className={holder ? 'taken' : ''}>
                      <Guernsey club={p.club} size={34} name={p.name} />
                      <span className="su-who"><b>{p.name}</b><span>{p.club ?? '—'} · {p.pos.join('/') || '—'}</span></span>
                      {isMine && <button className="su-btn on" disabled={pending} onClick={() => toggle(p.id)} aria-label={`Remove ${p.name}`}>✓ {asCommish ? 'Theirs' : 'Mine'}</button>}
                      {own == null && <button className="su-btn" disabled={pending} onClick={() => toggle(p.id)} aria-label={`Add ${p.name}`}>+ Add</button>}
                      {holder && (
                        <span className="su-held">
                          <span>With {holder.name}</span>
                          {asCommish || data.isCommish
                            ? <button className="su-link" disabled={pending} onClick={() => toggle(p.id)}>Move here</button>
                            : <button className="su-link" disabled={pending || !!flagged[p.id]} onClick={() => flag(p.id)}>{flagged[p.id] ? 'Flagged' : 'He’s mine'}</button>}
                        </span>
                      )}
                    </li>
                  );
                })}
                {results.length === 0 && <li className="su-empty">{line === 'MINE' ? 'No players yet. Search above and tap + Add.' : 'No AFL players match that.'}</li>}
                {results.length > SHOW && <li className="su-empty">Showing {SHOW} of {results.length}. Search to narrow it down.</li>}
              </ul>
            </>}
          {!asCommish && (
            <div className="su-foot">
              <button className="lg-btn" onClick={() => { setView('review'); setMsg(null); }} disabled={count === 0}>Review squad ({count})</button>
            </div>
          )}
        </section>
      )}

      {view === 'review' && (
        <section className="su-panel">
          <button className="su-link" onClick={() => setView('pick')}>← Keep picking</button>
          <h2 className="su-h">Check your squad</h2>
          <p className="muted" style={{ margin: 0 }}>{count} of {data.listSize} players. Once you submit, the commish signs it off. They can still fix anything after.</p>
          <div className="su-lineGrid">{LINES.map((l) => <div key={l}><b>{lineCount(l)}</b><span>{l}</span></div>)}</div>
          {LINES.map((l) => {
            const ps = mine.filter((p) => (p.pos[0] ?? 'MID') === l);
            if (!ps.length) return null;
            return (
              <details key={l} className="su-group" open={l === 'MID' || ps.length < 6}>
                <summary><b>{l}</b> · {ps.length}</summary>
                <ul>{ps.map((p) => <li key={p.id}><span>{p.name}</span><span className="muted">{p.club}</span></li>)}</ul>
              </details>
            );
          })}
          <div className="su-group su-picksNote"><b>Draft picks</b><span className="muted">You start with your own picks. Traded picks get moved by the commish.</span></div>
          {count < data.listSize && <p className="su-msg">You’ve got {data.listSize - count} spots left. You can still submit: the commish will see it’s short.</p>}
          <div className="su-foot">
            {myStatus === 'submitted' || myStatus === 'approved'
              ? <p className="su-msg ok" role="status">{myStatus === 'approved' ? 'Signed off by the commish.' : 'Submitted. Waiting on the commish to sign it off.'}</p>
              : <button className="lg-btn" disabled={pending || count === 0} onClick={() => { const b = status; setStatus({ ...status, [editTeam]: 'submitted' }); run(() => submitSquad(), () => setStatus(b), data.isCommish ? 'Submitted. Sign it off on the squad board.' : 'Submitted. The commish has been told.'); }}>Submit to the commish</button>}
          </div>
        </section>
      )}
    </div>
  );
}

function Board({ data, owners, status, counts, team, player, pending, onEdit, onApprove, onResolve, onLock, onPick }: {
  data: SetupData; owners: Record<number, number>; status: Record<number, Status>; counts: Map<number, number>;
  team: Map<number, SetupData['teams'][number]>; player: Map<number, SetupData['players'][number]>; pending: boolean;
  onEdit: (id: number) => void; onApprove: (id: number, on: boolean) => void; onResolve: (flag: number, move: boolean) => void;
  onLock: (on: boolean) => void; onPick: (pick: number, team: number) => void;
}) {
  const [confirmLock, setConfirmLock] = useState(false);
  const done = data.teams.filter((t) => status[t.id] === 'approved').length;
  const flags = data.flags.filter((f) => owners[f.player] != null && owners[f.player] !== f.claimant);
  const label = (t: number) => {
    const s = status[t], n = counts.get(t) ?? 0;
    if (s === 'approved') return ['Signed off', 'ok'];
    if (s === 'submitted') return ['Submitted · check and sign off', 'brass'];
    if (n > 0) return ['Still picking', ''];
    return [team.get(t)?.coach && team.get(t)?.coach !== 'Open' ? 'Hasn’t started' : 'No coach yet', ''];
  };
  return (
    <section className="su-panel">
      <header className="su-head">
        <div><span className="eyebrow">{data.leagueName} · Commish</span><h2 className="su-h">Squad board</h2></div>
        <div className="su-count"><b>{done}</b><span> of {data.teams.length} signed off</span></div>
      </header>
      <div className="su-bar" aria-hidden><span style={{ width: `${(done / Math.max(1, data.teams.length)) * 100}%` }} /></div>
      {data.locked && <p className="su-msg ok">Squads are locked and {data.leagueName} is live. Unlock to make changes.</p>}

      {flags.map((f) => {
        const p = player.get(f.player), c = team.get(f.claimant), h = team.get(owners[f.player]);
        return (
          <div key={f.id} className="su-flag">
            <span className="eyebrow su-flagTag">Needs you · flag</span>
            <p><b>{c?.name}</b> says <b>{p?.name}</b> is theirs. <b>{h?.name}</b> has him.</p>
            <div className="su-row">
              <button className="lg-btn" disabled={pending || data.locked} onClick={() => onResolve(f.id, true)}>Move to {c?.name}</button>
              <button className="su-alt" disabled={pending || data.locked} onClick={() => onResolve(f.id, false)}>Keep with {h?.name}</button>
            </div>
          </div>
        );
      })}

      <ul className="su-clubs">
        {data.teams.map((t) => {
          const n = counts.get(t.id) ?? 0, [text, tone] = label(t.id), s = status[t.id];
          return (
            <li key={t.id}>
              <span className="su-club">
                <span className="su-clubTop"><b>{t.name}</b><span className="muted">{n}/{data.listSize}</span></span>
                <span className="su-mini"><span style={{ width: `${Math.min(100, (n / data.listSize) * 100)}%`, background: s === 'approved' ? undefined : 'var(--khq-brass)' }} /></span>
                <span className={`su-st ${tone}`}>{text}{t.coach && t.coach !== 'Open' && t.coach !== t.name ? ` · ${t.coach}` : ''}</span>
              </span>
              {!data.locked && s === 'submitted' && <button className="su-btn on" disabled={pending} onClick={() => onApprove(t.id, true)}>Sign off</button>}
              {!data.locked && s === 'approved' && <button className="su-btn" disabled={pending} onClick={() => onApprove(t.id, false)}>Reopen</button>}
              {!data.locked && <button className="su-link" onClick={() => onEdit(t.id)} aria-label={`Edit ${t.name}'s squad`}>Edit</button>}
            </li>
          );
        })}
      </ul>

      <PickMover data={data} team={team} pending={pending} onPick={onPick} />

      <div className="su-foot su-lock">
        {data.locked
          ? <button className="su-alt" disabled={pending} onClick={() => onLock(false)}>Unlock squads</button>
          : confirmLock
            ? <div className="su-row"><button className="lg-btn" disabled={pending} onClick={() => { setConfirmLock(false); onLock(true); }}>Yes, lock and go live</button><button className="su-alt" onClick={() => setConfirmLock(false)}>Not yet</button></div>
            : <button className="lg-btn" disabled={pending} onClick={() => setConfirmLock(true)}>Lock squads &amp; go live</button>}
        {!data.locked && <p className="muted su-small">{done === data.teams.length ? 'Everyone’s signed off. Ready when you are.' : `${data.teams.length - done} clubs to go. You can lock early and fill any gaps yourself.`}{flags.length ? ` Open flags stay with whoever has the player.` : ''}</p>}
      </div>
    </section>
  );
}

function PickMover({ data, team, pending, onPick }: { data: SetupData; team: Map<number, SetupData['teams'][number]>; pending: boolean; onPick: (pick: number, team: number) => void }) {
  const years = [...new Set(data.picks.map((p) => p.year))];
  const [year, setYear] = useState(years[0] ?? 2027);
  const [from, setFrom] = useState(data.teams[0]?.id ?? 0);
  const [pick, setPick] = useState<number | ''>('');
  const [to, setTo] = useState<number | ''>('');
  if (!data.picks.length) return null;
  const tname = (id: number) => team.get(id)?.name ?? 'Club';
  const pickLabel = (p: SetupData['picks'][number]) => `R${p.round}${p.overall ? ` · pick ${p.overall}` : ''}${p.owner !== p.original ? ` (${tname(p.original)}’s)` : ''}`;
  const theirs = data.picks.filter((p) => p.year === year && p.owner === from);
  const traded = data.picks.filter((p) => p.owner !== p.original);
  return (
    <details className="su-group su-picks">
      <summary><b>Draft picks</b> · {traded.length ? `${traded.length} traded` : 'everyone has their own'}</summary>
      <p className="muted su-small">For picks traded before {data.leagueName} came to Keeper HQ. Move each one to the club that holds it now.</p>
      <div className="su-pickForm">
        <label>Year<select className="lg-in" value={year} onChange={(e) => { setYear(Number(e.target.value)); setPick(''); }}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
        <label>Held by<select className="lg-in" value={from} onChange={(e) => { setFrom(Number(e.target.value)); setPick(''); }}>{data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Pick<select className="lg-in" value={pick} onChange={(e) => setPick(e.target.value ? Number(e.target.value) : '')}><option value="">Choose</option>{theirs.map((p) => <option key={p.id} value={p.id}>{pickLabel(p)}</option>)}</select></label>
        <label>Move to<select className="lg-in" value={to} onChange={(e) => setTo(e.target.value ? Number(e.target.value) : '')}><option value="">Choose</option>{data.teams.filter((t) => t.id !== from).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <button className="lg-btn" disabled={pending || pick === '' || to === ''} onClick={() => { if (pick !== '' && to !== '') { onPick(pick, to); setPick(''); setTo(''); } }}>Move pick</button>
      </div>
      {traded.length > 0 && (
        <ul className="su-traded">
          {traded.map((p) => <li key={p.id}><span>{p.year} R{p.round}{p.overall ? ` · ${p.overall}` : ''} · {tname(p.original)}’s</span><span>→ <b>{tname(p.owner)}</b></span><button className="su-link" disabled={pending} onClick={() => onPick(p.id, p.original)}>Send back</button></li>)}
        </ul>
      )}
    </details>
  );
}
