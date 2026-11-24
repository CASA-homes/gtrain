'use client';
// Start your league: 1 name it, 2 clubs, draft day and rules, 3 how squads get filled, 4 invite your coaches.
// The league is created at the end of step 2; steps 3 and 4 work on the new league.
import { useState, useTransition } from 'react';
import { KeeperMark } from '@/components/KeeperMark';
import { createLeague, type LeagueRules } from './actions';
import { setSetupMode } from '@/app/(app)/league/setup/actions';

const SIZES = [6, 8, 10, 12, 14];
/** The standard keeper rules (G-Train's). */
const STD: Omit<LeagueRules, 'clubs'> = {
  rounds: 16, keepers: 18, list_size: 33, lineup: { DEF: 5, MID: 7, RUC: 1, FWD: 5 },
  start_kt: 1000, keeper_cap: 925, season_cap: 1150, deficit_max: 20, home_grown_pct: 20,
  draft_r1: 30, draft_r2: 25, draft_r3: 20, draft_r4: 15, draft_rest: 10, rookie_pct: 50,
};
const STEPS = ['Name', 'Clubs and rules', 'Squads', 'Invite'];
/** Perth has no daylight saving: +08:00 all year. */
const fromPerthInput = (v: string) => new Date(`${v}:00+08:00`).toISOString();

export function StartWizard({ defaultCoach }: { defaultCoach: string }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [club, setClub] = useState('');
  const [coach, setCoach] = useState(defaultCoach);
  const [clubs, setClubs] = useState(10);
  const [names, setNames] = useState<string[]>([]);
  const [draftAt, setDraftAt] = useState('');
  const [custom, setCustom] = useState(false);
  const [r, setR] = useState(STD);
  const set = (k: keyof typeof STD, v: number) => setR({ ...r, [k]: Number.isFinite(v) ? v : 0 });
  const setLine = (k: 'DEF' | 'MID' | 'RUC' | 'FWD', v: number) => setR({ ...r, lineup: { ...r.lineup, [k]: v } });
  const starters = r.lineup.DEF + r.lineup.MID + r.lineup.RUC + r.lineup.FWD;
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ leagueId: number; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<'picks' | 'draft' | 'import' | null>(null);
  const choose = (m: 'picks' | 'draft' | 'import') => start(async () => {
    setErr(null);
    const res = await setSetupMode(m);
    if (!res.ok) return setErr(res.error);
    setMode(m);
    if (m === 'import') window.location.assign('/league/import?via=sheet');
    else setStep(3);
  });

  const next1 = () => {
    if (name.trim().length < 3) return setErr('Give your league a name (3 letters or more).');
    if (club.trim().length < 2) return setErr('Name your club.');
    setErr(null); setStep(1);
  };
  const create = () => start(async () => {
    setErr(null);
    if (!draftAt) return setErr('Pick your draft day and time.');
    const draftIso = fromPerthInput(draftAt);
    if (Date.parse(draftIso) <= Date.now()) return setErr('Pick a draft day in the future.');
    const rules = custom ? r : STD;
    if (rules.season_cap < rules.keeper_cap) return setErr('The soft cap has to be at least the keeper cap.');
    if (rules.list_size < rules.keepers + 4) return setErr('The list needs room for at least 4 draftees beyond your keepers.');
    if (rules.list_size < starters + 4) return setErr('The list has to fit your starting team plus a bench.');
    const res = await createLeague({ name, club, coach, names: [club, ...Array.from({ length: clubs - 1 }, (_, i) => names[i + 1] ?? '')], rules: { ...rules, clubs, draft_at: draftIso } });
    if (!res.ok) return setErr(res.error);
    setMade({ leagueId: res.leagueId, code: res.code }); setStep(2);
  });
  const link = made ? `${typeof window !== 'undefined' ? window.location.origin : 'https://keeperhq.au'}/join/${made.code}` : '';
  const share = async () => {
    const text = `Join ${name} on Keeper HQ. Pick your club here:`;
    try {
      if (navigator.share) await navigator.share({ title: name, text, url: link });
      else { await navigator.clipboard.writeText(`${text} ${link}`); setCopied(true); }
    } catch { /* cancelled */ }
  };

  return (
    <main className="st-page">
      <div className="st-card">
        <div className="st-brand"><KeeperMark size={28} /><span className="khq-wm" style={{ fontSize: 20 }}>Keeper<b>HQ</b></span></div>
        <ol className="st-steps" aria-label="Setup steps">{STEPS.map((l, i) => <li key={l} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}><span>{l}</span></li>)}</ol>
        <span className="eyebrow">Step {step + 1} of 4</span>

        {step === 0 && <>
          <h1 className="st-h">Start your league</h1>
          <label className="st-lab" htmlFor="st-name">League name</label>
          <input id="st-name" className="lg-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="The Footy Syndicate" maxLength={60} autoFocus />
          <label className="st-lab" htmlFor="st-club">Your club</label>
          <input id="st-club" className="lg-in" value={club} onChange={(e) => setClub(e.target.value)} placeholder="Bodega Boys" maxLength={40} />
          <label className="st-lab" htmlFor="st-coach">Your name</label>
          <input id="st-coach" className="lg-in" value={coach} onChange={(e) => setCoach(e.target.value)} placeholder="Christian" maxLength={40} />
          {err && <p role="alert" className="lg-err">{err}</p>}
          <button className="lg-btn" onClick={next1}>Next: clubs</button>
        </>}

        {step === 1 && <>
          <h1 className="st-h">Clubs and rules</h1>
          <span className="st-lab">How many clubs</span>
          <div className="st-seg">{SIZES.map((n) => <button key={n} type="button" aria-pressed={clubs === n} onClick={() => setClubs(n)}>{n}</button>)}</div>
          <details className="st-more">
            <summary>Name the other clubs now (optional)</summary>
            <div className="st-names">
              {Array.from({ length: clubs - 1 }, (_, i) => i + 1).map((i) => (
                <input key={i} className="lg-in" placeholder={`Club ${i + 1}`} value={names[i] ?? ''} maxLength={40}
                  onChange={(e) => { const c = [...names]; c[i] = e.target.value; setNames(c); }} aria-label={`Club ${i + 1} name`} />
              ))}
            </div>
            <p className="st-hint">Coaches can rename their own club when they join.</p>
          </details>
          <label className="st-lab" htmlFor="st-draft">Draft day</label>
          <input id="st-draft" className="lg-in" type="datetime-local" value={draftAt} onChange={(e) => setDraftAt(e.target.value)} />
          <p className="st-hint" style={{ marginTop: 4 }}>Perth time. Keeper contracts lock when the draft starts. You can move it later in the draft centre.</p>
          <span className="st-lab">Rules</span>
          <button type="button" className="st-opt" aria-pressed={!custom} onClick={() => setCustom(false)}>
            <b>Standard keeper</b><span>{STD.keepers} keepers (incl. a rookie) · {STD.list_size}-man lists · ${STD.keeper_cap}k keeper cap · ${STD.season_cap}k soft cap · {STD.start_kt.toLocaleString()} KT each · {STD.rounds}-round draft</span>
          </button>
          <button type="button" className="st-opt" aria-pressed={custom} onClick={() => setCustom(true)}>
            <b>Customise</b><span>Set your own caps, keepers and draft rounds</span>
          </button>
          {custom && (
            <div className="st-custom">
              <fieldset><legend>Lists</legend>
                <div className="st-grid">
                  <Num label="Keepers (incl. 1 rookie)" v={r.keepers} min={6} max={30} on={(v) => set('keepers', v)} />
                  <Num label="List size" v={r.list_size} min={15} max={50} on={(v) => set('list_size', v)} />
                  <Num label="Draft rounds" v={r.rounds} min={4} max={40} on={(v) => set('rounds', v)} />
                  <Num label="Starting KT per club" v={r.start_kt} min={0} max={100000} step={100} on={(v) => set('start_kt', v)} />
                </div>
              </fieldset>
              <fieldset><legend>Starting team · {starters} on field</legend>
                <div className="st-grid four">
                  {(['DEF', 'MID', 'RUC', 'FWD'] as const).map((k) => <Num key={k} label={k} v={r.lineup[k]} min={1} max={k === 'RUC' ? 3 : 12} on={(v) => setLine(k, v)} />)}
                </div>
              </fieldset>
              <fieldset><legend>Salary cap</legend>
                <div className="st-grid">
                  <Num label="Keeper cap ($k)" v={r.keeper_cap} min={300} max={3000} step={25} on={(v) => set('keeper_cap', v)} />
                  <Num label="Soft cap, in season ($k)" v={r.season_cap} min={300} max={4000} step={25} on={(v) => set('season_cap', v)} />
                  <Num label="Max over keeper cap ($k)" v={r.deficit_max} min={0} max={200} step={5} on={(v) => set('deficit_max', v)} />
                  <Num label="Home-grown discount (%)" v={r.home_grown_pct} min={0} max={60} on={(v) => set('home_grown_pct', v)} />
                </div>
              </fieldset>
              <fieldset><legend>Draftee salaries ($k a year)</legend>
                <div className="st-grid">
                  <Num label="Round 1, picks 1 to 10" v={r.draft_r1} min={1} max={200} on={(v) => set('draft_r1', v)} />
                  <Num label="Round 1 rest and round 2" v={r.draft_r2} min={1} max={200} on={(v) => set('draft_r2', v)} />
                  <Num label="Round 3" v={r.draft_r3} min={1} max={200} on={(v) => set('draft_r3', v)} />
                  <Num label="Round 4" v={r.draft_r4} min={1} max={200} on={(v) => set('draft_r4', v)} />
                  <Num label="Round 5 onwards" v={r.draft_rest} min={1} max={200} on={(v) => set('draft_rest', v)} />
                  <Num label="Rookies pay (% of that)" v={r.rookie_pct} min={10} max={100} step={5} on={(v) => set('rookie_pct', v)} />
                </div>
              </fieldset>
              <p className="st-hint">Over the keeper cap: allowed up to your max at lock-in, but the overage comes off next year&apos;s cap and costs KT. Everything else follows the standard keeper rules and can be changed later in league settings.</p>
            </div>
          )}
          {err && <p role="alert" className="lg-err">{err}</p>}
          <div className="st-row">
            <button type="button" className="lg-alt" onClick={() => setStep(0)}>Back</button>
            <button className="lg-btn" disabled={pending} onClick={create}>{pending ? 'Creating…' : 'Create league'}</button>
          </div>
        </>}

        {step === 2 && made && <>
          <h1 className="st-h">How do squads get filled?</h1>
          <p className="st-hint" style={{ marginTop: 0 }}>{name} is set up. Already playing somewhere else? Coaches bring their own squads across. Brand new? Run a draft.</p>
          <button type="button" className="st-opt" disabled={pending} onClick={() => choose('picks')}><b>Coaches pick their own players</b><span>Each coach ticks their current squad off the AFL list. First in gets the player, and you sign every squad off.</span></button>
          <button type="button" className="st-opt" disabled={pending} onClick={() => choose('draft')}><b>Start from scratch with a draft</b><span>Brand new league. Everyone drafts from an empty pool in the draft room.</span></button>
          <button type="button" className="st-opt" disabled={pending} onClick={() => choose('import')}><b>I’ve got a spreadsheet</b><span>Upload every club’s list yourself: one row per player, with their club or coach.</span></button>
          {err && <p role="alert" className="lg-err">{err}</p>}
          <p className="st-hint">You can change this later from League settings.</p>
        </>}

        {step === 3 && made && <>
          <h1 className="st-h">Invite your coaches</h1>
          <div className="st-code"><span className="eyebrow">League code</span><b>{made.code}</b></div>
          <button className="lg-btn" onClick={share}>{copied ? 'Invite link copied' : 'Share invite link'}</button>
          <a className="lg-alt" href={`mailto:?subject=${encodeURIComponent(`Join ${name} on Keeper HQ`)}&body=${encodeURIComponent(`Pick your club here: ${link}`)}`}>Email invites</a>
          <p className="st-hint">{mode === 'picks'
            ? 'Coaches pick their club when they join and you approve them. Then they tick their squad off the AFL list, and you sign each one off on the squad board.'
            : 'Coaches pick their club when they join, and you approve them. Set your draft order in the draft centre. You can change everything later in league settings.'}</p>
          <a className="lg-btn" style={{ background: 'var(--khq-sage-deep)' }} href={`/auth/enter?l=${made.leagueId}${mode === 'picks' ? '&next=/league/setup' : mode === 'draft' ? '&next=/draft/centre' : ''}`}>{mode === 'picks' ? 'Pick your own squad' : mode === 'draft' ? 'Go to the draft centre' : 'Go to your clubhouse'}</a>
        </>}
      </div>
    </main>
  );
}

function Num({ label, v, on, min, max, step = 1 }: { label: string; v: number; on: (v: number) => void; min: number; max: number; step?: number }) {
  // Free typing; snapped into range when the field loses focus.
  const [raw, setRaw] = useState(String(v));
  return (
    <label>{label}
      <input type="number" inputMode="numeric" className="lg-in" min={min} max={max} step={step} value={raw}
        onChange={(e) => { setRaw(e.target.value); const n = Number(e.target.value); if (e.target.value !== '' && n >= min && n <= max) on(n); }}
        onBlur={() => { const n = Math.max(min, Math.min(max, Number(raw) || min)); setRaw(String(n)); on(n); }} />
    </label>
  );
}
