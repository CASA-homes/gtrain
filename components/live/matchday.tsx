'use client';
// Matchday: the home of game week. Left half: your team for whichever game you pick from the dropdown.
// Right half: that game's matchup (or table), and the Knockout Cup panel underneath.
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CLUBS } from '@/lib/clubs';
import { RULES, autoFill, filledField, fits, onField, projTotal, type MdLineup, type MdPlayer, type Rules, type SlotRule } from '@/lib/matchday';
import type { GameOpt, MatchdayData, Side } from '@/lib/matchday-data';
import { saveGameLineup } from '@/app/(app)/live/matchday-actions';
import { CupPanel, type CupData } from './cup';
import { Shell } from './kit';

const empty = (r: Rules): MdLineup => ({ slots: Object.fromEntries(r.slots.map((s) => [s.key, []])), c: null, vc: null });
const initials = (n: string) => n.split(' ').map((w) => w[0]).slice(0, 2).join('');

function Face({ p, size = 30 }: { p: MdPlayer; size?: number }) {
  const [bad, setBad] = useState(false);
  const c = p.club ? CLUBS[p.club] : null;
  return (
    <span className="md-face" style={{ width: size, height: size, boxShadow: `0 0 0 2px ${c?.a ?? '#d6dad3'}` }} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.photo && !bad ? <img src={p.photo} alt="" loading="lazy" onError={() => setBad(true)} /> : <span>{initials(p.name)}</span>}
    </span>
  );
}

/* ---------------- lineup builder (left) ---------------- */
function Builder({ game, rules, squad, initial, used, onChange }: {
  game: GameOpt; rules: Rules; squad: MdPlayer[]; initial: MdLineup | null; used: number[]; onChange: (l: MdLineup) => void;
}) {
  const router = useRouter();
  const byId = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);
  const [lineup, setLineupRaw] = useState<MdLineup>(() => initial ?? empty(rules));
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState<{ slot: SlotRule; i: number } | null>(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const setLineup = (l: MdLineup) => { setLineupRaw(l); setDirty(true); setMsg(null); onChange(l); };

  const inLineup = new Set(Object.values(lineup.slots).flat());
  const proj = (id: number) => byId.get(id)?.proj ?? 0;
  const total = projTotal(rules, lineup, proj);
  const count = filledField(rules, lineup), need = onField(rules);

  const place = (id: number) => {
    if (!sel) return;
    const slots = Object.fromEntries(Object.entries(lineup.slots).map(([k, v]) => [k, v.filter((x) => x !== id)]));
    const arr = [...(slots[sel.slot.key] ?? [])];
    if (sel.i < arr.length) arr[sel.i] = id; else arr.push(id);
    slots[sel.slot.key] = arr.slice(0, sel.slot.n);
    setLineup({ ...lineup, slots }); setSel(null); setQ('');
  };
  const remove = (key: string, id: number) => setLineup({ ...lineup, slots: { ...lineup.slots, [key]: (lineup.slots[key] ?? []).filter((x) => x !== id) },
    c: lineup.c === id ? null : lineup.c, vc: lineup.vc === id ? null : lineup.vc });
  const role = (id: number, kind: 'c' | 'vc') => {
    const next = { ...lineup, [kind]: lineup[kind] === id ? null : id };
    if (kind === 'c' && next.vc === id) next.vc = null;
    if (kind === 'vc' && next.c === id) next.c = null;
    setLineup(next);
  };
  const options = sel ? squad.filter((p) => fits(p, sel.slot, rules) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.proj - a.proj).slice(0, 60) : [];
  const save = () => start(async () => {
    const r = await saveGameLineup(rules.key, game.round, lineup);
    setMsg(r.ok ? { ok: true, text: `Saved for ${game.label}.` } : { ok: false, text: r.error ?? 'Couldn’t save.' });
    if (r.ok) { setDirty(false); router.refresh(); }
  });

  return (
    <>
      <div className="md-total">
        <div><span className="rh-k">Projected</span><b className="rh-mono">{total}</b></div>
        <div><span className="rh-k">On field</span><b className={`rh-mono ${count >= need ? 'rh-up' : ''}`}>{count}<small>/{need}</small></b></div>
        {rules.captain && <div><span className="rh-k">Captain</span><b className="md-ellip">{lineup.c ? byId.get(lineup.c)?.name.split(' ').slice(-1)[0] : '–'}</b></div>}
        <span className={`md-state ${dirty ? 'dirty' : initial ? 'saved' : ''}`}>{dirty ? 'Unsaved changes' : initial ? 'Saved' : 'Not set'}</span>
      </div>

      <div className="md-lines">
        {rules.slots.map((s) => (
          <div key={s.key} className={`md-line ${s.bench ? 'bench' : ''}`}>
            <span className="md-line-k">{s.label}<small>{(lineup.slots[s.key] ?? []).length}/{s.n}</small></span>
            <div className="md-slots">
              {Array.from({ length: s.n }, (_, i) => {
                const id = lineup.slots[s.key]?.[i]; const p = id != null ? byId.get(id) : undefined;
                const on = sel?.slot.key === s.key && sel.i === i;
                return p ? (
                  <div key={i} className={`md-slot full ${on ? 'on' : ''}`}>
                    <button className="md-slot-main" onClick={() => setSel(on ? null : { slot: s, i })}>
                      <Face p={p} size={28} />
                      <span className="md-slot-n"><b className="md-ellip">{p.name}</b><span className="rh-dim rh-mono">{p.pos.join('/')} · {p.proj}</span></span>
                    </button>
                    {!s.bench && rules.captain && (
                      <span className="md-roles">
                        <button className={`md-role ${lineup.c === p.id ? 'on' : ''}`} aria-label={`Captain ${p.name}`} onClick={() => role(p.id, 'c')}>C</button>
                        {rules.vc && <button className={`md-role vc ${lineup.vc === p.id ? 'on' : ''}`} aria-label={`Vice-captain ${p.name}`} onClick={() => role(p.id, 'vc')}>VC</button>}
                      </span>
                    )}
                    <button className="md-x" aria-label={`Take ${p.name} out`} onClick={() => remove(s.key, p.id)}>×</button>
                  </div>
                ) : (
                  <button key={i} className={`md-slot ${on ? 'on' : ''}`} onClick={() => setSel(on ? null : { slot: s, i: (lineup.slots[s.key] ?? []).length })}>
                    <span className="md-plus">+</span><span className="rh-dim">{s.fits === 'any' ? (s.bench ? 'Emergency' : 'Any position') : s.label.replace(' emergency', '')}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {sel && (
        <div className="md-picker">
          <div className="md-picker-h">
            <span className="rh-k">Pick for {sel.slot.label.toLowerCase()}</span>
            <input className="md-search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <button className="md-close" onClick={() => { setSel(null); setQ(''); }} aria-label="Close picker">×</button>
          </div>
          <div className="md-opts">
            {options.map((p) => {
              const burnt = used.includes(p.id);
              return (
                <button key={p.id} className={`md-opt ${inLineup.has(p.id) ? 'in' : ''}`} disabled={burnt} onClick={() => place(p.id)}>
                  <Face p={p} size={26} />
                  <span className="md-ellip" style={{ flex: 1, textAlign: 'left' }}>{p.name} <span className="rh-dim">{p.pos.join('/')}{p.club ? ` · ${p.club}` : ''}{burnt ? ' · used' : inLineup.has(p.id) ? ' · moves here' : ''}</span></span>
                  <span className="rh-mono">{p.proj}</span>
                </button>
              );
            })}
            {!options.length && <span className="rh-dim" style={{ padding: 12, fontSize: 13 }}>No one on your list fits here{rules.eligible ? ' and is eligible' : ''}.</span>}
          </div>
        </div>
      )}

      {msg && <div className={`rh-toast ${msg.ok ? 'up' : 'down'}`} style={{ margin: 0 }}>{msg.text}</div>}
      <div className="md-actions">
        <button className="rh-btn go" disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save team'}</button>
        <button className="rh-btn alt" onClick={() => setLineup(autoFill(rules, squad, new Set(used)))}>Auto-pick best</button>
        <button className="rh-btn alt" onClick={() => setLineup(empty(rules))}>Clear</button>
      </div>
    </>
  );
}

/* ---------------- matchup (right) ---------------- */
function SideList({ side, rules, look }: { side: { lineup: MdLineup }; rules: Rules; look: (id: number) => MdPlayer | undefined }) {
  return (
    <div className="md-sidelist">
      {rules.slots.filter((s) => !s.bench).map((s) => (
        <div key={s.key} className="md-sl-line">
          <span className="md-sl-k">{s.key}</span>
          {(side.lineup.slots[s.key] ?? []).map((id) => { const p = look(id); return p ? (
            <span key={id} className="md-sl-p"><span className="md-ellip">{p.name.split(' ').slice(-1)[0]}</span>{side.lineup.c === id && <i className="md-c">C</i>}<b className="rh-mono">{p.proj}</b></span>
          ) : null; })}
        </div>
      ))}
    </div>
  );
}

function Matchup({ game, rules, mine, myName, myTeamId, look }: { game: GameOpt; rules: Rules; mine: MdLineup; myName: string; myTeamId: number; look: (id: number) => MdPlayer | undefined }) {
  const proj = (id: number) => look(id)?.proj ?? 0;
  if (game.opp) {
    const a = projTotal(rules, mine, proj), b = projTotal(rules, game.opp.lineup, proj);
    const sd = Math.max(1, Math.sqrt(onField(rules)) * 22);
    const win = 1 / (1 + Math.exp(-1.702 * ((a - b) / (sd * Math.SQRT2))));
    const lineSum = (l: MdLineup, k: string) => (l.slots[k] ?? []).reduce((t, id) => t + proj(id) * (rules.captain && l.c === id ? 2 : 1), 0);
    return (
      <section className="rh-card md-mu">
        <div className="md-mu-h"><span className="rh-k">{game.label}{game.key === 'cup' && game.note ? ` · ${game.note}` : ''}</span><span className="rh-chip">Projected</span></div>
        <div className="md-score">
          <div className="me"><span className="rh-dim">You</span><b className="md-ellip">{myName}</b><span className="md-big rh-mono">{a}</span></div>
          <div className="md-vs"><span className="md-pct rh-mono">{Math.round(win * 100)}<small>%</small></span><span className="rh-dim">win chance</span></div>
          <div className="them"><span className="rh-dim">{game.opp.saved ? 'Their team' : 'Their best guess'}</span><b className="md-ellip">{game.opp.name}</b><span className="md-big rh-mono">{b}</span></div>
        </div>
        <span className="md-winbar"><i style={{ width: `${win * 100}%` }} /></span>
        <div className="md-lines-cmp">
          {rules.slots.filter((s) => !s.bench).map((s) => {
            const x = Math.round(lineSum(mine, s.key)), y = Math.round(lineSum(game.opp!.lineup, s.key)), m = Math.max(1, x, y);
            return (
              <div key={s.key} className="md-lc">
                <span className={`rh-mono ${x >= y ? 'rh-up' : ''}`}>{x}</span>
                <span className="md-lc-bar l"><i style={{ width: `${(x / m) * 100}%` }} /></span>
                <span className="md-lc-k">{s.key}</span>
                <span className="md-lc-bar r"><i style={{ width: `${(y / m) * 100}%` }} /></span>
                <span className={`rh-mono ${y > x ? 'rh-down' : ''}`}>{y}</span>
              </div>
            );
          })}
        </div>
        <details className="md-det"><summary>Their lineup</summary><SideList side={game.opp} rules={rules} look={look} /></details>
        {game.note && game.key !== 'cup' && <span className="rh-dim" style={{ fontSize: 12 }}>{game.note}</span>}
      </section>
    );
  }
  if (game.table) {
    const rows = game.table.map((s) => { const l = s.teamId === myTeamId ? mine : s.lineup; return { s: { ...s, lineup: l }, t: rules.key === 'survivor' ? 0 : projTotal(rules, l, proj) }; });
    const sorted = [...rows].sort((x, y) => y.t - x.t);
    return (
      <section className="rh-card md-mu">
        <div className="md-mu-h"><span className="rh-k">{game.label}</span><span className="rh-chip">{rules.key === 'survivor' ? 'Picks' : 'Projected'}</span></div>
        {game.note && <span className="rh-dim" style={{ fontSize: 12.5 }}>{game.note}</span>}
        {!sorted.length && <span className="rh-dim">No one has entered yet.</span>}
        <div className="md-table">
          {sorted.map(({ s, t }, i) => {
            const pick = s.lineup.slots.PICK?.[0];
            return (
              <div key={s.teamId} className={`md-tr ${s.teamId === myTeamId ? 'me' : ''}`}>
                <span className="rh-mono rh-dim">{i + 1}</span>
                <b className="md-ellip">{s.name}</b>
                {rules.key === 'survivor'
                  ? <span className="md-ellip rh-dim">{pick ? `${look(pick)?.name ?? 'Picked'} · ${look(pick)?.proj ?? '–'}` : 'No pick yet'}</span>
                  : <span className="rh-mono">{t}{!s.saved && <small className="rh-dim"> est.</small>}</span>}
              </div>
            );
          })}
        </div>
      </section>
    );
  }
  return <section className="rh-card md-mu"><span className="rh-k">{game.label}</span><span className="rh-dim">No opponent this round.</span></section>;
}

/* ---------------- page ---------------- */
export function Matchday({ data, cup }: { data: MatchdayData; cup: CupData }) {
  const [gid, setGid] = useState(data.games[0]?.id ?? '');
  const game = data.games.find((g) => g.id === gid) ?? data.games[0];
  const rules = RULES[game.key];
  const squad = game.key === 'survivor' ? data.pool : data.squad;
  const look = useMemo(() => { const m = new Map<number, MdPlayer>([...Object.values(data.others), ...data.squad, ...data.pool].map((p) => [p.id, p])); return (id: number) => m.get(id); }, [data]);
  const [live, setLive] = useState<Record<string, MdLineup>>({});
  const mine = live[game.id] ?? data.lineups[game.id] ?? autoFill(rules, squad, new Set(data.survivorUsed));
  return (
    <Shell title="Matchday" sub={<>Round {data.round}, {data.season} · set your teams, see who you’re up against</>}
      right={<Link href="/live/matchups" className="rh-btn alt">All your matchups →</Link>}>
      {!data.ready && <div className="rh-card md-warn">Saving teams switches on once <code>supabase/migrations/0020_matchday_comps_msd_values.sql</code> has been run. You can still build and preview.</div>}
      <div className="md-grid">
        <section className="rh-card md-team">
          <div className="md-team-h">
            <div style={{ minWidth: 0 }}><span className="rh-k">Set your team</span><h2 className="md-h">{game.label}</h2><span className="rh-dim" style={{ fontSize: 13 }}>{game.sub}</span></div>
            <label className="md-gamesel">
              <span className="sr-only">Game</span>
              <select className="rh-select" value={game.id} onChange={(e) => setGid(e.target.value)}>
                {data.games.map((g) => <option key={g.id} value={g.id}>{g.label} · {g.sub}</option>)}
              </select>
            </label>
          </div>
          <p className="md-rules">{rules.summary}</p>
          <Builder key={game.id} game={game} rules={rules} squad={squad} initial={data.lineups[game.id] ?? null} used={game.key === 'survivor' ? data.survivorUsed : []}
            onChange={(l) => setLive((x) => ({ ...x, [game.id]: l }))} />
          <span className="rh-dim" style={{ fontSize: 12.5 }}>Want more games? <Link href="/live/comps" className="rh-link">Enter a side comp</Link> or <Link href="/live/new" className="rh-link">start a mini game</Link>.</span>
        </section>
        <div className="md-right">
          <Matchup game={game} rules={rules} mine={mine} myName={data.myName} myTeamId={data.myTeamId} look={look} />
          <CupPanel data={cup} />
        </div>
      </div>
    </Shell>
  );
}

export type { Side };
