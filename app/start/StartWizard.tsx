'use client';
// Start your league: 1 name it, 2 clubs and rules, 3 bring your league in, 4 invite your coaches.
// The league is created at the end of step 2; steps 3 and 4 work on the new league.
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { KeeperMark } from '@/components/KeeperMark';
import { createLeague } from './actions';

const SIZES = [6, 8, 10, 12, 14];
const STEPS = ['Name', 'Clubs and rules', 'Bring it in', 'Invite'];

export function StartWizard({ defaultCoach }: { defaultCoach: string }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [club, setClub] = useState('');
  const [coach, setCoach] = useState(defaultCoach);
  const [clubs, setClubs] = useState(10);
  const [names, setNames] = useState<string[]>([]);
  const [custom, setCustom] = useState(false);
  const [keeperCap, setKeeperCap] = useState(925);
  const [seasonCap, setSeasonCap] = useState(1150);
  const [keepers, setKeepers] = useState(18);
  const [rounds, setRounds] = useState(16);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ leagueId: number; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const next1 = () => {
    if (name.trim().length < 3) return setErr('Give your league a name (3 letters or more).');
    if (club.trim().length < 2) return setErr('Name your club.');
    setErr(null); setStep(1);
  };
  const create = () => start(async () => {
    setErr(null);
    if (seasonCap < keeperCap) return setErr('The season cap has to be at least the keeper cap.');
    const r = await createLeague({ name, club, coach, clubs, names: [club, ...Array.from({ length: clubs - 1 }, (_, i) => names[i + 1] ?? '')], keeperCap, seasonCap, keepers, rounds });
    if (!r.ok) return setErr(r.error);
    setMade({ leagueId: r.leagueId, code: r.code }); setStep(2);
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
          <span className="st-lab">Rules</span>
          <button type="button" className="st-opt" aria-pressed={!custom} onClick={() => setCustom(false)}>
            <b>Standard keeper</b><span>{keepers} keepers · ${keeperCap}k keeper cap · ${seasonCap}k season cap · {rounds}-round draft · contracts and KT</span>
          </button>
          <button type="button" className="st-opt" aria-pressed={custom} onClick={() => setCustom(true)}>
            <b>Customise</b><span>Set your own caps, keepers and draft rounds</span>
          </button>
          {custom && (
            <div className="st-grid">
              <label>Keepers<input type="number" className="lg-in" min={10} max={30} value={keepers} onChange={(e) => setKeepers(Number(e.target.value))} /></label>
              <label>Draft rounds<input type="number" className="lg-in" min={4} max={40} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} /></label>
              <label>Keeper cap ($k)<input type="number" className="lg-in" min={500} max={2000} step={25} value={keeperCap} onChange={(e) => setKeeperCap(Number(e.target.value))} /></label>
              <label>Season cap ($k)<input type="number" className="lg-in" min={500} max={2500} step={25} value={seasonCap} onChange={(e) => setSeasonCap(Number(e.target.value))} /></label>
            </div>
          )}
          {err && <p role="alert" className="lg-err">{err}</p>}
          <div className="st-row">
            <button type="button" className="lg-alt" onClick={() => setStep(0)}>Back</button>
            <button className="lg-btn" disabled={pending} onClick={create}>{pending ? 'Creating…' : 'Create league'}</button>
          </div>
        </>}

        {step === 2 && made && <>
          <h1 className="st-h">Bring your league in</h1>
          <p className="st-hint" style={{ marginTop: 0 }}>{name} is set up. Already playing somewhere else? Bring your rosters across, or start fresh with a draft.</p>
          <Link href="/league/import?via=screens" className="st-opt"><b>Screenshots</b><span>Team pages from any fantasy app. We read them for you.</span></Link>
          <Link href="/league/import?via=sheet" className="st-opt"><b>Spreadsheet or CSV</b><span>One row per player, with their club or coach.</span></Link>
          <button type="button" className="st-opt" onClick={() => setStep(3)}><b>Start fresh</b><span>Everyone drafts from an empty pool.</span></button>
          <p className="st-hint">You can import later from League settings too.</p>
        </>}

        {step === 3 && made && <>
          <h1 className="st-h">Invite your coaches</h1>
          <div className="st-code"><span className="eyebrow">League code</span><b>{made.code}</b></div>
          <button className="lg-btn" onClick={share}>{copied ? 'Invite link copied' : 'Share invite link'}</button>
          <a className="lg-alt" href={`mailto:?subject=${encodeURIComponent(`Join ${name} on Keeper HQ`)}&body=${encodeURIComponent(`Pick your club here: ${link}`)}`}>Email invites</a>
          <p className="st-hint">Coaches pick their club when they join, and you approve them. You can change everything later in league settings.</p>
          <a className="lg-btn" style={{ background: 'var(--khq-sage-deep)' }} href={`/auth/enter?l=${made.leagueId}`}>Go to your clubhouse</a>
        </>}
      </div>
    </main>
  );
}
