'use client';
// League settings: panels the commish can edit in place (Edit → change → Save). Everyone else sees the rules.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { saveFines, saveKeepersDraft, saveMilestones, saveScoring, saveTeamStructure, type Res } from '@/app/(app)/league/settings/actions';
import { DRAFT_ORDERS, FORMULA_KEYS, draftRounds, type LeagueRules, type Pos4 } from '@/lib/league-rules';
import './rules.css';

const POS: Pos4[] = ['DEF', 'MID', 'RUC', 'FWD'];
const fmtDay = (d: string) => new Date(`${d}T12:00:00+08:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** ⓘ that opens a short explanation. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span className="rp-tip" ref={ref}>
      <button type="button" aria-label={`What is ${label}?`} aria-expanded={open} onClick={() => setOpen(!open)}>i</button>
      {open && <span role="tooltip" className="rp-pop">{children}</span>}
    </span>
  );
}

/** A rules card: rows to read, and for the commish an Edit button that swaps in a form. */
function Card({ title, note, rows, commish, form, onSave, className }: {
  title: ReactNode; note?: ReactNode; rows: [ReactNode, ReactNode][]; commish: boolean; form: ReactNode; onSave: () => Promise<Res>; className?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Res | null>(null);
  const save = () => start(async () => { const r = await onSave(); setMsg(r); if (r.ok) { setEditing(false); router.refresh(); } });
  return (
    <section className={`card rp-card${className ? ` ${className}` : ''}`}>
      <div className="rp-head">
        <h2 className="h2">{title}</h2>
        {commish && !editing && <button type="button" className="rp-edit" onClick={() => { setEditing(true); setMsg(null); }}>Edit</button>}
      </div>
      {note && <p className="muted rp-note">{note}</p>}
      {editing ? (
        <form className="rp-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
          {form}
          <div className="rp-acts">
            <button type="button" className="kc-btn" disabled={pending} onClick={() => { setEditing(false); setMsg(null); }}>Cancel</button>
            <button type="submit" className="kc-btn dark" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      ) : (
        <dl className="rp-dl">{rows.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      )}
      {msg && <p className={`rp-msg ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.message}</p>}
    </section>
  );
}

const Num = ({ label, value, set, min, max, suffix, help }: { label: string; value: number; set: (n: number) => void; min: number; max: number; suffix?: string; help?: string }) => (
  <label className="rp-f"><span>{label}</span><span className="rp-in"><input type="number" min={min} max={max} value={Number.isFinite(value) ? value : ''} onChange={(e) => set(Number(e.target.value))} />{suffix && <em>{suffix}</em>}</span>{help && <small>{help}</small>}</label>
);
const Tog = ({ label, value, set, help }: { label: string; value: boolean; set: (b: boolean) => void; help?: string }) => (
  <label className="rp-f rp-tog"><span>{label}</span><input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} /><i aria-hidden="true" />{help && <small>{help}</small>}</label>
);
const Sel = <T extends string>({ label, value, set, options }: { label: string; value: T; set: (v: T) => void; options: [T, string][] }) => (
  <label className="rp-f"><span>{label}</span><select value={value} onChange={(e) => set(e.target.value as T)}>{options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
);

// ---- Milestone dates ---------------------------------------------------------------------------------------------
const MS = [
  ['release', 'Player Release Day'], ['pre', 'Preseason window'], ['draft', 'Draft day'], ['mid', 'Mid-season window'], ['fa', 'Free Agent Day'],
] as const;
type MsKey = (typeof MS)[number][0];

export function MilestonesPanel({ commish, release, dates }: { commish: boolean; release: string | null; dates: LeagueRules['dates'] }) {
  const router = useRouter();
  const [tab, setTab] = useState<MsKey>('release');
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Res | null>(null);
  const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 8 * 3600e3).toISOString().slice(0, 16) : '');
  const [rel, setRel] = useState(toLocal(release));
  const [d, setD] = useState(dates);
  const set = (k: keyof LeagueRules['dates']) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });
  const save = () => start(async () => {
    const r = await saveMilestones({ release: rel ? new Date(`${rel}:00+08:00`).toISOString() : null, ...d });
    setMsg(r); if (r.ok) { setEditing(false); router.refresh(); }
  });
  const relText = release ? new Date(release).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Perth' }) + ' (Perth)' : 'Not set';
  const body: Record<MsKey, { what: ReactNode; when: ReactNode; edit: ReactNode }> = {
    release: {
      what: <>The last day clubs can release (delist) players before the new season. Rookie contracts and the cap-free rookie slot lock too, so each club picks its rookie (10 or fewer games) before then.</>,
      when: relText,
      edit: <label className="rp-f"><span>Release Day (Perth time)</span><input type="datetime-local" value={rel} onChange={(e) => setRel(e.target.value)} /></label>,
    },
    pre: {
      what: <>The off-season window for moving players: release clauses, free-agent signings and trades. It runs up to draft day.</>,
      when: <>{fmtDay(dates.preseason_open)} → {fmtDay(dates.preseason_close)}</>,
      edit: <div className="rp-row2"><label className="rp-f"><span>Opens</span><input type="date" value={d.preseason_open} onChange={set('preseason_open')} /></label><label className="rp-f"><span>Closes</span><input type="date" value={d.preseason_close} onChange={set('preseason_close')} /></label></div>,
    },
    draft: {
      what: <>The national draft in the Draft Centre. Clubs draft within their remaining season-cap room.</>,
      when: fmtDay(dates.draft_day),
      edit: <label className="rp-f"><span>Draft day</span><input type="date" value={d.draft_day} onChange={set('draft_day')} /></label>,
    },
    mid: {
      what: <>The mid-season transfer window around the byes: trades and the mid-season draft. Final-year players who haven’t been re-signed become pending free agents when it closes.</>,
      when: <>{fmtDay(dates.mid_open)} → {fmtDay(dates.mid_close)}</>,
      edit: <div className="rp-row2"><label className="rp-f"><span>Opens</span><input type="date" value={d.mid_open} onChange={set('mid_open')} /></label><label className="rp-f"><span>Closes</span><input type="date" value={d.mid_close} onChange={set('mid_close')} /></label></div>,
    },
    fa: {
      what: <>After the mid-season window ends, every unsigned player goes into free agency. Any club can then make offers on the Trademarket.</>,
      when: fmtDay(dates.fa_day),
      edit: <label className="rp-f"><span>Free Agent Day</span><input type="date" value={d.fa_day} onChange={set('fa_day')} /></label>,
    },
  };
  const b = body[tab];
  return (
    <section className="card rp-card rp-ms">
      <div className="rp-head">
        <h2 className="h2">Milestone dates</h2>
        {commish && !editing && <button type="button" className="rp-edit" onClick={() => { setEditing(true); setMsg(null); }}>Edit</button>}
      </div>
      <div className="rp-tabs" role="tablist" aria-label="Milestones">
        {MS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <div className="rp-ms-body" role="tabpanel">
        <div className="rp-ms-when">
          <b>{b.when}</b>
          {tab === 'release' && <InfoTip label="Player Release Day">Player Release Day is the cut-off for delisting players before the season. After it, releasing a contracted player isn’t allowed until the window opens again, and each club’s rookie slot is locked in.</InfoTip>}
        </div>
        <p className="muted rp-note">{b.what}</p>
        {editing && (
          <form className="rp-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
            {b.edit}
            <p className="muted rp-note" style={{ fontSize: 12 }}>Change any tab, then save once.</p>
            <div className="rp-acts">
              <button type="button" className="kc-btn" disabled={pending} onClick={() => { setEditing(false); setMsg(null); setD(dates); setRel(toLocal(release)); }}>Cancel</button>
              <button type="submit" className="kc-btn dark" disabled={pending}>{pending ? 'Saving…' : 'Save dates'}</button>
            </div>
          </form>
        )}
      </div>
      {msg && <p className={`rp-msg ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.message}</p>}
    </section>
  );
}

// ---- Team structure ----------------------------------------------------------------------------------------------
export function TeamStructurePanel({ commish, listSize, lineup, keepers, rules }: { commish: boolean; listSize: number; lineup: Record<Pos4, number>; keepers: number; rules: LeagueRules['team'] }) {
  const [list, setList] = useState(listSize);
  const [lu, setLu] = useState(lineup);
  const [emg, setEmg] = useState(rules.emergencies);
  const [mode, setMode] = useState(rules.emergency_mode);
  const [util, setUtil] = useState(rules.utility);
  const [rookie, setRookie] = useState(rules.rookie);
  const starters = POS.reduce((a, p) => a + lineup[p], 0);
  const bench = Math.max(0, listSize - starters - rules.emergencies);
  return (
    <Card title="Team structure" commish={commish}
      rows={[
        ['Squad size', `${listSize} players: ${starters} starters, ${rules.emergencies} emergencies, ${bench} bench`],
        ['On field', POS.map((p) => `${lineup[p]} ${p}`).join(' · ')],
        ['Emergencies', rules.emergency_mode === 'line' ? `${rules.emergencies}: one per line (DEF, MID, RUC, FWD)${rules.utility ? ' plus a utility' : ''}` : `${rules.emergencies}: any position`],
        ['Utility', rules.utility ? 'On: covers only the positions he holds, as the last-chance cover' : 'Off'],
        ['Rookie spot', rules.rookie ? `On: keep ${keepers - 1} plus a rookie (10 career games or fewer)` : 'Off'],
        ['Injury / rookie / veteran lists', 'None'],
      ]}
      form={<>
        <Num label="Squad size" value={list} set={setList} min={18} max={60} />
        <div className="rp-f"><span>On field</span><span className="rp-lu">{POS.map((p) => <label key={p}><em>{p}</em><input type="number" min={p === 'RUC' ? 0 : 1} max={12} value={lu[p]} onChange={(e) => setLu({ ...lu, [p]: Number(e.target.value) })} /></label>)}</span></div>
        <Num label="Emergencies" value={emg} set={setEmg} min={0} max={10} />
        <Sel label="Emergency cover" value={mode} set={setMode} options={[['line', 'One per line'], ['any', 'Any position']]} />
        <Tog label="Utility" value={util} set={setUtil} help="Last-chance cover for any position he holds" />
        <Tog label="Rookie spot" value={rookie} set={setRookie} help="An extra keeper slot for a player with 10 or fewer games" />
      </>}
      onSave={() => saveTeamStructure({ list_size: list, lineup: lu, emergencies: emg, emergency_mode: mode, utility: util, rookie, keepers: keepers - (rules.rookie ? 1 : 0) })}
    />
  );
}

// ---- Scoring -----------------------------------------------------------------------------------------------------
export function ScoringPanel({ commish, rules }: { commish: boolean; rules: LeagueRules['scoring'] }) {
  const [s, setS] = useState(rules);
  const up = <K extends keyof LeagueRules['scoring']>(k: K) => (v: LeagueRules['scoring'][K]) => setS({ ...s, [k]: v });
  return (
    <Card title="Scoring" commish={commish}
      rows={[
        ['System', 'Points, AFL Fantasy style'],
        ['Formula', <span key="f" className="rp-formula">{FORMULA_KEYS.map((k) => <span key={k}>{k} <b>{rules.formula[k] > 0 ? `+${rules.formula[k]}` : rules.formula[k]}</b></span>)}</span>],
        ['Captains', rules.captain ? (rules.vc ? 'Captain scores 2×. The vice-captain only scores 2× if the captain doesn’t count' : 'Captain scores 2×, no vice-captain') : 'No captains'],
        ...(rules.captain && rules.vc ? [['Captain rule', `If the captain plays under ${rules.captain_tog}% time on ground, the vice-captain scores double instead and the captain counts as normal`] as [string, string]] : []),
        ['TOG threshold', `${rules.tog}%: a starter under this is replaced by his emergency, only if the emergency scored more`],
        ['Dual positions', rules.dual_cover ? 'An emergency with two or three positions can cover any of them' : 'Emergencies cover their first position only'],
        ['Emergency loophole', rules.loophole ? 'Yes: emergencies can cover an empty lineup slot' : 'No: emergencies can’t cover an empty lineup slot'],
        ['Lockout', rules.lockout === 'rolling' ? 'Rolling: each player locks when his game starts' : 'Fixed: every player locks at the round’s first game'],
      ]}
      form={<>
        <div className="rp-f"><span>Formula (points per stat)</span><span className="rp-fgrid">{FORMULA_KEYS.map((k) => <label key={k}><em>{k}</em><input type="number" min={-20} max={20} value={s.formula[k]} onChange={(e) => setS({ ...s, formula: { ...s.formula, [k]: Number(e.target.value) } })} /></label>)}</span></div>
        <Tog label="Captain (2×)" value={s.captain} set={up('captain')} />
        <Tog label="Vice-captain cover" value={s.vc} set={up('vc')} help="VC scores 2× when the captain doesn’t count" />
        <Num label="Captain TOG rule" value={s.captain_tog} set={up('captain_tog')} min={0} max={100} suffix="%" help="Under this, the VC takes the double" />
        <Num label="Emergency TOG threshold" value={s.tog} set={up('tog')} min={0} max={100} suffix="%" help="A starter under this can be replaced by his emergency" />
        <Tog label="Dual-position cover" value={s.dual_cover} set={up('dual_cover')} />
        <Tog label="Emergency loophole" value={s.loophole} set={up('loophole')} help="Let emergencies fill an empty slot" />
        <Sel label="Lockout" value={s.lockout} set={up('lockout')} options={[['rolling', 'Rolling'], ['fixed', 'Fixed']]} />
      </>}
      onSave={() => saveScoring(s)}
    />
  );
}

// ---- Keepers & draft ---------------------------------------------------------------------------------------------
export function KeepersDraftPanel({ commish, listSize, keepers, rookie, rules, nextDraft }: { commish: boolean; listSize: number; keepers: number; rookie: boolean; rules: LeagueRules['draft']; nextDraft: string }) {
  const [k, setK] = useState(keepers - (rookie ? 1 : 0));
  const [rk, setRk] = useState(rookie);
  const [r, setR] = useState(rules);
  const rounds = draftRounds(listSize, keepers, rookie);
  const orders = Object.entries(DRAFT_ORDERS) as [keyof typeof DRAFT_ORDERS, string][];
  return (
    <Card title="Keepers & draft" commish={commish}
      rows={[
        ['Keepers', rookie ? `${keepers - 1}, plus a keeper slot for a rookie` : `${keepers}`],
        ['Rookie keeper', rookie ? 'The extra keeper must be a rookie: 10 career games or fewer, no age limit' : 'Off'],
        ['Draft', `${rounds} rounds (${listSize}-player squad less ${keepers - (rookie ? 1 : 0)} keepers)${rookie ? ` · round ${rounds} is the rookie round` : ''}`],
        ['Pick trading', `Picks tradeable ${rules.pick_years === 1 ? 'for next year' : `up to ${rules.pick_years} years ahead`}`],
        ['Mid-season draft order', `${DRAFT_ORDERS[rules.mid_order]}, ladder after round ${rules.mid_after_round}`],
        ['End-of-season draft order', `${DRAFT_ORDERS[rules.end_order]}, ladder after the grand final`],
        ['Next draft', nextDraft],
      ]}
      form={<>
        <Num label="Keepers" value={k} set={setK} min={0} max={40} help="Not counting the rookie spot" />
        <Tog label="Rookie spot" value={rk} set={setRk} help="One more keeper, for a player with 10 or fewer games" />
        <p className="muted rp-note" style={{ fontSize: 12 }}>Draft rounds follow from squad size: {draftRounds(listSize, k + (rk ? 1 : 0), rk)} rounds with these keepers.</p>
        <Sel label="Mid-season draft order" value={r.mid_order} set={(v) => setR({ ...r, mid_order: v })} options={orders} />
        <Num label="Mid-season ladder after round" value={r.mid_after_round} set={(v) => setR({ ...r, mid_after_round: v })} min={1} max={24} />
        <Sel label="End-of-season draft order" value={r.end_order} set={(v) => setR({ ...r, end_order: v })} options={orders} />
        <Num label="Picks tradeable (years ahead)" value={r.pick_years} set={(v) => setR({ ...r, pick_years: v })} min={1} max={3} />
      </>}
      onSave={() => saveKeepersDraft({ keepers: k, rookie: rk, ...r })}
    />
  );
}

// ---- Fines -------------------------------------------------------------------------------------------------------
export function FinesPanel({ commish, rules }: { commish: boolean; rules: LeagueRules['fines'] }) {
  const [f, setF] = useState(rules);
  return (
    <Card title="Fines" commish={commish}
      note={<>Automatic round fines (low scores, captain under 25% TOG) are set on <Link href="/league/bets?tab=fines">Bets &amp; fines</Link>.</>}
      rows={[
        ['Captain loophole', `$${rules.captain_loop}`],
        ['Zero on field loophole', `$${rules.zero_on_field_loop}`],
        ['Lopsided trade', `$${rules.lopsided_trade} per offence`],
      ]}
      form={<>
        <Num label="Captain loophole" value={f.captain_loop} set={(v) => setF({ ...f, captain_loop: v })} min={0} max={1000} suffix="$" />
        <Num label="Zero on field loophole" value={f.zero_on_field_loop} set={(v) => setF({ ...f, zero_on_field_loop: v })} min={0} max={1000} suffix="$" />
        <Num label="Lopsided trade (per offence)" value={f.lopsided_trade} set={(v) => setF({ ...f, lopsided_trade: v })} min={0} max={1000} suffix="$" />
      </>}
      onSave={() => saveFines(f)}
    />
  );
}
