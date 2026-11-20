'use client';
// Import your league: upload (spreadsheet now, screenshots next) → check every club and player → import.
// Nothing is saved until the commish presses Import.
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { commitImport, parseSheet, searchPlayers, syncPlayerList, type Preview, type PreviewRow } from './actions';

type Team = { id: number; name: string };
type Look = Preview['players'];
const STATUS: Record<PreviewRow['status'], { label: string; cls: string }> = {
  sure: { label: 'Matched', cls: 'ok' }, check: { label: 'Check', cls: 'warn' }, many: { label: 'Pick one', cls: 'warn' }, none: { label: 'Not found', cls: 'bad' },
};

export function ImportFlow({ via, teams, playerCount, onLists }: { via: 'sheet' | 'screens'; teams: Team[]; playerCount: number; onLists: number }) {
  const [tab, setTab] = useState<'sheet' | 'screens'>(via);
  const [pv, setPv] = useState<Preview | null>(null);
  const [look, setLook] = useState<Look>({});
  const [map, setMap] = useState<number[]>([]);
  const [rename, setRename] = useState<boolean[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ clubs: number; players: number } | null>(null);
  const [synced, setSynced] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = (p: Preview) => {
    setPv(p); setLook(p.players);
    // Map each imported club to a league club: same name first, then in order.
    const free = [...teams];
    const m = p.clubs.map((c) => { const i = free.findIndex((t) => t.name.toLowerCase() === c.name.toLowerCase()); return i >= 0 ? free.splice(i, 1)[0].id : 0; });
    setMap(m.map((id) => id || free.shift()?.id || 0));
    setRename(p.clubs.map(() => true));
  };
  const upload = (form: FormData) => start(async () => { setErr(null); const r = await parseSheet(form); if (!r.ok) return setErr(r.error); load(r); });
  const sync = () => start(async () => { const r = await syncPlayerList(); setSynced(r.ok ? `${r.added} players added. ${r.total} in the list.` : r.error); });

  const setRow = (ci: number, ri: number, patch: Partial<PreviewRow> | null) => setPv((p) => p && ({
    ...p, clubs: p.clubs.map((c, i) => i !== ci ? c : { ...c, rows: patch === null ? c.rows.filter((_, j) => j !== ri) : c.rows.map((r, j) => j !== ri ? r : { ...r, ...patch }) }),
  }));
  const counts = useMemo(() => {
    const rows = pv?.clubs.flatMap((c) => c.rows) ?? [];
    return { all: rows.length, ok: rows.filter((r) => r.status === 'sure' && r.id).length, check: rows.filter((r) => r.status === 'check' || r.status === 'many').length, none: rows.filter((r) => r.status === 'none').length };
  }, [pv]);
  const dupTeams = map.filter((id, i) => id && map.indexOf(id) !== i).length > 0;
  const commit = () => start(async () => {
    if (!pv) return;
    setErr(null);
    if (dupTeams) return setErr('Two imported clubs are going to the same league club. Change one of them.');
    const payload = pv.clubs.map((c, i) => ({ team_id: map[i], name: rename[i] ? c.name : null, players: c.rows.filter((r) => r.id && r.status !== 'none').map((r) => r.id!) })).filter((c) => c.team_id);
    const seen = new Set<number>();
    for (const c of payload) for (const id of c.players) { if (seen.has(id)) return setErr(`${look[id]?.name ?? 'A player'} is on two clubs. Remove one.`); seen.add(id); }
    const r = await commitImport(payload);
    if (!r.ok) return setErr(r.error);
    setDone({ clubs: r.clubs, players: r.players });
  });

  if (done) return (
    <section className="card im-card">
      <h2 className="im-h">Imported {done.players} players into {done.clubs} clubs</h2>
      <p className="muted" style={{ margin: 0 }}>Next: set every club&apos;s keepers on contracts in Contracts, then invite your coaches if you haven&apos;t.</p>
      <div className="im-row"><Link className="btn dark" href="/clubhouse">Go to your clubhouse</Link><Link className="btn" href="/contracts/admin">Set up contracts</Link></div>
    </section>
  );

  return (
    <>
      {!pv && (
        <section className="card im-card">
          <nav className="bf-tabs" aria-label="Import from"><button className={tab === 'sheet' ? 'on' : ''} onClick={() => setTab('sheet')}>Spreadsheet</button><button className={tab === 'screens' ? 'on' : ''} onClick={() => setTab('screens')}>Screenshots</button></nav>
          {onLists > 0 && <p role="note" className="im-warn">Your clubs already have {onLists} players. Importing replaces every list in this league.</p>}
          {tab === 'sheet' ? (
            <form action={upload} className="im-form">
              <label className="im-drop"><input type="file" name="file" accept=".xlsx,.csv,.tsv,.txt" /><span><b>Choose a spreadsheet</b> · .xlsx or .csv</span></label>
              <label className="st-lab" htmlFor="im-paste">Or paste your lists</label>
              <textarea id="im-paste" name="text" className="lg-in im-paste" placeholder={'Coach,Player\nChristian,Nick Daicos\nChristian,Max Gawn\nFyfe,Sam Walsh'} />
              <p className="st-hint">Any of these work: a column for the club or coach and a column for the player; club names across the top with players underneath; or each club&apos;s name on its own line with its players below it.</p>
              {err && <p role="alert" className="lg-err">{err}</p>}
              <button className="btn dark" disabled={pending}>{pending ? 'Reading…' : 'Read my lists'}</button>
            </form>
          ) : (
            <div className="im-form"><p style={{ margin: 0 }}><b>Screenshots are next.</b> Upload team pages from any fantasy app and we&apos;ll read the players off them. Until then, a spreadsheet or pasted list works.</p></div>
          )}
          {playerCount < 600 && (
            <div className="im-sync">
              <span>Our player list has {playerCount} players. Load the rest of the AFL so every name can be found.</span>
              <button className="btn" onClick={sync} disabled={pending}>Load full AFL list</button>
              {synced && <span className="muted">{synced}</span>}
            </div>
          )}
        </section>
      )}

      {pv && (
        <section className="card im-card">
          <div className="im-top">
            <h2 className="im-h">Check your import</h2>
            <span className="eyebrow">{pv.clubs.length} clubs · {counts.all} players</span>
          </div>
          <div className="im-pills">
            <span className="bf-pill on">{counts.ok} matched</span>
            {counts.check > 0 && <span className="bf-pill due">{counts.check} check these</span>}
            {counts.none > 0 && <span className="bf-pill bad">{counts.none} not found</span>}
          </div>
          {pv.clubs.map((c, ci) => (
            <div key={ci} className="im-club">
              <div className="im-club-h">
                <b>{c.name}</b>
                <span className="im-map">→ <select className="input" value={map[ci] ?? 0} onChange={(e) => setMap(map.map((v, i) => i === ci ? Number(e.target.value) : v))} aria-label={`League club for ${c.name}`}>
                  <option value={0}>Don&apos;t import</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select></span>
                <label className="bf-tog"><input type="checkbox" checked={rename[ci] ?? true} onChange={(e) => setRename(rename.map((v, i) => i === ci ? e.target.checked : v))} /> Rename to “{c.name}”</label>
              </div>
              {c.rows.map((r, ri) => <Row key={ri} r={r} look={look} onLook={(l) => setLook({ ...look, ...l })} set={(p) => setRow(ci, ri, p)} />)}
            </div>
          ))}
          {err && <p role="alert" className="lg-err">{err}</p>}
          <div className="im-row im-foot">
            <button className="btn" onClick={() => setPv(null)}>Start again</button>
            <span className="muted">Nothing saves until you import. Players marked not found are left out.</span>
            <button className="btn dark" disabled={pending} onClick={commit}>{pending ? 'Importing…' : `Import ${map.filter(Boolean).length} clubs`}</button>
          </div>
        </section>
      )}
    </>
  );
}

function Row({ r, look, onLook, set }: { r: PreviewRow; look: Look; onLook: (l: Look) => void; set: (p: Partial<PreviewRow> | null) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ id: number; name: string; club: string | null; pos: string }[]>([]);
  const [, start] = useTransition();
  const p = r.id ? look[r.id] : null;
  const st = STATUS[r.status];
  const find = (v: string) => { setQ(v); if (v.trim().length >= 2) start(async () => setHits(await searchPlayers(v))); else setHits([]); };
  const choose = (h: { id: number; name: string; club: string | null; pos: string }) => { onLook({ [h.id]: { name: h.name, club: h.club, pos: h.pos } }); set({ id: h.id, status: 'sure' }); setHits([]); setQ(''); };
  return (
    <div className="im-r">
      <span className="im-raw">{r.raw}</span>
      <span className="im-to">{p ? <>{p.name} <em>{p.club} · {p.pos}</em></> : r.status === 'many' ? `${r.cands.length} possible players` : '—'}</span>
      <span className="im-act">
        <span className={`bf-pill ${st.cls === 'ok' ? 'on' : st.cls === 'warn' ? 'due' : 'bad'}`}>{st.label}</span>
        {r.status === 'check' && r.id && <button className="im-mini" onClick={() => set({ status: 'sure' })}>Yes</button>}
        {r.status === 'many' && (
          <select className="im-mini" value="" onChange={(e) => set({ id: Number(e.target.value), status: 'sure' })} aria-label="Pick the player">
            <option value="">Pick…</option>{r.cands.map((id) => <option key={id} value={id}>{look[id]?.name} · {look[id]?.club}</option>)}
          </select>
        )}
        {(r.status === 'none' || r.status === 'check') && (
          <span className="im-search">
            <input className="im-mini" value={q} onChange={(e) => find(e.target.value)} placeholder="Search" aria-label={`Search for ${r.raw}`} />
            {hits.length > 0 && <span className="im-hits">{hits.map((h) => <button key={h.id} onClick={() => choose(h)}>{h.name} <em>{h.club} · {h.pos}</em></button>)}</span>}
          </span>
        )}
        <button className="im-mini" onClick={() => set(null)} aria-label={`Remove ${r.raw}`}>✕</button>
      </span>
    </div>
  );
}
