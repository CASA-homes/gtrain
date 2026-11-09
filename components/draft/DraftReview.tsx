'use client';
// Draft sign-off: every club's new list, coaches tick or ask for a change, the commish fixes picks and posts the draft.
import './draft.css';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { postDraft, unpostDraft } from '@/app/(app)/draft/centre/actions';
import { CLUB_COLOURS, DRAFT_YEAR, type DraftPlayer, type Line, type RoomRequest, type RoomSel, type RoomTeam } from '@/lib/draft-room';

const LINES: Line[] = ['DEF', 'MID', 'RUC', 'FWD'];
const Chip = ({ club }: { club: string }) => {
  const c = CLUB_COLOURS[club];
  return c ? <i className="rv-cc" title={club} style={{ background: `linear-gradient(135deg,${c[0]} 50%,${c[1]} 50%)` }} /> : null;
};

export interface ReviewCounts { drafted: number; created: number; moved: number; released: number; na: number }

export function DraftReview({ teams, sels, pool, checks, requests, me, counts }: {
  teams: RoomTeam[]; sels: RoomSel[]; pool: DraftPlayer[]; checks: number[]; requests: RoomRequest[];
  me: { team_id: number | null; is_commish: boolean }; counts: ReviewCounts;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const team = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const tn = (id: number) => team.get(id)?.name ?? 'Club';
  const [sel, setSel] = useState<number>(me.team_id && team.has(me.team_id) ? me.team_id : teams[0]?.id);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<{ id: number; mode: 'swap' | 'move' } | null>(null);
  const [swapName, setSwapName] = useState('');
  const [moveTo, setMoveTo] = useState<number | ''>('');
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const checked = new Set(checks);
  const taken = new Set(sels.map((s) => s.player_key).filter(Boolean));
  const avail = pool.filter((p) => !taken.has(p.key));

  async function run(f: () => PromiseLike<{ error: { message: string } | null }>, ok?: string) {
    setBusy(true); setMsg(null);
    const { error } = await f();
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : ok ? { ok: true, text: ok } : null);
    if (!error) router.refresh();
    return !error;
  }

  const drafted = sels.filter((s) => s.player);
  const t = team.get(sel);
  const mine = drafted.filter((s) => s.team_id === sel);
  const list = t ? [...t.keepers.map((p) => ({ p, at: null as number | null, chg: false, key: p.key })), ...mine.map((s) => ({ p: s.player!, at: s.overall, chg: !!s.edited, key: `s${s.id}` }))] : [];
  const rows = drafted.concat(sels.filter((s) => !s.player && s.edited)).filter((s) => {
    const x = q.trim().toLowerCase();
    return !x || String(s.overall) === x || s.player?.n.toLowerCase().includes(x) || tn(s.team_id).toLowerCase().includes(x);
  }).sort((a, b) => (a.overall ?? 999) - (b.overall ?? 999));
  const open = requests.filter((r) => r.status === 'open');
  const left = teams.length - teams.filter((x) => checked.has(x.id)).length;

  return (
    <>
      <div className="dc-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span className="k">{DRAFT_YEAR} national draft</span><span className="dc-pill">Awaiting sign-off</span>
          <h1>That&apos;s the draft done</h1>
          <p>Check your new list. Tick &ldquo;My picks look right&rdquo;, or ask the commish for a change. Nothing goes into squads until the commish signs off and posts it.</p>
        </div>
        <div className="dc-stats"><div><b>{counts.drafted}</b><span>Drafted</span></div><div><b>{counts.na}</b><span>N/A picks</span></div><div><b>{teams.length - left}/{teams.length}</b><span>Coaches checked</span></div></div>
      </div>
      {msg && <div className={msg.ok ? 'rv-banner' : 'dc-warn'} style={{ marginTop: 12 }} role="status">{msg.text}</div>}

      <div className="dc-grid">
        <div className="dc-col">
          <div className="dc-card">
            <span className="dc-ck">New {DRAFT_YEAR} lists</span>
            <div className="rv-clubs">
              {teams.map((x) => <button key={x.id} className={x.id === sel ? 'on' : ''} onClick={() => setSel(x.id)}><i className={checked.has(x.id) ? 'ok' : ''} />{x.name}</button>)}
            </div>
            {t && (<>
              <div><b style={{ fontSize: 17 }}>{t.name}</b><div className="dc-dim">{t.coach} · {t.keepers.length} keepers + {mine.length} drafted = {t.keepers.length + mine.length} players</div></div>
              <div className="rv-lines">
                {LINES.map((l) => {
                  const ps = list.filter((x) => x.p.pos === l);
                  return (
                    <div key={l} className="rv-ln"><span>{l} · {ps.length}</span>
                      <div>{ps.map((x) => (
                        <div key={x.key} className={`rv-pp ${x.at != null || x.chg ? (x.chg ? 'chg' : 'new') : ''}`}>
                          <Chip club={x.p.club} /><span className="nm">{x.p.n}</span>{x.p.rookie && <span className="rv-rook">ROOKIE</span>}<em>{x.at != null ? `#${x.at}` : ''}</em>
                        </div>
                      ))}</div>
                    </div>
                  );
                })}
              </div>
              {sel === me.team_id ? (checked.has(sel) ? (
                <div className="rv-bar done"><span>✓ You&apos;ve confirmed your picks. The commish can see that.</span>
                  <button className="dc-btn sm" disabled={busy} onClick={() => run(() => supabase.from('draft_room_checks').delete().match({ year: DRAFT_YEAR, team_id: sel }))}>Undo</button></div>
              ) : (<>
                <div className="rv-bar"><span><b>This is your list.</b> Happy with it?</span>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="dc-btn go" disabled={busy} onClick={() => run(() => supabase.from('draft_room_checks').insert({ year: DRAFT_YEAR, team_id: sel }), 'Thanks: you’ve confirmed your picks.')}>My picks look right</button>
                    <button className="dc-btn" onClick={() => setAsking((a) => !a)}>Ask for a change</button>
                  </span></div>
                {asking && (
                  <div className="rv-req">
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Pick 33 should have been Noah Mraz, I misclicked" maxLength={1000} />
                    <button className="dc-btn sm" disabled={busy || !note.trim()} onClick={async () => {
                      if (await run(() => supabase.from('draft_room_requests').insert({ year: DRAFT_YEAR, team_id: sel, body: note.trim() }), 'Sent. The commish will see it in Change requests.')) { setNote(''); setAsking(false); }
                    }}>Send to the commish</button>
                  </div>
                )}
              </>)) : <span className="dc-dim">{checked.has(sel) ? `✓ ${t.coach} has confirmed this list.` : `${t.coach} hasn’t checked this list yet.`}</span>}
            </>)}
          </div>

          <div className="dc-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}><h2>Every pick</h2><span className="dc-dim">{me.is_commish ? 'Fix anything here before you post' : 'Only the commish can change picks'}</span></div>
            <input className="rv-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a pick number, player or club" aria-label="Search picks" />
            <table className="rv-fix">
              <thead><tr><th>Pick</th><th>Club</th><th>Player</th>{me.is_commish && <th />}</tr></thead>
              <tbody>
                {rows.slice(0, q ? 40 : 12).map((s) => (
                  <tr key={s.id} className={s.edited ? 'chg' : ''}>
                    <td className="no">{s.overall ?? '+'}</td>
                    <td>{tn(s.team_id)}</td>
                    <td>{s.player ? <><Chip club={s.player.club} /> {s.player.n} <i className={`dc-pos ${s.player.pos}`}>{s.player.pos}</i></> : <span className="dc-dim">Cleared</span>}{s.edited && <span className="dc-dim"> · changed</span>}</td>
                    {me.is_commish && (
                      <td>
                        {editing?.id === s.id && editing.mode === 'swap' ? (
                          <span className="rv-acts">
                            <input list="rv-pool" value={swapName} onChange={(e) => setSwapName(e.target.value)} placeholder="Player name" aria-label="New player" />
                            <button className="dc-btn sm go" disabled={busy} onClick={async () => {
                              const p = avail.find((x) => x.n.toLowerCase() === swapName.trim().toLowerCase());
                              if (!p) { setMsg({ ok: false, text: 'Pick a player from the list.' }); return; }
                              if (await run(() => supabase.rpc('draft_room_edit', { sel: s.id, action: 'swap', pkey: p.key, pl: p }), `Pick ${s.overall ?? ''} is now ${p.n}.`)) { setEditing(null); setSwapName(''); }
                            }}>Save</button>
                            <button className="dc-btn sm" onClick={() => setEditing(null)}>Cancel</button>
                          </span>
                        ) : editing?.id === s.id && editing.mode === 'move' ? (
                          <span className="rv-acts">
                            <select value={moveTo} onChange={(e) => setMoveTo(e.target.value ? Number(e.target.value) : '')} aria-label="Move to club">
                              <option value="">Move to…</option>
                              {teams.filter((x) => x.id !== s.team_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                            <button className="dc-btn sm go" disabled={busy || moveTo === ''} onClick={async () => {
                              if (await run(() => supabase.rpc('draft_room_edit', { sel: s.id, action: 'move', team: moveTo }), `Moved to ${tn(Number(moveTo))}.`)) { setEditing(null); setMoveTo(''); }
                            }}>Save</button>
                            <button className="dc-btn sm" onClick={() => setEditing(null)}>Cancel</button>
                          </span>
                        ) : (
                          <span className="rv-acts">
                            <button className="dc-btn sm" onClick={() => { setEditing({ id: s.id, mode: 'swap' }); setSwapName(''); }}>Swap player</button>
                            <button className="dc-btn sm" onClick={() => { setEditing({ id: s.id, mode: 'move' }); setMoveTo(''); }}>Move club</button>
                            {s.player && <button className="dc-btn sm red" disabled={busy} onClick={() => { if (window.confirm(`Clear pick ${s.overall ?? ''} (${s.player!.n})? ${tn(s.team_id)} lose that player.`)) run(() => supabase.rpc('draft_room_edit', { sel: s.id, action: 'clear' }), 'Pick cleared.'); }}>Clear pick</button>}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="rv-pool">{avail.slice(0, 400).map((p) => <option key={p.key} value={p.n}>{p.club} · {p.pos}</option>)}</datalist>
            {rows.length > (q ? 40 : 12) && <span className="dc-dim">Showing {q ? 40 : 12} of {rows.length}. Search to find a pick.</span>}
          </div>
        </div>

        <div className="dc-col">
          {me.is_commish ? (
            <div className="dc-card dc-commish">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2>Sign off &amp; post</h2><span className="dc-ck">Commish only</span></div>
              <span className="dc-ck">Coaches who&apos;ve checked their picks</span>
              <div className="rv-ticks">{teams.map((x) => <span key={x.id}><i className={checked.has(x.id) ? 'ok' : ''}>{checked.has(x.id) ? '✓' : ''}</i>{x.name}</span>)}</div>
              <span className="dc-ck">Change requests</span>
              {open.length ? open.map((r) => (
                <div key={r.id} className="rv-rq">
                  <span><b>{tn(r.team_id)}</b> · {team.get(r.team_id)?.coach}: &ldquo;{r.body}&rdquo;</span>
                  <span className="rv-acts" style={{ justifyContent: 'flex-start' }}>
                    <button className="dc-btn sm go" disabled={busy} onClick={() => run(() => supabase.from('draft_room_requests').update({ status: 'done' }).eq('id', r.id))}>Mark done</button>
                    <button className="dc-btn sm" disabled={busy} onClick={() => run(() => supabase.from('draft_room_requests').update({ status: 'declined' }).eq('id', r.id))}>Decline</button>
                  </span>
                </div>
              )) : <span className="dc-dim">No open requests.</span>}
              <span className="dc-ck">When you post</span>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 13 }}>
                <li><b>{counts.drafted}</b> drafted players join their new club&apos;s squad, tagged &ldquo;{DRAFT_YEAR} draft&rdquo;.</li>
                <li><b>{counts.created}</b> unowned players and 2026 draftees are added to the player database first.</li>
                {counts.moved > 0 && <li><b>{counts.moved}</b> player{counts.moved > 1 ? 's' : ''} not kept but re-drafted move to their new club.</li>}
                <li><b>{counts.released}</b> players not kept or drafted come off their old list and go back to free agency.</li>
                <li>A <b>&ldquo;{DRAFT_YEAR} Draft results&rdquo;</b> news post goes up for everyone.</li>
                <li>The draft room locks. A snapshot of every list is saved so you can undo the post.</li>
              </ul>
              <button className="dc-btn go big" disabled={busy} onClick={() => { setTyped(''); setConfirm(true); }}>Sign off and post the draft</button>
              <span className="dc-dim">{left ? `${left} coach${left > 1 ? 'es' : ''} haven’t ticked yet. You can still post.` : 'Every coach has ticked. Good to go.'}</span>
            </div>
          ) : (
            <div className="dc-card">
              <h2>Who&apos;s checked their picks</h2>
              <div className="rv-ticks">{teams.map((x) => <span key={x.id}><i className={checked.has(x.id) ? 'ok' : ''}>{checked.has(x.id) ? '✓' : ''}</i>{x.name}</span>)}</div>
              {requests.filter((r) => r.team_id === me.team_id).map((r) => (
                <div key={r.id} className={`rv-rq ${r.status !== 'open' ? 'closed' : ''}`}><span>Your request: &ldquo;{r.body}&rdquo;</span><span className="dc-dim">{r.status === 'open' ? 'Waiting on the commish' : r.status === 'done' ? 'Done' : 'Declined'}</span></div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirm && (
        <div className="rv-modal" role="dialog" aria-modal="true" aria-label="Post the draft">
          <div className="rv-mbox">
            <h3>Post the {DRAFT_YEAR} draft?</h3>
            <p style={{ margin: 0 }}>This updates every club&apos;s squad, adds {counts.created} new players, sends {counts.released} to free agency and publishes the results. You can undo it afterwards from the Draft Centre.</p>
            <label className="dc-dim" htmlFor="rv-post">Type <b>POST</b> to confirm</label>
            <input id="rv-post" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="dc-btn" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="dc-btn go" disabled={busy || typed.trim().toUpperCase() !== 'POST'} onClick={async () => {
                setBusy(true);
                const r = await postDraft();
                setBusy(false); setConfirm(false);
                if (r.ok) router.refresh(); else setMsg({ ok: false, text: r.error ?? 'Something went wrong.' });
              }}>{busy ? 'Posting…' : 'Sign off and post'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function UndoPostButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className="dc-btn red" disabled={busy} onClick={async () => {
      if (!window.confirm('Undo the post? Every list goes back to how it was before posting, the news post comes down, and the draft returns to awaiting sign-off. The picks themselves stay.')) return;
      setBusy(true);
      const r = await unpostDraft();
      setBusy(false);
      if (r.ok) router.refresh(); else alert(r.error);
    }}>{busy ? 'Undoing…' : 'Undo posting'}</button>
  );
}
