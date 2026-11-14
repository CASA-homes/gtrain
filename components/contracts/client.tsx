'use client';
// Interactive bits of the contracts pages. Every action calls a server action, which calls a database function that
// enforces the rules; these components only show previews and the result message.
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  bid, buyClause, cancelAuction, chargeTax, closeFreeAgent, extendPlayer, faDeadline, grantTokens, listAuction,
  releasePlayer, rollover, saveSettings, seedContracts, setTier, setWindow, settleAuction, type Result,
} from '@/app/(app)/contracts/actions';
import type { KcSettings, Tier } from '@/lib/contracts';

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
function useRun() {
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

export function RunButton({ label, kind = 'dark', small, confirmText, run, disabled, id = 0 }: {
  label: string; kind?: 'dark' | 'sage' | 'plain' | 'ghost'; small?: boolean; confirmText?: string; disabled?: boolean;
  run: 'buy' | 'settle' | 'cancel' | 'close-fa' | 'seed' | 'tax' | 'rollover'; id?: number;
}) {
  const { pending, go, note } = useRun();
  const fn = () => {
    switch (run) {
      case 'buy': return buyClause(id);
      case 'settle': return settleAuction(id);
      case 'cancel': return cancelAuction(id);
      case 'close-fa': return closeFreeAgent(id);
      case 'seed': return seedContracts();
      case 'tax': return chargeTax();
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

/** Extend a final-year player: pick a length and a clause, see the price, confirm. */
export function ExtendControl({ contractId, name, rate, homeGrown, settings, longUsed }: {
  contractId: number; name: string; rate: number; homeGrown: boolean; settings: KcSettings; longUsed: number;
}) {
  const { pending, go, note, msg } = useRun();
  const [years, setYears] = useState(3);
  const [tier, setTierV] = useState<Exclude<Tier, 'protected'>>('standard');
  const lf: Record<number, number> = { 1: 1.06, 2: 1.03, 3: 1, 4: 0.967, 5: 0.933 };
  const base = Math.max(5, Math.round(rate * (lf[years] ?? 0.933) * (homeGrown ? (100 - settings.home_grown_pct) / 100 : 1)));
  const sal = Math.round(base * (1 + (tier === 'high' ? settings.high_pct : tier === 'none' ? settings.none_pct : 0) / 100));
  const longBlocked = years >= 4 && longUsed >= settings.long_deal_limit;
  if (msg?.ok) return note;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="kc-inline">
        <label className="kc-field" style={{ flex: 1 }}>Length
          <select value={years} onChange={(e) => setYears(Number(e.target.value))} aria-label={`Extension length for ${name}`}>
            {Array.from({ length: settings.max_years }, (_, i) => i + 1).map((y) => <option key={y} value={y}>{y} yr{y > 1 ? 's' : ''}</option>)}
          </select>
        </label>
        <label className="kc-field" style={{ flex: 1 }}>Clause
          <select value={tier} onChange={(e) => setTierV(e.target.value as 'standard')} aria-label={`Release clause for ${name}`}>
            <option value="standard">Standard</option><option value="high">High (+{settings.high_pct}%)</option><option value="none">None (+{settings.none_pct}%)</option>
          </select>
        </label>
      </div>
      <div className="kc-kv"><span>{homeGrown ? `Home-grown (${settings.home_grown_pct}% off)` : 'Per year'}</span><strong>{money(sal)}</strong></div>
      {longBlocked && <p className="kc-msg err">You already have {settings.long_deal_limit} deals of 4+ years.</p>}
      <button type="button" className="kc-btn dark" disabled={pending || longBlocked} onClick={() => go(() => extendPlayer(contractId, years, tier), `Extend ${name} for ${years} year${years > 1 ? 's' : ''} at ${money(sal)} a year from next season?`)}>
        {pending ? 'Working…' : `Extend ${years} yr${years > 1 ? 's' : ''}`}
      </button>
      {note}
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

export function ReleaseButton({ contractId, name, dead }: { contractId: number; name: string; dead: number }) {
  const { pending, go, note } = useRun();
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
      <button type="button" className="kc-btn small" disabled={pending}
        onClick={() => go(() => releasePlayer(contractId), `Release ${name}? ${money(dead)} of dead money stays on your cap and he becomes a free agent.`)}>Release</button>
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
        <label className="kc-field" style={{ flex: 1 }}>Reserve (KT)<input type="number" min={0} step={100} value={reserve} onChange={(e) => setReserve(Number(e.target.value))} /></label>
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
          <input type="number" min={minBid} step={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label={`Bid for ${name} in KT`} />
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
  const [kind, setKind] = useState<'preseason' | 'midseason'>(settings.window_kind ?? 'preseason');
  const [hours, setHours] = useState(72);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="kc-inline">
        <label className="kc-field">Window<select value={kind} onChange={(e) => setKind(e.target.value as 'preseason')}><option value="preseason">Pre-season</option><option value="midseason">Mid-season</option></select></label>
        <label className="kc-field" style={{ width: 110 }}>Hours<input type="number" min={1} value={hours} onChange={(e) => setHours(Number(e.target.value))} /></label>
        <button type="button" className="kc-btn sage" disabled={pending} onClick={() => go(() => setWindow(true, kind, hours))}>{settings.window_open ? 'Reopen' : 'Open window'}</button>
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
        <label className="kc-field" style={{ width: 120 }}>KT (− to take)<input type="number" step={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></label>
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
  ['keeper_cap_k', 'Keeper cap ($k)'], ['season_cap_k', 'Season cap ($k)'], ['tax_line_k', 'Luxury tax line ($k)'], ['tax_kt_per_k', 'Tax KT per $1k over'],
  ['start_kt', 'Starting bank (KT)'], ['max_years', 'Max contract years'], ['long_deal_limit', '4–5 year deals per club'],
  ['floor_def', 'Depth floor DEF'], ['floor_mid', 'Depth floor MID'], ['floor_ruc', 'Depth floor RUC'], ['floor_fwd', 'Depth floor FWD'],
  ['clause_std', 'Standard clause (× rate)'], ['clause_high', 'High clause (× rate)'], ['high_pct', 'High clause salary +%'], ['none_pct', 'No clause salary +%'],
  ['home_grown_pct', 'Home-grown discount %'], ['levy_pct', 'Transfer levy %'], ['max_buys', 'Clause buys per window'], ['pot_dollars', 'Wind-up pot ($)'],
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
