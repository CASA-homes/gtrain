'use client';
// Side comps: the menu, opt-in entries (capped by the commish), and each comp's prize pool (minted or staked).
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { COMPS, MINT_PRESETS, OPT_IN, PRIZE_KIND_NAME, placeName, type CompDef, type CompKey, type Prize, type PrizeKind } from '@/lib/comps';
import { addPrize, joinComp, removePrize, saveCompSettings, settlePrize, type CompsState } from '@/app/(app)/live/comps-actions';
import { Shell } from './kit';

export interface CompsProps {
  state: CompsState; myTeamId: number; isCommish: boolean;
  teams: { id: number; name: string; short: string }[];
  myPicks: { id: number; label: string }[]; myPlayers: { id: number; name: string }[];
  labels: { picks: Record<number, string>; players: Record<number, string> };
}

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (f: () => Promise<{ ok: boolean; error?: string }>, okText?: string) => start(async () => {
    const r = await f(); setMsg(r.ok ? (okText ? { ok: true, text: okText } : null) : { ok: false, text: r.error ?? 'Something went wrong.' }); if (r.ok) router.refresh();
  });
  return { pending, msg, run };
}

const statusName: Record<Prize['status'], string> = { pool: 'In the pool', awarded: 'Awarded', transferred: 'Handed over', returned: 'Returned', void: 'Void' };

function PrizeRow({ p, props, comp }: { p: Prize; props: CompsProps; comp: CompDef }) {
  const { pending, msg, run } = useAct();
  const entrants = props.state.entries.filter((e) => e.comp === comp.key).map((e) => e.team_id);
  const pool = comp.everyone ? props.teams.map((t) => t.id) : entrants;
  const [win, setWin] = useState<number>(p.winner_id ?? pool[0] ?? 0);
  const name = (id: number | null) => props.teams.find((t) => t.id === id)?.name ?? '–';
  const what = p.kind === 'pick' && p.pick_id ? props.labels.picks[p.pick_id] ?? p.label : p.kind === 'player' && p.player_id ? props.labels.players[p.player_id] ?? p.label : p.label;
  const mine = p.staked_by === props.myTeamId;
  return (
    <div className={`cp-prize ${p.status}`}>
      <span className="cp-place">{placeName(p.place)}</span>
      <div className="cp-pz-main">
        <b className="md-ellip">{what}</b>
        <span className="rh-dim">{p.source === 'minted' ? 'Minted by the commish' : `Staked by ${name(p.staked_by)}`} · {PRIZE_KIND_NAME[p.kind]}{p.winner_id ? ` · ${p.status === 'transferred' ? 'Won by' : 'Going to'} ${name(p.winner_id)}` : ''}</span>
        {msg && <span className={msg.ok ? 'rh-up' : 'rh-down'} style={{ fontSize: 12 }}>{msg.text}</span>}
      </div>
      <span className={`cp-status ${p.status}`}>{statusName[p.status]}</span>
      {(props.isCommish || (mine && p.status === 'pool')) && (
        <div className="cp-settle">
          {props.isCommish && p.status === 'pool' && (
            <>
              <select className="rh-select sm" value={win} onChange={(e) => setWin(Number(e.target.value))} aria-label="Winner">
                {pool.map((t) => <option key={t} value={t}>{name(t)}</option>)}
              </select>
              <button className="rh-btn soft" disabled={pending || !win} onClick={() => run(() => settlePrize(p.id, 'award', win))}>Award</button>
            </>
          )}
          {props.isCommish && p.status === 'awarded' && (
            <>
              <button className="rh-btn go" disabled={pending} onClick={() => run(() => settlePrize(p.id, 'transfer'), 'Handed over.')}>Hand it over</button>
              <button className="rh-btn alt" disabled={pending} onClick={() => run(() => settlePrize(p.id, 'reopen'))}>Undo</button>
            </>
          )}
          {props.isCommish && p.status === 'pool' && p.source === 'staked' && <button className="rh-btn alt" disabled={pending} onClick={() => run(() => settlePrize(p.id, 'return'))}>Return</button>}
          {p.status === 'pool' && (mine || props.isCommish) && <button className="rh-btn danger" disabled={pending} onClick={() => run(() => removePrize(p.id))}>Remove</button>}
        </div>
      )}
    </div>
  );
}

function AddPrize({ comp, props }: { comp: CompDef; props: CompsProps }) {
  const { pending, msg, run } = useAct();
  const [open, setOpen] = useState<null | 'stake' | 'mint'>(null);
  const [kind, setKind] = useState<PrizeKind>('pick');
  const [item, setItem] = useState<number>(0);
  const [amount, setAmount] = useState(100);
  const [label, setLabel] = useState('');
  const [place, setPlace] = useState(1);
  const entered = props.state.entries.some((e) => e.comp === comp.key && e.team_id === props.myTeamId) || !!comp.everyone;
  const stake = () => {
    const lbl = kind === 'pick' ? props.myPicks.find((x) => x.id === item)?.label : kind === 'player' ? props.myPlayers.find((x) => x.id === item)?.name : `${amount} tokens`;
    if (!lbl || (kind !== 'tokens' && !item)) return;
    run(() => addPrize({ comp: comp.key, source: 'staked', kind, pick_id: kind === 'pick' ? item : null, player_id: kind === 'player' ? item : null, amount: kind === 'tokens' ? amount : null, label: lbl, place }), 'Staked.');
  };
  return (
    <div className="cp-add">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {entered && <button className={`rh-btn ${open === 'stake' ? 'go' : 'alt'}`} onClick={() => setOpen(open === 'stake' ? null : 'stake')}>Stake something</button>}
        {props.isCommish && <button className={`rh-btn ${open === 'mint' ? 'go' : 'alt'}`} onClick={() => setOpen(open === 'mint' ? null : 'mint')}>Mint a prize</button>}
      </div>
      {open === 'stake' && (
        <div className="cp-form">
          <div className="rh-seg">{(['pick', 'player', 'tokens'] as PrizeKind[]).map((k) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setItem(0); }}>{PRIZE_KIND_NAME[k]}</button>)}</div>
          {kind === 'pick' && <select className="rh-select sm" value={item} onChange={(e) => setItem(Number(e.target.value))}><option value={0}>Choose a pick</option>{props.myPicks.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>}
          {kind === 'player' && <select className="rh-select sm" value={item} onChange={(e) => setItem(Number(e.target.value))}><option value={0}>Choose a player</option>{props.myPlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          {kind === 'tokens' && <input className="md-search" type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ maxWidth: 120 }} />}
          <select className="rh-select sm" value={place} onChange={(e) => setPlace(Number(e.target.value))} aria-label="For"><option value={1}>For the winner</option><option value={2}>For the runner-up</option></select>
          <button className="rh-btn go" disabled={pending} onClick={stake}>Stake it</button>
          <span className="rh-dim" style={{ fontSize: 12 }}>It stays yours until the commish hands it to the winner. You can take it back while it’s in the pool.</span>
        </div>
      )}
      {open === 'mint' && (
        <div className="cp-form">
          <div className="cp-presets">
            {MINT_PRESETS.map((m) => <button key={m.label} className="cp-preset" disabled={pending} onClick={() => run(() => addPrize({ comp: comp.key, source: 'minted', kind: m.kind, amount: m.amount ?? null, label: m.label, place }), 'Added.')}>{m.label}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="md-search" placeholder="Or name your own prize" value={label} onChange={(e) => setLabel(e.target.value)} style={{ minWidth: 200 }} />
            <select className="rh-select sm" value={place} onChange={(e) => setPlace(Number(e.target.value))} aria-label="For"><option value={1}>Winner</option><option value={2}>Runner-up</option><option value={3}>Third</option></select>
            <button className="rh-btn go" disabled={pending || !label.trim()} onClick={() => run(() => addPrize({ comp: comp.key, source: 'minted', kind: 'other', label, place }), 'Added.')}>Add</button>
          </div>
        </div>
      )}
      {msg && <span className={msg.ok ? 'rh-up' : 'rh-down'} style={{ fontSize: 12.5 }}>{msg.text}</span>}
    </div>
  );
}

function CompCard({ comp, props }: { comp: CompDef; props: CompsProps }) {
  const { pending, msg, run } = useAct();
  const { settings, entries, prizes } = props.state;
  const entrants = entries.filter((e) => e.comp === comp.key).map((e) => e.team_id);
  const inIt = comp.everyone || entrants.includes(props.myTeamId);
  const mineCount = entries.filter((e) => e.team_id === props.myTeamId && OPT_IN.includes(e.comp)).length;
  const full = !inIt && mineCount >= settings.cap;
  const off = !comp.everyone && !settings.enabled.includes(comp.key);
  const pz = prizes.filter((p) => p.comp === comp.key);
  const name = (id: number) => props.teams.find((t) => t.id === id)?.short ?? '?';
  return (
    <section className={`rh-card cp-card ${inIt ? 'in' : ''} ${off ? 'off' : ''}`} style={{ ['--hue' as string]: comp.hue }}>
      <div className="cp-top">
        <div style={{ minWidth: 0, flex: 1 }}>
          <span className="rh-k">{comp.everyone ? 'Everyone’s in' : off ? 'Not running this season' : inIt ? 'You’re in' : `${entrants.length} entered`}</span>
          <h2 className="cp-name">{comp.name}</h2>
        </div>
        {comp.key === 'cup' ? <Link href="/live/cup" className="rh-btn alt">Open the Cup</Link>
          : !off && <button className={`rh-btn ${inIt ? 'alt' : 'go'}`} disabled={pending || (full && !inIt) || !props.state.ready} onClick={() => run(() => joinComp(comp.key, !inIt))}>{inIt ? 'Leave' : full ? 'At your limit' : 'Enter'}</button>}
      </div>
      <p className="cp-blurb">{comp.blurb}</p>
      <ul className="cp-facts"><li>{comp.how}</li><li>{comp.rounds}</li><li>{comp.lineup === 'gtrain' ? 'Scored off your G-Train team: nothing extra to pick.' : 'Set its team on Matchday.'}</li></ul>
      {!comp.everyone && entrants.length > 0 && <div className="cp-entrants">{entrants.map((t) => <span key={t} className={t === props.myTeamId ? 'me' : ''}>{name(t)}</span>)}</div>}
      {msg && <span className={msg.ok ? 'rh-up' : 'rh-down'} style={{ fontSize: 12.5 }}>{msg.text}</span>}
      <div className="cp-pool">
        <span className="rh-k">Prize pool</span>
        {pz.length ? pz.map((p) => <PrizeRow key={p.id} p={p} props={props} comp={comp} />) : <span className="rh-dim" style={{ fontSize: 13 }}>Nothing up for grabs yet.</span>}
        {!off && props.state.ready && <AddPrize comp={comp} props={props} />}
      </div>
    </section>
  );
}

function Settings({ props }: { props: CompsProps }) {
  const { pending, msg, run } = useAct();
  const s = props.state.settings;
  const [cap, setCap] = useState(s.cap);
  const [on, setOn] = useState<CompKey[]>(s.enabled);
  const [locks, setLocks] = useState(s.locks_at ? s.locks_at.slice(0, 10) : '');
  return (
    <section className="rh-card cp-settings">
      <span className="rh-k">Commish · comp menu for {s.season}</span>
      <div className="cp-set-row">
        <span>Each coach can enter</span>
        <span className="bd-step"><button onClick={() => setCap(Math.max(0, cap - 1))} disabled={cap <= 0}>−</button><span className="rh-mono">{cap}</span><button onClick={() => setCap(Math.min(OPT_IN.length, cap + 1))} disabled={cap >= OPT_IN.length}>+</button></span>
        <span>side comp{cap === 1 ? '' : 's'} (the Cup doesn’t count)</span>
      </div>
      <div className="bd-chips">
        {COMPS.filter((c) => !c.everyone).map((c) => <button key={c.key} className={on.includes(c.key) ? 'on' : ''} onClick={() => setOn(on.includes(c.key) ? on.filter((x) => x !== c.key) : [...on, c.key])}>{c.name}</button>)}
      </div>
      <label className="cp-set-row">Entries lock on <input type="date" className="md-search" style={{ maxWidth: 170 }} value={locks} onChange={(e) => setLocks(e.target.value)} /></label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="rh-btn go" disabled={pending} onClick={() => run(() => saveCompSettings(cap, on, locks ? new Date(`${locks}T12:00:00+08:00`).toISOString() : null), 'Saved.')}>Save menu</button>
        {msg && <span className={msg.ok ? 'rh-up' : 'rh-down'} style={{ fontSize: 12.5 }}>{msg.text}</span>}
      </div>
    </section>
  );
}

export function CompsPage(props: CompsProps) {
  const { settings, entries, ready } = props.state;
  const mine = entries.filter((e) => e.team_id === props.myTeamId && OPT_IN.includes(e.comp)).length;
  const order = [...COMPS].sort((a, b) => Number(!!b.everyone) - Number(!!a.everyone) || Number(settings.enabled.includes(b.key)) - Number(settings.enabled.includes(a.key)));
  return (
    <Shell title="Side comps" sub={<>Pick your comps for {settings.season}. Prizes are minted by the commish or staked by the coaches who enter.</>}
      right={<span className="rh-chip">{mine} of {settings.cap} entered</span>}>
      {!ready && <div className="rh-card md-warn">Entering and prizes switch on once <code>supabase/migrations/0020_matchday_comps_msd_values.sql</code> has been run.</div>}
      {props.isCommish && <Settings props={props} />}
      <div className="cp-grid">{order.map((c) => <CompCard key={c.key} comp={c} props={props} />)}</div>
    </Shell>
  );
}
