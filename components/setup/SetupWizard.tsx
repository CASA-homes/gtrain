'use client';
// League setup wizard (mockup signed off 12 Nov 2026). Setup is just the league, the clubs and the coaches: rules start
// from a preset and every rule can be changed in League settings before the first draft.
//   Scratch: League → Rules → Coaches → Review
//   Import:  Source → Upload → Match players → Clubs & coaches → Review
import { useMemo, useState, useTransition } from 'react';
import { KeeperMark, KeeperWordmark } from '@/components/KeeperMark';
import { createLeague, type ClubIn } from '@/app/setup/actions';
import { matchSheet, runImport, type Match, type SheetRow } from '@/app/setup/import-actions';

type Path = 'scratch' | 'import' | null;
type Preset = 'classic' | 'dynasty' | 'later';
const STEPS: Record<'scratch' | 'import', [string, string][]> = {
  scratch: [['League', 'Name and clubs'], ['Rules', 'Pick a starting point'], ['Coaches', 'Who runs each club'], ['Review', 'Then launch']],
  import: [['Source', 'Where it lives now'], ['Upload', 'Your spreadsheet'], ['Match players', 'Check the names'], ['Clubs & coaches', 'Who runs each club'], ['Review', 'Then launch']],
};
const PRESETS: [Preset, string, string, string][] = [
  ['classic', 'Classic keeper', 'Keep 18 including a rookie spot, 33-man lists, straight draft, 90-second clock, picks tradeable 2 years ahead.', 'How G-Train plays'],
  ['dynasty', 'Dynasty', 'Keep your whole list, a small rookie draft each year, picks tradeable 3 years ahead.', 'Deepest long game'],
  ['later', 'Decide later', 'Start with Classic for now and set every rule yourself in League settings.', 'Get going now'],
];
const TEMPLATE = 'Club,Coach,Email,Player,AFL club,Keeper,Rookie keeper\nBodega Boys,Christian,coach@email.com,Bailey Smith,GEE,Y,\nBodega Boys,Christian,coach@email.com,Marcus Herbert,GCS,,Y\nSerong So’Right,Sam,sam@email.com,Nick Daicos,COL,Y,\n';

/** Minimal CSV: quoted fields, commas or tabs (pasted from a spreadsheet). */
function parseCsv(text: string): string[][] {
  const delim = text.split('\n')[0].includes('\t') ? '\t' : ',';
  const out: string[][] = []; let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; continue; }
    if (ch === '"') q = true; else if (ch === delim) { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); out.push(row); row = []; cur = ''; } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim()));
}
const yes = (s?: string) => /^(y|yes|true|1|x|k|rk)$/i.test((s ?? '').trim());

export function SetupWizard({ email, hasLeague }: { email: string; hasLeague: boolean }) {
  const [path, setPath] = useState<Path>(null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [season, setSeason] = useState(2027);
  const [scoring, setScoring] = useState<'afl' | 'sc'>('afl');
  const [preset, setPreset] = useState<Preset>('classic');
  const [clubs, setClubs] = useState<ClubIn[]>(() => Array.from({ length: 10 }, (_, i) => ({ name: '', coach: '', email: i === 0 ? email : '' })));
  const [myClub, setMyClub] = useState(0);
  const [sheet, setSheet] = useState('');
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: number; loaded?: number } | null>(null);
  const [pending, start] = useTransition();

  const steps = path ? STEPS[path] : [];
  const setCount = (n: number) => setClubs((cs) => Array.from({ length: Math.max(2, Math.min(18, n)) }, (_, i) => cs[i] ?? { name: '', coach: '', email: '' }));
  const updClub = (i: number, k: keyof ClubIn, v: string) => setClubs((cs) => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const unmatched = matches.filter((m) => m.playerId == null).length;
  const doubtful = matches.filter((m) => m.playerId != null && !m.sure).length;
  const dupes = useMemo(() => { const seen = new Map<number, number>(); for (const m of matches) if (m.playerId) seen.set(m.playerId, (seen.get(m.playerId) ?? 0) + 1); return new Set([...seen].filter(([, n]) => n > 1).map(([id]) => id)); }, [matches]);

  const readSheet = (text: string) => {
    const grid = parseCsv(text);
    if (grid.length < 2) { setMsg('That sheet looks empty. Keep the header row, then one row per player.'); return false; }
    const head = grid[0].map((h) => h.trim().toLowerCase());
    const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
    const cClub = col('club', 'team', 'fantasy club'), cPlayer = col('player', 'name'), cAfl = col('afl club', 'afl', 'afl team'), cK = col('keeper', 'kept'), cR = col('rookie'), cCoach = col('coach'), cEmail = col('email');
    if (cClub < 0 || cPlayer < 0) { setMsg('The sheet needs a Club column and a Player column (see the template).'); return false; }
    const rs: SheetRow[] = grid.slice(1).map((r) => ({ club: (r[cClub] ?? '').trim(), player: (r[cPlayer] ?? '').trim(), aflClub: cAfl >= 0 ? r[cAfl] : undefined, keeper: cK >= 0 && cK !== cR ? yes(r[cK]) : false, rookie: cR >= 0 ? yes(r[cR]) : false, coach: cCoach >= 0 ? (r[cCoach] ?? '').trim() : '', email: cEmail >= 0 ? (r[cEmail] ?? '').trim() : '' }))
      .filter((r) => r.club && r.player);
    if (!rs.length) { setMsg('No rows with both a club and a player.'); return false; }
    const names = [...new Set(rs.map((r) => r.club))];
    if (names.length < 2 || names.length > 20) { setMsg(`Found ${names.length} club${names.length === 1 ? '' : 's'}: a league needs 2 to 20.`); return false; }
    setRows(rs);
    setClubs(names.map((n) => { const r = rs.find((x) => x.club === n && (x.coach || x.email)); return { name: n.slice(0, 40), coach: r?.coach ?? '', email: r?.email ?? '' }; }));
    const mine = names.findIndex((n) => rs.some((r) => r.club === n && r.email?.toLowerCase() === email.toLowerCase()));
    setMyClub(mine >= 0 ? mine : 0);
    setMsg(null);
    return true;
  };

  const canNext = (() => {
    if (!path) return false;
    const s = steps[step]?.[0];
    if (s === 'League') return name.trim().length > 0;
    if (s === 'Coaches' || s === 'Clubs & coaches') return clubs.every((c) => c.name.trim()) && new Set(clubs.map((c) => c.name.trim().toLowerCase())).size === clubs.length && (path === 'scratch' || name.trim().length > 0);
    if (s === 'Upload') return sheet.trim().length > 0;
    if (s === 'Match players') return unmatched === 0 && dupes.size === 0;
    return true;
  })();

  const next = () => {
    setMsg(null);
    const s = steps[step][0];
    if (s === 'Upload') {
      if (!readSheet(sheet)) return;
      start(async () => {
        const r = await matchSheet(parseRowsForMatch());
        if (!r.ok) { setMsg(r.error ?? 'Couldn’t match players.'); return; }
        setMatches(r.matches); setStep(step + 1);
      });
      return;
    }
    setStep(Math.min(step + 1, steps.length - 1));
  };
  // readSheet sets rows async (state), so re-parse here for the match call
  const parseRowsForMatch = (): SheetRow[] => {
    const grid = parseCsv(sheet); const head = grid[0].map((h) => h.trim().toLowerCase());
    const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
    const cClub = col('club', 'team', 'fantasy club'), cPlayer = col('player', 'name'), cAfl = col('afl club', 'afl', 'afl team');
    return grid.slice(1).map((r) => ({ club: (r[cClub] ?? '').trim(), player: (r[cPlayer] ?? '').trim(), aflClub: cAfl >= 0 ? r[cAfl] : undefined })).filter((r) => r.club && r.player);
  };

  const launch = () => start(async () => {
    setMsg(null);
    const clubsOut = clubs.map((c, i) => (i === myClub ? { ...c, email } : c));
    if (path === 'scratch') {
      const r = await createLeague({ name, season, scoring, preset, clubs: clubsOut, myClub });
      if (!r.ok || !r.id) { setMsg(r.error ?? 'Couldn’t create the league.'); return; }
      setDone({ id: r.id });
    } else {
      const lists = matches.filter((m) => m.playerId != null).map((m) => ({ club: m.club, playerId: m.playerId!, keeper: !!rows[m.row]?.keeper, rookie: !!rows[m.row]?.rookie }));
      const r = await runImport({ name, season, scoring, preset, clubs: clubsOut, myClub, lists });
      if (!r.ok || !r.id) { setMsg(r.error ?? 'Couldn’t import the league.'); if (r.id) setDone({ id: r.id }); return; }
      setDone({ id: r.id, loaded: r.loaded });
    }
  });

  /* ---------------- screens ---------------- */
  const leagueFields = (
    <div className="su-grid">
      <label className="su-f"><span>League name</span><input className="su-in" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Saturday Keepers" /><small>Shown as the league’s title across the site</small></label>
      <label className="su-f"><span>First season</span><select className="su-in" value={season} onChange={(e) => setSeason(Number(e.target.value))}><option value={2027}>2027</option><option value={2026}>2026 (catch up)</option></select></label>
      {path === 'scratch' && <label className="su-f"><span>Number of clubs</span><input className="su-in" type="number" min={2} max={18} value={clubs.length} onChange={(e) => setCount(Number(e.target.value) || 2)} /><small>Even numbers keep the fixture tidy</small></label>}
      <div className="su-f"><span>Scoring</span>
        <div className="su-seg" role="group" aria-label="Scoring">{([['afl', 'AFL Fantasy'], ['sc', 'SuperCoach']] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={scoring === k} className={scoring === k ? 'on' : ''} onClick={() => setScoring(k)}>{l}</button>)}</div>
        <small>{scoring === 'sc' ? 'Live SuperCoach scores aren’t wired up yet: AFL Fantasy scores are used until they are.' : 'Points come from official scores each round'}</small>
      </div>
    </div>
  );
  const coachTable = (
    <div className="su-tbl">
      <div className="su-tr su-th"><span>Club</span><span>Coach</span><span>Email</span><span title="Your club">Mine</span></div>
      {clubs.map((c, i) => (
        <div key={i} className="su-tr">
          <input className="su-in" aria-label={`Club ${i + 1} name`} placeholder={`Club ${i + 1}`} value={c.name} maxLength={40} onChange={(e) => updClub(i, 'name', e.target.value)} />
          <input className="su-in" aria-label={`Club ${i + 1} coach`} placeholder="Coach’s name" value={c.coach} maxLength={40} onChange={(e) => updClub(i, 'coach', e.target.value)} />
          <input className="su-in" aria-label={`Club ${i + 1} email`} type="email" placeholder={i === myClub ? email : 'coach@email.com'} value={i === myClub ? email : c.email} disabled={i === myClub} onChange={(e) => updClub(i, 'email', e.target.value)} />
          <input type="radio" name="mine" aria-label={`I run club ${i + 1}`} checked={myClub === i} onChange={() => setMyClub(i)} />
        </div>
      ))}
      <p className="su-hint">Coaches with an email can sign in as soon as you launch: send them the invite from League settings. Leave an email blank to add it later.</p>
    </div>
  );

  const screen = (() => {
    if (done) return (
      <div className="su-done">
        <h2>Your league is live</h2>
        <p>{name} is set up and you’re the commish.{done.loaded != null ? ` ${done.loaded} players loaded onto lists.` : ''} Next: check the rules in League settings and send your coaches their invite.</p>
        {msg && <p className="su-err">{msg}</p>}
        <a className="su-btn" href={`/auth/league?id=${done.id}&next=/league/settings`}>Go to League settings →</a>
      </div>
    );
    if (!path) return (
      <div>
        <h2>How do you want to start?</h2>
        <p className="su-lead">Setup is just the league, the clubs and the coaches. Rules start from a preset and can be changed any time before your first draft.</p>
        <div className="su-paths">
          <button type="button" className="su-path rec" onClick={() => { setPath('import'); setStep(0); }}>
            <span className="su-tag">Recommended for existing leagues</span><h3>Import your league</h3><p>Already running a keeper league? Bring the clubs, coaches, lists and keepers across from a spreadsheet.</p><b>Import my league →</b>
          </button>
          <button type="button" className="su-path" onClick={() => { setPath('scratch'); setStep(0); }}>
            <h3>Start from scratch</h3><p>A brand-new league: name it, add the clubs and invite the coaches. Lists come from your first draft.</p><b>Start fresh →</b>
          </button>
        </div>
        <p className="su-hint">Joining someone else’s league? You don’t need this: ask your commish to add your email, then log in.{hasLeague ? ' ' : ''}{hasLeague && <a href="/clubhouse">Back to my league</a>}</p>
      </div>
    );
    const s = steps[step][0];
    if (s === 'League') return <div><h2>Your league</h2><p className="su-lead">Just the basics for now.</p>{leagueFields}</div>;
    if (s === 'Rules') return (
      <div>
        <h2>Pick a starting point</h2><p className="su-lead">Choose a rule set to start with. You can change any rule in League settings before your first draft.</p>
        <div className="su-paths three">{PRESETS.map(([k, t, d, tag]) => (
          <button key={k} type="button" aria-pressed={preset === k} className={`su-path ${preset === k ? 'rec' : ''}`} onClick={() => setPreset(k)}>
            <span className="su-tag">{preset === k ? 'Selected' : tag}</span><h3>{t}</h3><p>{d}</p>
          </button>))}</div>
        <p className="su-hint">Knockout Cup, bets, mini games and the league medal are on by default. Turn any of them off in League settings.</p>
      </div>
    );
    if (s === 'Coaches') return <div><h2>Clubs and coaches</h2><p className="su-lead">Name each club and add its coach. Tick the club you run.</p>{coachTable}</div>;
    if (s === 'Source') return (
      <div>
        <h2>Where does your league live now?</h2>
        <div className="su-paths">
          <div className="su-path rec" aria-current="true"><span className="su-tag">Selected</span><h3>Spreadsheet</h3><p>Excel, Google Sheets or CSV: one row per player with the club that holds him. Keepers optional.</p></div>
          <div className="su-path off"><h3>Keeper (keeperfantasy.com)</h3><p>Keeper doesn’t allow other sites to read leagues automatically, so a link import isn’t possible. Copy each club’s list from Keeper into the template instead: it takes a few minutes.</p></div>
        </div>
        <a className="su-link" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="keeper-hq-league-template.csv">Download the template (CSV)</a>
      </div>
    );
    if (s === 'Upload') return (
      <div>
        <h2>Upload your lists</h2>
        <p className="su-lead">Columns: <b>Club</b> and <b>Player</b> are required. <b>AFL club</b> helps tell two players with the same name apart; <b>Keeper</b>, <b>Rookie keeper</b> (Y), <b>Coach</b> and <b>Email</b> are optional.</p>
        <label className="su-drop"><b>Choose a .csv file</b><span>or paste straight from your spreadsheet below</span>
          <input type="file" accept=".csv,text/csv,.tsv,text/plain" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(setSheet); }} />
        </label>
        <textarea className="su-in su-area" rows={8} value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder={TEMPLATE} aria-label="Paste your sheet" />
        <a className="su-link" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="keeper-hq-league-template.csv">Download the template</a>
      </div>
    );
    if (s === 'Match players') return (
      <div>
        <h2>Check the player matches</h2>
        <p className="su-lead">Matched {matches.length - unmatched} of {matches.length} names to the AFL player list.{doubtful ? ` ${doubtful} we weren’t sure about are first: check them.` : ''}{unmatched ? ` ${unmatched} need picking.` : ''}{dupes.size ? ` ${dupes.size} player${dupes.size === 1 ? ' is' : 's are'} on two lists.` : ''}</p>
        <div className="su-tbl">
          <div className="su-tr su-th m"><span>In your sheet</span><span>Club</span><span>AFL player</span></div>
          {[...matches].sort((a, b) => Number(a.sure && a.playerId != null && !dupes.has(a.playerId)) - Number(b.sure && b.playerId != null && !dupes.has(b.playerId))).slice(0, 400).map((m) => (
            <div key={m.row} className={`su-tr m ${m.playerId == null || (m.playerId && dupes.has(m.playerId)) ? 'bad' : !m.sure ? 'warn' : ''}`}>
              <span>{m.input}</span><span className="su-dim">{m.club}</span>
              <select className="su-in" aria-label={`Match for ${m.input}`} value={m.playerId ?? ''} onChange={(e) => { const id = Number(e.target.value) || null; const o = m.options.find((x) => x.id === id); setMatches((ms) => ms.map((x) => (x.row === m.row ? { ...x, playerId: id, name: o?.name ?? null, aflClub: o?.aflClub ?? null, sure: true } : x))); }}>
                <option value="">{m.options.length ? 'Pick the right player' : 'Not found: remove this row from the sheet'}</option>
                {m.options.map((o) => <option key={o.id} value={o.id}>{o.name}{o.aflClub ? ` (${o.aflClub})` : ''}</option>)}
              </select>
            </div>
          ))}
        </div>
        {unmatched > 0 && <p className="su-hint">Can’t find someone? He may have been delisted. Remove the row from your sheet, go back and upload again.</p>}
      </div>
    );
    if (s === 'Clubs & coaches') return <div><h2>Clubs and coaches</h2><p className="su-lead">From your sheet. Name the league, check each coach, and tick the club you run.</p>{leagueFields}{coachTable}</div>;
    // Review
    const rowsList: [string, string][] = [
      ['League', name || '–'], ['First season', String(season)], ['Scoring', scoring === 'afl' ? 'AFL Fantasy' : 'SuperCoach'],
      ['Rules', PRESETS.find((p) => p[0] === preset)![1] + ' (change any time in League settings)'],
      ['Clubs', `${clubs.length}: ${clubs.map((c) => c.name).join(', ')}`], ['You run', clubs[myClub]?.name ?? '–'],
      ['Coach invites', `${clubs.filter((c, i) => i !== myClub && c.email.trim()).length} of ${clubs.length - 1} with an email`],
      ...(path === 'import' ? [['Players on lists', String(matches.length)], ['Keepers', String(rows.filter((r) => r.keeper || r.rookie).length)]] as [string, string][] : []),
    ];
    return (
      <div><h2>Review and launch</h2><p className="su-lead">You’ll be the commish. You can change everything here later.</p>
        <dl className="su-review">{rowsList.map(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={k + 'v'}>{v}</dd>])}</dl>
      </div>
    );
  })();

  return (
    <main className="su">
      <header className="su-top"><a href="/" className="su-brand"><KeeperMark size={28} /><KeeperWordmark /></a><span className="su-me">{email}</span></header>
      <section className="su-card" aria-label="League setup">
        {path && !done && (
          <ol className="su-steps">
            {steps.map(([t, sub], i) => <li key={t} className={i === step ? 'on' : i < step ? 'done' : ''}><b>{i + 1}. {t}</b><span>{sub}</span></li>)}
          </ol>
        )}
        <div className="su-body">
          {screen}
          {msg && !done && <p className="su-err" role="alert">{msg}</p>}
          {path && !done && (
            <div className="su-foot">
              <button type="button" className="su-btn ghost" onClick={() => { setMsg(null); if (step === 0) setPath(null); else setStep(step - 1); }}>← Back</button>
              {step < steps.length - 1
                ? <button type="button" className="su-btn" disabled={!canNext || pending} onClick={next}>{pending ? 'Working…' : 'Continue →'}</button>
                : <button type="button" className="su-btn" disabled={pending || !name.trim()} onClick={launch}>{pending ? 'Launching…' : path === 'import' ? 'Import and launch' : 'Launch league'}</button>}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
