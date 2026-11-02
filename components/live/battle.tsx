'use client';
// Live Matchups home: your keeper-league matchup on the left; the battle desk (token cash, challenges and the custom
// game builder) and your other games on the right. Also the custom-game matchup view.
import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DEFAULT_SETTINGS, FORMATIONS, customResults, matchesInPlay, type GamePick, type GameRow, type GameSettings, type LGame, type LPlayer, type LRound, type Roles, type Slot } from '@/lib/aflw';
import type { MGame, MRound } from '@/lib/mens-round';
import { loadRoles, saveRoles } from '@/app/(app)/live/actions';
import { cancelChallenge, decideRequest, grantTokens, loadDesk, markAssetsDone, offerChallenge, requestTokens, respondChallenge, settleChallenge, type Challenge, type Desk, type Stake } from '@/app/(app)/live/battle-actions';
import { A_COL, B_COL, MFace, PlayerSheet, Worm, liveOf, teamAt, useTimeline, type ProfileOpen } from './mens';
import { Face, Shell, gameLabel, isLive, useRound, type TeamRow } from './kit';

const SLOTS4: Slot[] = ['DEF', 'MID', 'RUC', 'FWD'];
const PERTH = 'Australia/Perth';
const when = (d: string) => new Date(d).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: PERTH });
export type Assets = { picks: { id: number; owner: number; label: string }[]; players: { id: number; team: number; name: string }[] };
type Game = GameRow & { picks: GamePick[] };

/* ---------------- custom game builder ---------------- */
export function settingsSummary(s: GameSettings, games?: LGame[]) {
  const n = s.matches.length || games?.length || 0;
  const scope = s.matches.length ? `${n} match${n === 1 ? '' : 'es'}` : 'whole round';
  if (s.mode === 'duels') return `Player duels · one player per match · ${scope}`;
  const f = SLOTS4.filter((x) => s.formation[x]).map((x) => `${s.formation[x]} ${x}`).join(', ');
  const cap = s.captain ? (s.triple ? ' · triple captain' : ' · captain x2') + (s.vc ? ' · VC covers' : '') : '';
  return `${s.per} a side (${f}) · ${scope}${cap}`;
}
export function GameSetup({ s, set, games }: { s: GameSettings; set: (s: GameSettings) => void; games: LGame[] }) {
  const upd = (patch: Partial<GameSettings>) => {
    const n = { ...s, ...patch };
    if (patch.mode === 'total' && s.mode === 'duels') n.captain = true;
    n.per = n.mode === 'duels' ? (n.matches.length || games.length || 1) : SLOTS4.reduce((a, x) => a + n.formation[x], 0);
    if (n.mode === 'duels') { n.captain = false; n.vc = false; n.triple = false; }
    if (!n.captain) { n.vc = false; n.triple = false; }
    set(n);
  };
  const toggleMatch = (id: number) => upd({ matches: s.matches.includes(id) ? s.matches.filter((x) => x !== id) : [...s.matches, id] });
  const preset = FORMATIONS.find((p) => SLOTS4.every((x) => p.f[x] === s.formation[x]));
  return (
    <div className="bd-setup">
      <div className="bd-row">
        <span className="rh-k">Scoring</span>
        <div className="rh-seg">
          <button className={s.mode === 'total' ? 'on' : ''} onClick={() => upd({ mode: 'total' })}>Total score</button>
          <button className={s.mode === 'duels' ? 'on' : ''} onClick={() => upd({ mode: 'duels' })}>1-v-1 player duels</button>
        </div>
      </div>
      <p className="bd-help">{s.mode === 'total' ? 'Each club drafts a team. Highest combined score wins.' : 'For every match in play, each club puts forward one player from it. The higher scorer wins that duel for his club: 1 point. Most points wins; total score breaks a tie.'}</p>
      {s.mode === 'total' && (
        <div className="bd-row">
          <span className="rh-k">Formation · {s.per} a side</span>
          <select className="rh-select sm" value={preset?.label ?? ''} onChange={(e) => { const p = FORMATIONS.find((x) => x.label === e.target.value); if (p) upd({ formation: { ...p.f } }); }}>
            {!preset && <option value="">Custom</option>}
            {FORMATIONS.map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
          </select>
          <div className="bd-steppers">
            {SLOTS4.map((x) => (
              <span key={x} className="bd-step">
                <b>{x}</b>
                <button aria-label={`One fewer ${x}`} onClick={() => upd({ formation: { ...s.formation, [x]: Math.max(0, s.formation[x] - 1) } })} disabled={s.formation[x] === 0}>−</button>
                <span className="rh-mono">{s.formation[x]}</span>
                <button aria-label={`One more ${x}`} onClick={() => upd({ formation: { ...s.formation, [x]: Math.min(6, s.formation[x] + 1) } })} disabled={s.per >= 11}>+</button>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="bd-row">
        <span className="rh-k">Matches in play · {s.matches.length ? `${s.matches.length} picked` : 'whole round'}</span>
        <div className="bd-chips">
          <button className={!s.matches.length ? 'on' : ''} onClick={() => upd({ matches: [] })}>Whole round</button>
          {games.map((g) => <button key={g.id} className={s.matches.includes(g.id) ? 'on' : ''} onClick={() => toggleMatch(g.id)}>{g.home} v {g.away}<small>{when(g.date)}</small></button>)}
          {!games.length && <span className="rh-dim" style={{ fontSize: 12.5 }}>No matches in the current round yet.</span>}
        </div>
      </div>
      {s.mode === 'total' && (
        <div className="bd-toggles">
          <label className="rh-toggle"><input type="checkbox" checked={s.captain} onChange={(e) => upd({ captain: e.target.checked })} /><span />Captain scores double</label>
          <label className="rh-toggle"><input type="checkbox" checked={s.triple} disabled={!s.captain} onChange={(e) => upd({ triple: e.target.checked })} /><span />Triple captain (x3)</label>
          <label className="rh-toggle"><input type="checkbox" checked={s.vc} disabled={!s.captain} onChange={(e) => upd({ vc: e.target.checked })} /><span />Vice-captain scores it if the captain doesn’t play</label>
        </div>
      )}
      <span className="bd-sum rh-dim">{settingsSummary(s, games)}</span>
    </div>
  );
}

/* ---------------- custom game matchup (game page) ---------------- */
export function CustomMatchup({ game, picks, data, byId, gameBySquad, teamName, myTeamId, canManage }: {
  game: GameRow; picks: GamePick[]; data: LRound; byId: Map<number, LPlayer>; gameBySquad: Map<number, LGame>; teamName: (id: number) => string; myTeamId: number; canManage: boolean;
}) {
  const s = game.settings!;
  const [roles, setRoles] = useState<Record<number, Roles>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { loadRoles(game.id).then(setRoles).catch(() => {}); }, [game.id]);
  const res = customResults(s, game.order, picks, roles, byId, gameBySquad, data.games);
  const ranked = [...res].sort((a, b) => (s.mode === 'duels' ? b.points - a.points || b.score - a.score : b.score - a.score));
  const setRole = (team: number, kind: 'captain' | 'vc', id: number) => start(async () => {
    const cur = roles[team] ?? { captain: null, vc: null };
    const next = { ...cur, [kind]: cur[kind] === id ? null : id };
    if (kind === 'captain' && next.vc === id) next.vc = null;
    if (kind === 'vc' && next.captain === id) next.captain = null;
    const r = await saveRoles(game.id, next.captain, next.vc, canManage ? team : undefined);
    if (r.ok) { setRoles({ ...roles, [team]: next }); setMsg(null); } else setMsg(r.error ?? 'Couldn’t save.');
  });
  const val = (id: number) => byId.get(id);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="rh-card">
        <span className="rh-k">{settingsSummary(s, data.games)}</span>
        <div className="bd-score">
          {ranked.map((r, i) => (
            <div key={r.team} className={`bd-scorebox ${r.team === myTeamId ? 'me' : ''}`}>
              <span className="rh-dim">{i + 1}. {teamName(r.team)}</span>
              <b className="rh-mono">{s.mode === 'duels' ? r.points : r.score}</b>
              <span className="rh-dim rh-mono" style={{ fontSize: 12 }}>{s.mode === 'duels' ? `${r.score} pts total` : `proj ${r.proj}`} · {r.left} to play</span>
            </div>
          ))}
        </div>
        {msg && <span className="rh-down" style={{ fontSize: 13 }}>{msg}</span>}
      </div>
      {s.mode === 'duels' && game.order.length === 2 ? (
        <div className="rh-card">
          <span className="rh-k">Duels · one per match</span>
          {matchesInPlay(s, data.games).map((g) => {
            const [a, b] = game.order.map((t) => picks.find((pk) => pk.team_id === t && [g.homeId, g.awayId].includes(val(pk.player_id)?.squadId ?? 0)));
            const pa = a ? val(a.player_id) : undefined, pb = b ? val(b.player_id) : undefined;
            const sa = pa?.score ?? null, sb = pb?.score ?? null, fin = g.status === 'completed';
            return (
              <div key={g.id} className="bd-duel">
                <span className="bd-duel-p">{pa ? <><Face p={pa} size={26} /><span className="rh-ellip">{pa.name}</span></> : <span className="rh-dim">—</span>}</span>
                <b className={`rh-mono ${fin && sa != null && sb != null ? (sa > sb ? 'rh-up' : sa < sb ? 'rh-down' : '') : ''}`}>{sa ?? '–'}</b>
                <span className="bd-duel-m"><span className="rh-mono">{g.home} v {g.away}</span><span className={isLive(g) ? 'rh-up' : 'rh-dim'}>{gameLabel(g)}</span></span>
                <b className={`rh-mono ${fin && sa != null && sb != null ? (sb > sa ? 'rh-up' : sb < sa ? 'rh-down' : '') : ''}`}>{sb ?? '–'}</b>
                <span className="bd-duel-p r">{pb ? <><span className="rh-ellip">{pb.name}</span><Face p={pb} size={26} /></> : <span className="rh-dim">—</span>}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bd-teams">
          {game.order.map((t) => {
            const r = roles[t] ?? { captain: null, vc: null };
            const edit = s.captain && (t === myTeamId || canManage);
            return (
              <div key={t} className="rh-card">
                <span className="rh-k">{teamName(t)}{t === myTeamId ? ' · you' : ''}</span>
                {picks.filter((pk) => pk.team_id === t).map((pk) => {
                  const p = val(pk.player_id), g = p ? gameBySquad.get(p.squadId) : undefined;
                  const isC = r.captain === pk.player_id, isV = r.vc === pk.player_id;
                  return (
                    <div key={pk.player_id} className="bd-pl">
                      {p && <Face p={p} size={28} />}
                      <span className="bd-pl-n"><span className="rh-ellip">{pk.player_name}</span><span className="rh-dim">{pk.slot} · <span className={isLive(g) ? 'rh-up' : ''}>{gameLabel(g)}</span></span></span>
                      {s.captain && (edit
                        ? <span className="bd-cv"><button className={isC ? 'on' : ''} disabled={pending} onClick={() => setRole(t, 'captain', pk.player_id)}>C</button>{s.vc && <button className={isV ? 'on' : ''} disabled={pending} onClick={() => setRole(t, 'vc', pk.player_id)}>VC</button>}</span>
                        : (isC || isV) && <span className="mx-cap C">{isC ? 'C' : 'VC'}</span>)}
                      <b className="rh-mono">{p?.score ?? <span className="rh-dim">{p?.avg?.toFixed(0) ?? '–'}</span>}</b>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- keeper matchup panel (left) ---------------- */
function KeeperPanel({ mens, myTeamId }: { mens: MRound; myTeamId: number }) {
  const [prof, setProf] = useState<ProfileOpen>(null);
  const gameByClub = useMemo(() => { const m = new Map<string, MGame>(); for (const g of mens.games) { m.set(g.home, g); m.set(g.away, g); } return m; }, [mens.games]);
  const tl = useTimeline(mens.games);
  const now = Date.parse(mens.now);
  const mu = mens.matchups.find((m) => m.includes(myTeamId)) ?? mens.matchups[0];
  const team = (id: number) => mens.teams.find((t) => t.id === id)!;
  let A = team(mu[0]), B = team(mu[1]);
  if (mu[1] === myTeamId) [A, B] = [B, A];
  const sa = teamAt(A, gameByClub, now), sb = teamAt(B, gameByClub, now);
  const z = (sa.proj - sb.proj) / Math.max(1, Math.hypot(sa.sd, sb.sd));
  const win = 1 / (1 + Math.exp(-1.702 * z));
  const top = (t: typeof A) => t.players.filter((p) => p.line !== 'BENCH').map((p) => ({ p, l: liveOf(p, gameByClub, now) })).filter((x) => x.l.play > 0).sort((x, y) => y.l.score - x.l.score).slice(0, 3);
  const toPlay = (t: typeof A) => t.players.filter((p) => p.line !== 'BENCH' && liveOf(p, gameByClub, now).ph.state !== 'final').length;
  const cap = (t: typeof A) => { const c = t.players.find((p) => p.cap === 'C'); return c ? { c, l: liveOf(c, gameByClub, now) } : null; };
  return (
    <section className="rh-card bd-keeper">
      <div className="bd-kh">
        <span className="rh-k">G-Train · Round 1, 2027 · your matchup</span>
        <span className="rh-chip">Test data</span>
      </div>
      <div className="mx-sb">
        <div className="mx-sbt a"><span className="rh-k">{A.coach}</span><b>{A.name}</b><span className="mx-big rh-mono" style={{ color: A_COL }}>{sa.score}</span><span className="rh-dim rh-mono">proj {sa.proj}</span></div>
        <div className="mx-sbm"><span className="rh-k">Win chance</span><span className="mx-pct rh-mono">{Math.round(win * 100)}<small>%</small></span>
          <span className="mx-winbar wide"><i style={{ width: `${win * 100}%`, background: A_COL }} /><i style={{ width: `${(1 - win) * 100}%`, background: B_COL }} /></span></div>
        <div className="mx-sbt b"><span className="rh-k">{B.coach}</span><b>{B.name}</b><span className="mx-big rh-mono" style={{ color: B_COL }}>{sb.score}</span><span className="rh-dim rh-mono">proj {sb.proj}</span></div>
      </div>
      <Worm a={A} b={B} round={mens} now={now} gameByClub={gameByClub} tl={tl} />
      <div className="bd-keyinfo">
        {[A, B].map((t, i) => {
          const c = cap(t);
          return (
            <div key={t.id} className="bd-ki">
              <span className="rh-k" style={{ color: i ? B_COL : A_COL }}>{t.short || t.name} · {toPlay(t)} still to play</span>
              {top(t).map(({ p, l }) => (
                <div key={p.id} className="bd-kirow"><MFace p={p} size={24} /><button className="mx-pname rh-ellip" onClick={() => setProf({ p, team: t })}>{p.name}</button>{p.cap && <span className={`mx-cap ${p.cap}`}>{p.cap}</span>}<b className="rh-mono">{l.score}</b></div>
              ))}
              {c && <span className="rh-dim" style={{ fontSize: 12 }}>Captain {c.c.name}: {c.l.ph.state === 'pre' ? `plays ${when(c.l.game!.start)}` : `${c.l.score}${c.l.ph.state === 'live' ? ` · ${c.l.ph.label}` : ''}`}</span>}
            </div>
          );
        })}
      </div>
      <Link href="/live/mens" className="rh-btn alt" style={{ alignSelf: 'flex-start' }}>Open the full matchup →</Link>
      <PlayerSheet open={prof} onClose={() => setProf(null)} gameByClub={gameByClub} now={now} />
    </section>
  );
}

/* ---------------- battle desk (right) ---------------- */
function stakeText(st: Stake | null | undefined, assets: Assets) {
  if (!st) return '';
  const bits: string[] = [];
  if (st.tokens) bits.push(`${st.tokens.toLocaleString()} tokens`);
  for (const id of st.picks ?? []) bits.push(assets.picks.find((p) => p.id === id)?.label ?? `pick #${id}`);
  for (const id of st.players ?? []) bits.push(assets.players.find((p) => p.id === id)?.name ?? `player #${id}`);
  if (st.note) bits.push(st.note);
  return bits.join(' · ');
}

function BattleDesk({ initial, teams, myTeamId, isCommish, games, assets, roundName }: { initial: Desk; teams: TeamRow[]; myTeamId: number; isCommish: boolean; games: LGame[]; assets: Assets; roundName: string }) {
  const router = useRouter();
  const [desk, setDesk] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<'none' | 'buy' | 'challenge'>('none');
  const [buy, setBuy] = useState({ amount: 250, note: '' });
  const [grant, setGrant] = useState({ team: teams[0]?.id ?? 0, amount: 100 });
  const [opp, setOpp] = useState(teams.find((t) => t.id !== myTeamId)?.id ?? 0);
  const [s, setS] = useState<GameSettings>({ ...DEFAULT_SETTINGS });
  const [stake, setStake] = useState<Stake>({ tokens: 0, picks: [], players: [] });
  const [ask, setAsk] = useState<Stake>({ tokens: 0, picks: [], players: [] });
  const [message, setMessage] = useState('');
  const name = (id: number) => teams.find((t) => t.id === id)?.name ?? `Club ${id}`;
  const bal = desk.balances[myTeamId] ?? 0;
  const act = (fn: () => Promise<{ ok: boolean; error?: string; id?: number }>, ok: string, after?: (id?: number) => void) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? 'Something went wrong.' });
    if (r.ok) { setDesk(await loadDesk()); after?.(r.id); }
  });
  const toggleIn = (arr: number[], id: number) => (arr.includes(id) ? arr.filter((x) => x !== id) : arr.length >= 4 ? arr : [...arr, id]);
  const mine = desk.challenges.filter((c) => c.from_team === myTeamId || c.to_team === myTeamId);
  const incoming = mine.filter((c) => c.status === 'offered' && c.to_team === myTeamId);
  const outgoing = mine.filter((c) => c.status === 'offered' && c.from_team === myTeamId);
  const active = mine.filter((c) => c.status === 'accepted');
  const settled = desk.challenges.filter((c) => c.status === 'settled' && (c.from_team === myTeamId || c.to_team === myTeamId || (isCommish && !c.assets_done && ((c.stake.picks?.length ?? 0) + (c.stake.players?.length ?? 0) > 0)))).slice(0, 5);
  const myPicks = assets.picks.filter((p) => p.owner === myTeamId), myPlayers = assets.players.filter((p) => p.team === myTeamId);
  const oppPicks = assets.picks.filter((p) => p.owner === opp), oppPlayers = assets.players.filter((p) => p.team === opp);

  const card = (c: Challenge, actions: React.ReactNode) => (
    <div key={c.id} className="bd-ch">
      <div className="bd-ch-top"><b>{c.from_team === myTeamId ? `You → ${name(c.to_team)}` : `${name(c.from_team)} → ${c.to_team === myTeamId ? 'you' : name(c.to_team)}`}</b><span className="rh-dim rh-mono">#{c.id}</span></div>
      <span className="rh-dim" style={{ fontSize: 12.5 }}>{settingsSummary(c.settings)}</span>
      {(c.stake.tokens > 0 || c.stake.picks?.length || c.stake.players?.length || c.stake.note) && <span className="bd-stake">Stake: {stakeText(c.stake, assets)}{c.counter_stake ? <> · wants {stakeText(c.counter_stake, assets)}</> : null}</span>}
      {c.message && <span className="bd-msg">“{c.message}”</span>}
      <div className="bd-ch-act">{actions}</div>
    </div>
  );

  if (!desk.ready) return (
    <section className="rh-card bd-desk">
      <span className="rh-k">Battle desk</span>
      <p className="rh-dim" style={{ margin: 0, fontSize: 13.5 }}>Challenges and token cash switch on once the commish runs <span className="rh-mono">supabase/migrations/0018_battle_desk.sql</span> in Supabase.</p>
    </section>
  );

  return (
    <section className="rh-card bd-desk">
      <div className="bd-wallet">
        <div><span className="rh-k">Battle desk · token cash</span><b className="rh-mono bd-bal">{bal.toLocaleString()}</b></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className={`rh-btn ${open === 'buy' ? 'go' : 'alt'}`} onClick={() => setOpen(open === 'buy' ? 'none' : 'buy')}>Buy tokens</button>
          <button className={`rh-btn ${open === 'challenge' ? 'go' : 'soft'}`} onClick={() => setOpen(open === 'challenge' ? 'none' : 'challenge')}>New challenge</button>
        </div>
      </div>
      {msg && <div className={`rh-toast ${msg.ok ? 'up' : 'down'}`}>{msg.text}</div>}

      {open === 'buy' && (
        <div className="bd-form">
          <span className="rh-dim" style={{ fontSize: 13 }}>Ask the commish for tokens. Sort out payment with him; he approves it here and they land in your balance.</span>
          <div className="bd-chips">{[100, 250, 500, 1000].map((a) => <button key={a} className={buy.amount === a ? 'on' : ''} onClick={() => setBuy({ ...buy, amount: a })}>{a.toLocaleString()}</button>)}
            <input className="rh-input sm" id="bd-amount" type="number" min={1} max={100000} value={buy.amount} onChange={(e) => setBuy({ ...buy, amount: Number(e.target.value) })} aria-label="Tokens" style={{ width: 100 }} /></div>
          <input className="rh-input" id="bd-buynote" value={buy.note} onChange={(e) => setBuy({ ...buy, note: e.target.value })} placeholder="Note for the commish (optional)" maxLength={200} />
          <button className="rh-btn go" disabled={pending} onClick={() => act(() => requestTokens(buy.amount, buy.note), 'Request sent to the commish.', () => setOpen('none'))}>Request {buy.amount.toLocaleString()} tokens</button>
        </div>
      )}

      {open === 'challenge' && (
        <div className="bd-form">
          <label className="rh-field"><span className="rh-k">Challenge</span>
            <select className="rh-select" id="bd-opp" value={opp} onChange={(e) => { setOpp(Number(e.target.value)); setAsk({ tokens: 0, picks: [], players: [] }); }}>
              {teams.filter((t) => t.id !== myTeamId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <GameSetup s={s} set={setS} games={games} />
          <div className="bd-row">
            <span className="rh-k">Stake · each side puts up</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input className="rh-input sm" id="bd-tokens" type="number" min={0} max={bal} value={stake.tokens} onChange={(e) => setStake({ ...stake, tokens: Math.max(0, Number(e.target.value)) })} aria-label="Tokens each" style={{ width: 110 }} />
              <span className="rh-dim" style={{ fontSize: 12.5 }}>tokens each · you have {bal.toLocaleString()} · winner takes both</span>
            </div>
          </div>
          {(myPicks.length > 0 || myPlayers.length > 0) && (
            <div className="bd-row"><span className="rh-k">You put up (optional) · the commish transfers it</span>
              <div className="bd-chips">
                {myPicks.map((p) => <button key={`p${p.id}`} className={stake.picks.includes(p.id) ? 'on' : ''} onClick={() => setStake({ ...stake, picks: toggleIn(stake.picks, p.id) })}>{p.label}</button>)}
                {myPlayers.map((p) => <button key={`l${p.id}`} className={stake.players.includes(p.id) ? 'on' : ''} onClick={() => setStake({ ...stake, players: toggleIn(stake.players, p.id) })}>{p.name}</button>)}
              </div>
            </div>
          )}
          {(oppPicks.length > 0 || oppPlayers.length > 0) && (
            <div className="bd-row"><span className="rh-k">You want from {name(opp)} if you win (optional)</span>
              <div className="bd-chips">
                {oppPicks.map((p) => <button key={`p${p.id}`} className={ask.picks.includes(p.id) ? 'on' : ''} onClick={() => setAsk({ ...ask, picks: toggleIn(ask.picks, p.id) })}>{p.label}</button>)}
                {oppPlayers.map((p) => <button key={`l${p.id}`} className={ask.players.includes(p.id) ? 'on' : ''} onClick={() => setAsk({ ...ask, players: toggleIn(ask.players, p.id) })}>{p.name}</button>)}
              </div>
            </div>
          )}
          <input className="rh-input" id="bd-msg" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message (optional)" maxLength={200} />
          <button className="rh-btn go" disabled={pending || !opp || s.per < 1 || stake.tokens > bal} onClick={() => act(() => offerChallenge(opp, s, stake, ask, message), `Challenge sent to ${name(opp)}.`, () => setOpen('none'))}>Send challenge for {roundName}</button>
        </div>
      )}

      {isCommish && desk.requests.some((r) => r.status === 'pending') && (
        <div className="bd-list"><span className="rh-k">Token requests · commish</span>
          {desk.requests.filter((r) => r.status === 'pending').map((r) => (
            <div key={r.id} className="bd-req"><span><b>{name(r.team_id)}</b> wants {r.amount.toLocaleString()}{r.note ? <span className="rh-dim"> · {r.note}</span> : null}</span>
              <span style={{ display: 'flex', gap: 6 }}><button className="rh-btn go" disabled={pending} onClick={() => act(() => decideRequest(r.id, true), 'Approved.')}>Approve</button><button className="rh-btn alt" disabled={pending} onClick={() => act(() => decideRequest(r.id, false), 'Declined.')}>Decline</button></span></div>
          ))}
        </div>
      )}
      {!isCommish && desk.requests.filter((r) => r.status === 'pending').map((r) => <span key={r.id} className="rh-dim" style={{ fontSize: 12.5 }}>Waiting on the commish: {r.amount.toLocaleString()} tokens</span>)}

      {incoming.length > 0 && <div className="bd-list"><span className="rh-k">Challenges for you</span>{incoming.map((c) => card(c, <>
        <button className="rh-btn go" disabled={pending || c.stake.tokens > bal} onClick={() => act(() => respondChallenge(c.id, true), 'Accepted. Off to the draft.', (id) => id && router.push(`/live/g/${id}`))}>Accept{c.stake.tokens ? ` (${c.stake.tokens.toLocaleString()} tokens)` : ''}</button>
        <button className="rh-btn alt" disabled={pending} onClick={() => act(() => respondChallenge(c.id, false), 'Declined.')}>Decline</button></>))}</div>}
      {outgoing.length > 0 && <div className="bd-list"><span className="rh-k">Waiting on a reply</span>{outgoing.map((c) => card(c, <button className="rh-btn alt" disabled={pending} onClick={() => act(() => cancelChallenge(c.id), 'Cancelled.')}>Cancel</button>))}</div>}
      {active.length > 0 && <div className="bd-list"><span className="rh-k">On now</span>{active.map((c) => card(c, <>
        {c.game_id && <Link className="rh-btn soft" href={`/live/g/${c.game_id}`}>Open game</Link>}
        <button className="rh-btn alt" disabled={pending} onClick={() => act(() => settleChallenge(c.id), 'Settled.')}>Settle result</button></>))}</div>}
      {settled.length > 0 && <div className="bd-list"><span className="rh-k">Results</span>{settled.map((c) => card(c, <>
        <span className={c.winner_team === myTeamId ? 'rh-up' : c.winner_team ? 'rh-down' : 'rh-dim'} style={{ fontWeight: 600, fontSize: 13 }}>{c.winner_team ? `${name(c.winner_team)} won` : 'Draw: stakes returned'}</span>
        {((c.stake.picks?.length ?? 0) + (c.stake.players?.length ?? 0) + (c.counter_stake?.picks?.length ?? 0) + (c.counter_stake?.players?.length ?? 0)) > 0 && (c.assets_done
          ? <span className="rh-dim" style={{ fontSize: 12.5 }}>Picks/players transferred</span>
          : isCommish ? <button className="rh-btn alt" disabled={pending} onClick={() => act(() => markAssetsDone(c.id), 'Marked as transferred.')}>Mark picks/players transferred</button> : <span className="rh-dim" style={{ fontSize: 12.5 }}>Commish to transfer picks/players</span>)}</>))}</div>}
      {!incoming.length && !outgoing.length && !active.length && !settled.length && open === 'none' && <span className="rh-dim" style={{ fontSize: 13.5 }}>No challenges yet. Send one: pick a club, set the rules, put something on it.</span>}

      {desk.ledger.length > 0 && (
        <details className="bd-ledger"><summary className="rh-k">Token history</summary>
          {desk.ledger.map((l, i) => <div key={i} className="bd-led"><span>{l.reason}</span><b className={`rh-mono ${l.delta >= 0 ? 'rh-up' : 'rh-down'}`}>{l.delta > 0 ? '+' : ''}{l.delta}</b></div>)}
        </details>
      )}
      {isCommish && (
        <details className="bd-ledger"><summary className="rh-k">Commish · grant tokens</summary>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <select className="rh-select sm" id="bd-gteam" value={grant.team} onChange={(e) => setGrant({ ...grant, team: Number(e.target.value) })}>{teams.map((t) => <option key={t.id} value={t.id}>{t.name} · {(desk.balances[t.id] ?? 0).toLocaleString()}</option>)}</select>
            <input className="rh-input sm" id="bd-gamt" type="number" value={grant.amount} onChange={(e) => setGrant({ ...grant, amount: Number(e.target.value) })} style={{ width: 100 }} aria-label="Amount" />
            <button className="rh-btn alt" disabled={pending} onClick={() => act(() => grantTokens(grant.team, grant.amount, 'Commish adjustment'), 'Done.')}>Apply</button>
          </div>
        </details>
      )}
    </section>
  );
}

/* ---------------- home ---------------- */
export function LiveHome({ initial, games, ready, teams, myTeamId, isCommish, mens, desk, assets }: {
  initial: LRound; games: Game[]; ready: boolean; teams: TeamRow[]; myTeamId: number; isCommish: boolean; mens: MRound; desk: Desk; assets: Assets;
}) {
  const { data } = useRound(initial);
  const name = (id: number) => teams.find((t) => t.id === id)?.name ?? `Club ${id}`;
  const mine = games.filter((g) => g.order.includes(myTeamId));
  const current = mine.filter((g) => g.round === data.round && data.status !== 'completed');
  const completed = mine.filter((g) => !(g.round === data.round && data.status !== 'completed')).slice(0, 6);
  const kindName = (g: Game) => (g.kind === 'custom' ? (g.settings?.mode === 'duels' ? 'Player duels' : 'Custom') : g.kind === 'cap5' ? 'Salary cap' : g.kind === 'duel5' ? 'Duel' : 'Snake draft');
  const row = (g: Game) => (
    <Link key={g.id} href={`/live/g/${g.id}`} className="bd-game">
      <span className="bd-game-n"><b className="rh-ellip">{g.name}</b><span className="rh-dim">{kindName(g)} · {g.order.length === 2 ? g.order.filter((t) => t !== myTeamId).map(name).join('') : `${g.order.length} clubs`}</span></span>
      <span className={g.status === 'drafting' ? 'rh-up' : 'rh-dim'} style={{ fontSize: 12.5 }}>{g.status === 'drafting' ? 'Drafting' : `R${g.round}`}</span>
    </Link>
  );
  return (
    <Shell title="Live Matchups" sub={<>{data.name} · your keeper matchup, challenges and games in one place</>}>
      <div className="bd-home">
        <KeeperPanel mens={mens} myTeamId={myTeamId} />
        <div className="bd-right">
          <BattleDesk initial={desk} teams={teams} myTeamId={myTeamId} isCommish={isCommish} games={data.games} assets={assets} roundName={data.name} />
          <section className="rh-card">
            <div className="bd-kh"><span className="rh-k">Current games · {data.name}</span><Link href="/live/new" className="rh-link" style={{ fontSize: 13 }}>New game</Link></div>
            {!ready ? <span className="rh-dim">Games switch on once the mini-game tables exist.</span> : current.length ? current.map(row) : <span className="rh-dim" style={{ fontSize: 13.5 }}>You’re not in a game this round.</span>}
          </section>
          <section className="rh-card">
            <div className="bd-kh"><span className="rh-k">Completed games</span><Link href="/live/games" className="rh-link" style={{ fontSize: 13 }}>All games</Link></div>
            {completed.length ? completed.map(row) : <span className="rh-dim" style={{ fontSize: 13.5 }}>Nothing finished yet.</span>}
          </section>
        </div>
      </div>
    </Shell>
  );
}
