'use client';
// Interactive bits of the contracts pages. Every action calls a server action, which calls a database function that
// enforces the rules; these components only show previews and the result message.
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  acceptOffer, bid, signOwn, cancelAuction, chargeTax, closeFreeAgent, completeClaim, extendPlayer, faDeadline, grantTokens, listAuction,
  lockIn, matchClaim, releasePlayer, rollover, saveSettings, seedContracts, setTier, setWindow, settleAuction, signDraftees, startMidseason, draftReview, undoContract, lockContracts, type Result,
} from '@/app/(app)/contracts/actions';
import type { KcSettings, Tier } from '@/lib/contracts';
import { SignSheet } from '@/components/contracts/SignSheet';

const pad = (n: number) => String(n).padStart(2, '0');
const money = (k: number) => `$${(Math.round(k) * 1000).toLocaleString('en-AU')}`;
const kt = (n: number) => `${Math.round(n).toLocaleString('en-AU')} KT`;

export function KcClock({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = Math.max(0, new Date(endsAt).getTime() - (now ?? 0));
  const s = Math.floor(left / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return <strong suppressHydrationWarning style={{ fontVariantNumeric: 'tabular-nums' }}>{now == null ? '…' : left === 0 ? 'closed' : `${d ? `${d}d ` : ''}${pad(h)}h ${pad(m)}m`}</strong>;
}

/** Run an action, show its message, refresh the page's data. */
export function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Result | null>(null);
  const go = (fn: () => Promise<Result>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => { const r = await fn(); setMsg(r); if (r.ok) router.refresh(); });
  };
  const note = msg ? <p className={`kc-msg ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.message}</p> : null;
  return { pending, go, note, msg };
}

const lenNote = (y: number) => (y === 3 ? 'flat for 3 yrs' : y < 3 ? `+${y === 1 ? 6 : 3}% for a short deal` : `−${y === 4 ? '3.3' : '6.7'}% for a long deal`);

export function RunButton({ label, kind = 'dark', small, confirmText, run, disabled, id = 0 }: {
  label: string; kind?: 'dark' | 'sage' | 'plain' | 'ghost'; small?: boolean; confirmText?: string; disabled?: boolean;
  run: 'settle' | 'cancel' | 'close-fa' | 'seed' | 'tax' | 'rollover' | 'match' | 'complete' | 'accept' | 'midseason' | 'draftees' | 'lockin'; id?: number;
}) {
  const { pending, go, note } = useRun();
  const fn = () => {
    switch (run) {
      case 'settle': return settleAuction(id);
      case 'cancel': return cancelAuction(id);
      case 'close-fa': return closeFreeAgent(id);
      case 'seed': return seedContracts();
      case 'tax': return chargeTax();
      case 'match': return matchClaim(id);
      case 'complete': return completeClaim(id);
      case 'accept': return acceptOffer(id);
      case 'midseason': return startMidseason();
      case 'draftees': return signDraftees();
      case 'lockin': return lockIn(id);
      default: return rollover();
    }
  };
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
      <button type="button" className={`kc-btn ${kind === 'plain' ? '' : kind}${small ? ' small' : ''}`} disabled={pending || disabled} onClick={() => go(fn, confirmText)}>{pending ? 'Working…' : label}</button>
      {note}
    </span>
  );
}

/** A draftee's contract request: the club picks his clause before the mid-season window. */
export function DraftRequest({ contractId, name, rookie, base, rate, years, settings }: {
  contractId: number; name: string; rookie: boolean; base: number; rate: number; years: string; settings: KcSettings;
}) {
  const { pending, go, note } = useRun();
  const [tier, setTierV] = useState<'standard' | 'high' | 'none'>('standard');
  const salOf = (t: Tier) => Math.round(base * (1 + (t === 'high' ? settings.high_pct : t === 'none' ? settings.none_pct : 0) / 100));
  const clauseOf = (t: Tier) => (t === 'none' ? null : Math.round((rate * settings.kt_per_k * (t === 'high' ? settings.clause_high_pct : settings.clause_std_pct)) / 100));
  return (
    <div className="dr-item">
      <div className="row-between"><strong>{name}</strong><span className="kc-sub">{rookie ? 'Rookie' : 'Established'} · {years} · market {money(rate)}</span></div>
      <p className="kc-sub" style={{ margin: '2px 0 8px' }}>He’s asking for his contract to be finalised. Pick his clause; he’s protected until then.</p>
      <div className="sgn-tiers" role="radiogroup" aria-label={`Release clause for ${name}`}>
        {(['standard', 'high', 'none'] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tier === t} className={tier === t ? 'on' : undefined} onClick={() => setTierV(t)}>
            <b>{t === 'standard' ? 'Standard' : t === 'high' ? 'High' : 'No clause'} · {money(salOf(t))}</b>
            <span>{clauseOf(t) != null ? `Clause ${kt(clauseOf(t)!)}` : 'Can’t be poached'}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, gap: 8, alignItems: 'center' }}>
        {note}
        <button type="button" className="kc-btn sage small" disabled={pending} onClick={() => go(() => draftReview(contractId, tier), `Set ${name} on ${money(salOf(tier))} with ${tier === 'none' ? 'no clause' : `a ${clauseOf(tier)} KT clause`}? This is fixed for the deal.`)}>{pending ? 'Working…' : 'Confirm'}</button>
      </div>
    </div>
  );
}

/** Extend a final-year player: pick a length and a clause, see the price, confirm. */
export function ExtendControl({ contractId, name, rate, homeGrown, settings, signPlayerId, startYear, maxYears }: {
  contractId: number; name: string; rate: number; homeGrown: boolean; settings: KcSettings; signPlayerId?: number;
  /** Extensions: first added season (current end + 1) and how many years can be added. */
  startYear?: number; maxYears?: number;
}) {
  const sign = signPlayerId != null;
  const most = Math.max(1, maxYears ?? settings.max_years);
  const [years, setYears] = useState(Math.min(3, most));
  const [tier, setTierV] = useState<Exclude<Tier, 'protected'>>('standard');
  const [open, setOpen] = useState(false);
  const lf: Record<number, number> = { 1: 1.06, 2: 1.03, 3: 1, 4: 0.967, 5: 0.933 };
  // Both price by length (1 yr dearest, 5 yrs cheapest); extensions add the premium and fee.
  const extPct = sign ? 0 : settings.ext_premium_pct ?? 10;
  const setup = !!settings.setup_until && new Date(settings.setup_until) > new Date();
  const fee = sign || setup ? 0 : settings.ext_fee_kt ?? 10;
  const base = Math.max(5, Math.round(rate * (lf[years] ?? 0.933) * (homeGrown ? (100 - settings.home_grown_pct) / 100 : 1) * (1 + extPct / 100)));
  const salOf = (t: Tier) => Math.round(base * (1 + (t === 'high' ? settings.high_pct : t === 'none' ? settings.none_pct : 0) / 100));
  const clauseOf = (t: Tier) => (t === 'none' ? null : Math.round((rate * settings.kt_per_k * (t === 'high' ? settings.clause_high_pct : settings.clause_std_pct)) / 100));
  const sal = salOf(tier);
  const from = sign ? settings.season : startYear ?? settings.season + 1;
  const to = from + years - 1;
  const clause = clauseOf(tier);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label className="kc-field">Length
        <select value={years} onChange={(e) => setYears(Number(e.target.value))} aria-label={`Contract length for ${name}`}>
          {Array.from({ length: most }, (_, i) => i + 1).map((y) => <option key={y} value={y}>{y} yr{y > 1 ? 's' : ''} · {from}–{from + y - 1}</option>)}
        </select>
      </label>
      <div className="sgn-tiers" role="radiogroup" aria-label={`Release clause for ${name}`}>
        {(['standard', 'high', 'none'] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tier === t} className={tier === t ? 'on' : undefined} onClick={() => setTierV(t)}>
            <b>{t === 'standard' ? 'Standard' : t === 'high' ? 'High' : 'No clause'}</b>
            <span>{clauseOf(t) != null ? `Clause ${kt(clauseOf(t)!)}` : 'Can’t be poached'}</span>
            <em>{money(salOf(t))}/yr{t !== 'standard' ? ` (+${t === 'high' ? settings.high_pct : settings.none_pct}%)` : ''}</em>
          </button>
        ))}
      </div>
      <p className="kc-sub" style={{ margin: 0 }}>{sign ? `Priced at his market value, ${lenNote(years)}.` : `Priced at his ${money(rate)} market value${homeGrown ? `, less ${settings.home_grown_pct}% home-grown` : ''}, ${lenNote(years)}, plus a ${extPct}% extension premium${fee ? ` and a ${kt(fee)} fee. He’s then locked for 12 months.` : '. No fee until deadline day.'}`} The clause is fixed for the deal.</p>
      <button type="button" className="kc-btn dark" onClick={() => setOpen(true)}>
        {sign ? 'Offer contract' : 'Extend'} · +{years} yr{years > 1 ? 's' : ''} · {money(sal)}/yr
      </button>
      {open && (
        <SignSheet
          title={sign ? `Sign ${name}` : `Extend ${name}`} name={name} verb={sign ? 'sign' : 'extend'}
          headline={`${years} yr${years > 1 ? 's' : ''} · ${money(sal)} a year · ${from}–${to}`}
          terms={[
            ['Player', name],
            ['Length', `${years} season${years > 1 ? 's' : ''} (${from}–${to})`],
            ['Salary', `${money(sal)} a year`],
            ['Total', money(sal * years)],
            ['Release clause', clause != null ? `${tier === 'high' ? 'High' : 'Standard'} · ${kt(clause)}` : 'None'],
            ['Market value', money(rate)],
            ...(sign ? [] : [['Extension fee', `${kt(fee)} + ${extPct}% premium`], ['Locked', '12 months, no further extension']] as [string, string][]),
          ]}
          confirm={() => (sign ? signOwn(signPlayerId!, years, tier) : extendPlayer(contractId, years, tier))}
          onClose={() => { setOpen(false); }}
        />
      )}
    </div>
  );
}

export function TierSelect({ contractId, tier, base, settings, locked }: { contractId: number; tier: Tier; base: number; settings: KcSettings; locked: boolean }) {
  const { pending, go, note } = useRun();
  if (tier === 'protected') return <span className="kc-tag rook">Protected yr 1</span>;
  const sal = (t: Tier) => money(Math.round(base * (1 + (t === 'high' ? settings.high_pct : t === 'none' ? settings.none_pct : 0) / 100)));
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <select className="input" style={{ minHeight: 34, fontSize: 13 }} value={tier} disabled={pending || locked} aria-label="Release clause level"
        title={locked ? 'Clauses are locked while a window is open' : undefined}
        onChange={(e) => { const t = e.target.value as Tier; go(() => setTier(contractId, t), `Change his clause to ${t}? His salary becomes ${sal(t)}.`); }}>
        <option value="standard">Standard · {sal('standard')}</option>
        <option value="high">High · {sal('high')}</option>
        <option value="none">No clause · {sal('none')}</option>
      </select>
      {note}
    </span>
  );
}

/** Provisional contract (first off-season): undo it for free, or lock it in. */
export function ProvisionalControls({ contractId, name }: { contractId: number; name: string }) {
  const { pending, go, note } = useRun();
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" className="kc-btn small" disabled={pending} onClick={() => go(() => undoContract(contractId), `Undo ${name}’s contract? He goes back to unsigned, no cost.`)}>Undo</button>
      <button type="button" className="kc-btn small sage" disabled={pending} onClick={() => go(() => lockContracts(contractId, null), `Lock ${name}’s contract now? You won’t be able to undo or change it yourself. Only the commish can unlock it. Contracts become formal on deadline day anyway.`)}>Lock</button>
      {note}
    </span>
  );
}

export function LockAllButton({ teamId, count }: { teamId: number; count: number }) {
  const { pending, go, note } = useRun();
  return <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}><button type="button" className="kc-btn small sage" disabled={pending || count === 0} onClick={() => go(() => lockContracts(null, teamId), `Lock all ${count} contracts now? Once locked you can’t undo or re-sign them yourself before deadline day. Only the commish can unlock them. They all become formal on deadline day anyway, so you don’t need to lock them.`)}>Lock all ({count})</button>{note}</span>;
}

export function ReleaseButton({ contractId, name, dead, later = 0, laterYears = 0, fee = 0 }: { contractId: number; name: string; dead: number; later?: number; laterYears?: number; fee?: number }) {
  const { pending, go, note } = useRun();
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
      <button type="button" className="kc-btn small" disabled={pending}
        onClick={() => go(() => releasePlayer(contractId), `Release ${name}? It costs ${kt(fee)} now, ${money(dead)} of dead money on this season's cap${laterYears ? ` and ${money(later)} a season for the next ${laterYears}` : ''}. He becomes a free agent.`)}>Release</button>
      {note}
    </span>
  );
}

export function AuctionControl({ contractId, name, suggested }: { contractId: number; name: string; suggested: number }) {
  const { pending, go, note, msg } = useRun();
  const [open, setOpen] = useState(false);
  const [reserve, setReserve] = useState(suggested);
  const [hours, setHours] = useState(24);
  if (msg?.ok) return note;
  if (!open) return <button type="button" className="kc-btn small" onClick={() => setOpen(true)}>Auction</button>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
      <div className="kc-inline">
        <label className="kc-field" style={{ flex: 1 }}>Reserve (KT)<input type="number" min={0} step={1} value={reserve} onChange={(e) => setReserve(Number(e.target.value))} /></label>
        <label className="kc-field" style={{ width: 90 }}>Hours<input type="number" min={1} max={168} value={hours} onChange={(e) => setHours(Number(e.target.value))} /></label>
      </div>
      <div className="kc-inline">
        <button type="button" className="kc-btn small" onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className="kc-btn small dark" disabled={pending} onClick={() => go(() => listAuction(contractId, reserve, hours), `List ${name} for ${hours}h with a ${kt(reserve)} reserve?`)}>List him</button>
      </div>
      {note}
    </div>
  );
}

export function BidControl({ auctionId, minBid, name }: { auctionId: number; minBid: number; name: string }) {
  const { pending, go, note } = useRun();
  const [amount, setAmount] = useState(minBid);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="kc-inline">
        <label className="kc-field" style={{ flex: 1 }}><span className="sr-only">Bid for {name}</span>
          <input type="number" min={minBid} step={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label={`Bid for ${name} in KT`} />
        </label>
        <button type="button" className="kc-btn dark" disabled={pending} onClick={() => go(() => bid(auctionId, amount), `Bid ${kt(amount)} for ${name}?`)}>Bid</button>
      </div>
      {note}
    </div>
  );
}

// ---------- Commish ----------
export function WindowControl({ settings }: { settings: KcSettings }) {
  const { pending, go, note } = useRun();
  const kind = 'midseason';
  const [hours, setHours] = useState(72);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="kc-inline">
        <label className="kc-field" style={{ width: 110 }}>Hours<input type="number" min={1} value={hours} onChange={(e) => setHours(Number(e.target.value))} /></label>
        <button type="button" className="kc-btn sage" disabled={pending} onClick={() => go(() => setWindow(true, kind, hours))}>{settings.window_open ? 'Extend window' : 'Open mid-season window'}</button>
        {settings.window_open && <button type="button" className="kc-btn" disabled={pending} onClick={() => go(() => setWindow(false, kind, 0), 'Close the window now?')}>Close window</button>}
      </div>
      {note}
    </div>
  );
}

export function GrantControl({ teams }: { teams: { id: number; name: string }[] }) {
  const { pending, go, note } = useRun();
  const [team, setTeam] = useState(teams[0]?.id ?? 0);
  const [amount, setAmount] = useState(500);
  const [why, setWhy] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="kc-inline">
        <label className="kc-field">Club<select value={team} onChange={(e) => setTeam(Number(e.target.value))}>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="kc-field" style={{ width: 120 }}>KT (− to take)<input type="number" step={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></label>
        <label className="kc-field" style={{ flex: 1, minWidth: 180 }}>Reason<input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Cup prize, correction…" /></label>
        <button type="button" className="kc-btn dark" disabled={pending || !why.trim()} onClick={() => go(() => grantTokens(team, amount, why))}>Apply</button>
      </div>
      {note}
    </div>
  );
}

export function FaDeadlineControl() {
  const { pending, go, note } = useRun();
  const [hours, setHours] = useState(48);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="kc-inline">
        <label className="kc-field" style={{ width: 120 }}>Hours<input type="number" min={1} value={hours} onChange={(e) => setHours(Number(e.target.value))} /></label>
        <button type="button" className="kc-btn dark" disabled={pending} onClick={() => go(() => faDeadline(hours))}>Set free-agent deadline</button>
      </div>
      {note}
    </div>
  );
}

const FIELDS: [keyof KcSettings, string][] = [
  ['keeper_cap_k', 'Keeper cap ($k)'], ['season_cap_k', 'Season cap ($k)'], 
  ['start_kt', 'Starting bank (KT)'], ['max_years', 'Max contract years'], ['deficit_max_k', 'Lock-in deficit allowed ($k)'], ['hold_back_k', 'Draft hold-back per spot ($k)'],
  ['floor_def', 'Depth floor DEF'], ['floor_mid', 'Depth floor MID'], ['floor_ruc', 'Depth floor RUC'], ['floor_fwd', 'Depth floor FWD'],
  ['clause_std_pct', 'Standard clause (% of value)'], ['clause_high_pct', 'High clause (% of value)'], ['deficit_fee_kt', 'Deficit fee (KT)'], ['high_pct', 'High clause salary +%'], ['none_pct', 'No clause salary +%'],
  ['home_grown_pct', 'Home-grown discount %'], ['levy_pct', 'Transfer levy %'], ['max_buys', 'Clause buys per window'],
];
export function SettingsForm({ settings }: { settings: KcSettings }) {
  const { pending, go, note } = useRun();
  const [vals, setVals] = useState<Record<string, number>>(Object.fromEntries(FIELDS.map(([k]) => [k, Number(settings[k])])));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="kc-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        {FIELDS.map(([k, label]) => (
          <label key={k} className="kc-field">{label}<input type="number" value={vals[k]} onChange={(e) => setVals((v) => ({ ...v, [k]: Number(e.target.value) }))} /></label>
        ))}
      </div>
      <div className="kc-inline"><button type="button" className="kc-btn dark" disabled={pending} onClick={() => go(() => saveSettings(vals))}>Save settings</button></div>
      {note}
    </div>
  );
}
