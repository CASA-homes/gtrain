'use client';
// Mid-season draft room: phase stepper, the 3-round board, your drops, the pool, and the commish controls.
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MSD_DROPS, MSD_ROUNDS, PHASES, onTheClock } from '@/lib/msd';
import { applyMsd, createMsdPicks, makeMsdPick, saveMsdOrder, setMsdPhase, toggleDrop, undoMsdPick, type MsdData } from '@/app/(app)/draft/msd/actions';

type Row = { id: number; name: string; pos: string; club: string | null; proj: number; avg: number | null; from: number | null };
export function MsdRoom({ data, myTeamId, isCommish, teams, ladderOrder, pool, mine, usingLastSeason }: {
  data: MsdData; myTeamId: number; isCommish: boolean; teams: { id: number; name: string; short: string }[];
  ladderOrder: number[]; pool: Row[]; mine: (Row & { keeper: boolean })[]; usingLastSeason: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('ALL');
  const { state, picks, drops, selections } = data;
  const name = (id: number) => teams.find((t) => t.id === id)?.name ?? `Club ${id}`;
  const short = (id: number) => teams.find((t) => t.id === id)?.short ?? '?';
  const run = (f: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => {
    const r = await f(); setMsg(r.ok ? (ok ? { ok: true, text: ok } : null) : { ok: false, text: r.error ?? 'Something went wrong.' }); if (r.ok) router.refresh();
  });
  // Keep the room fresh while the draft is live.
  useEffect(() => { if (state.phase !== 'drafting') return; const t = setInterval(() => router.refresh(), 5000); return () => clearInterval(t); }, [state.phase, router]);

  const clock = onTheClock(picks, selections);
  const mineOnClock = clock && (clock.owner_team_id === myTeamId || isCommish) && state.phase === 'drafting';
  const taken = new Set(selections.map((s) => s.player_id));
  const myDrops = drops.filter((d) => d.team_id === myTeamId).map((d) => d.player_id);
  const order = state.order_team_ids.length ? state.order_team_ids : ladderOrder;
  const [draftOrder, setDraftOrder] = useState<number[]>(order);
  const selByPick = new Map(selections.map((s) => [s.pick_id, s]));
  const phaseIdx = PHASES.findIndex((p) => p.key === state.phase);
  const shown = useMemo(() => pool.filter((p) => !taken.has(p.id) && (pos === 'ALL' || p.pos.includes(pos)) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 80), [pool, taken, pos, q]);
  const myPicks = picks.filter((p) => p.owner_team_id === myTeamId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {!data.ready && <div className="card msd-note">The mid-season draft switches on once <code>supabase/migrations/0020_matchday_comps_msd_values.sql</code> has been run in Supabase.</div>}

      <ol className="msd-steps">
        {PHASES.map((p, i) => (
          <li key={p.key} className={i < phaseIdx ? 'past' : i === phaseIdx ? 'now' : ''}>
            <span className="msd-step-n">{i + 1}</span>
            <div><b>{p.label}</b><span className="muted">{p.text}</span></div>
          </li>
        ))}
      </ol>

      {msg && <div className={`msd-msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</div>}

      {state.phase === 'drafting' && clock && (
        <div className={`msd-clock ${clock.owner_team_id === myTeamId ? 'me' : ''}`}>
          <span className="eyebrow" style={{ color: 'inherit', opacity: .8 }}>On the clock · pick {clock.overall} · round {clock.round}</span>
          <b>{clock.owner_team_id === myTeamId ? 'You’re up' : name(clock.owner_team_id)}</b>
          {clock.original_team_id !== clock.owner_team_id && <span>via {name(clock.original_team_id)}</span>}
        </div>
      )}

      <div className="msd-grid">
        <section className="card msd-board">
          <div className="row-between"><h2 className="h2">The board</h2><span className="muted" style={{ fontSize: 12.5 }}>{picks.length ? `${picks.length} picks · ${selections.length} made` : 'No MSD picks yet'}</span></div>
          {usingLastSeason && !state.order_team_ids.length && <span className="muted" style={{ fontSize: 12.5 }}>Order shown off the 2026 ladder until the 2027 ladder after round 10 is loaded.</span>}
          <div className="msd-rounds">
            {Array.from({ length: MSD_ROUNDS }, (_, r) => {
              const inRound = picks.filter((p) => p.round === r + 1).sort((a, b) => (a.overall ?? 999) - (b.overall ?? 999) || order.indexOf(a.original_team_id) - order.indexOf(b.original_team_id));
              return (
                <div key={r} className="msd-round">
                  <span className="eyebrow">Round {r + 1}</span>
                  {inRound.map((p) => {
                    const s = selByPick.get(p.id);
                    const now = clock?.id === p.id && state.phase === 'drafting';
                    return (
                      <div key={p.id} className={`msd-pick ${p.owner_team_id === myTeamId ? 'mine' : ''} ${now ? 'now' : ''} ${s ? 'made' : ''}`}>
                        <span className="msd-no mono">{p.overall ?? '–'}</span>
                        <span className="msd-who"><b>{short(p.owner_team_id)}</b>{p.original_team_id !== p.owner_team_id && <small> via {short(p.original_team_id)}</small>}{p.is_optional && <small className="msd-bonus">bonus</small>}</span>
                        <span className="msd-sel">{s ? s.player_name : now ? 'On the clock' : ''}</span>
                      </div>
                    );
                  })}
                  {!inRound.length && <span className="muted" style={{ fontSize: 12.5 }}>—</span>}
                </div>
              );
            })}
          </div>
          {myPicks.length > 0 && <span className="muted" style={{ fontSize: 12.5 }}>You hold {myPicks.length}: {myPicks.map((p) => `R${p.round}${p.overall ? ` #${p.overall}` : ''}`).join(', ')}. Trade them on the Trademarket.</span>}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {state.phase === 'drafting' || state.phase === 'done' ? (
            <section className="card msd-pool">
              <div className="row-between"><h2 className="h2">The pool</h2><span className="muted" style={{ fontSize: 12.5 }}>Free agents + this draft’s drops · 2027 projection</span></div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input className="input" placeholder="Search players" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: '1 1 160px' }} />
                <div className="msd-seg">{['ALL', 'DEF', 'MID', 'RUC', 'FWD'].map((x) => <button key={x} className={pos === x ? 'on' : ''} onClick={() => setPos(x)}>{x}</button>)}</div>
              </div>
              <div className="msd-list">
                {shown.map((p) => {
                  const ownDrop = p.from != null && clock && p.from === clock.owner_team_id;
                  return (
                    <div key={p.id} className="msd-prow">
                      <span className="msd-pn"><b>{p.name}</b><span className="muted">{p.pos}{p.club ? ` · ${p.club}` : ''}{p.from != null ? ` · dropped by ${short(p.from)}` : ''}</span></span>
                      <span className="mono">{p.proj}</span>
                      {mineOnClock && state.phase === 'drafting'
                        ? <button className="btn dark" disabled={pending || !!ownDrop} title={ownDrop ? 'Can’t pick back your own drop' : undefined} onClick={() => run(() => makeMsdPick(p.id, p.name), `${p.name} picked.`)}>Draft</button>
                        : <span />}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="card msd-drops">
              <div className="row-between"><h2 className="h2">Your drops</h2><span className={myDrops.length === MSD_DROPS ? 'msd-ok' : 'muted'} style={{ fontSize: 13 }}>{myDrops.length}/{MSD_DROPS} chosen</span></div>
              <span className="muted" style={{ fontSize: 12.5 }}>{state.phase === 'drops' ? 'Tick three. Lowest projections are at the top.' : 'Drops open once the ladder freezes after round 10. You can plan here now.'}</span>
              <div className="msd-list">
                {mine.map((p) => {
                  const on = myDrops.includes(p.id);
                  return (
                    <label key={p.id} className={`msd-prow drop ${on ? 'on' : ''}`}>
                      <input type="checkbox" checked={on} disabled={pending || state.phase !== 'drops' || (!on && myDrops.length >= MSD_DROPS)} onChange={() => run(() => toggleDrop(p.id))} />
                      <span className="msd-pn"><b>{p.name}{p.keeper && <span className="keeper-tag">K</span>}</b><span className="muted">{p.pos}{p.club ? ` · ${p.club}` : ''}{p.avg != null ? ` · ${Math.round(p.avg)} avg` : ''}</span></span>
                      <span className="mono">{p.proj}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {state.phase !== 'setup' && (
            <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h2 className="h2">Dropped so far</h2>
              {teams.map((t) => { const ds = drops.filter((d) => d.team_id === t.id); return (
                <div key={t.id} className="msd-dropline"><b>{t.short}</b><span className="muted">{ds.length ? ds.map((d) => pool.find((p) => p.id === d.player_id)?.name ?? mine.find((p) => p.id === d.player_id)?.name ?? 'Hidden').join(', ') : 'None yet'}</span><span className="mono">{ds.length}/{MSD_DROPS}</span></div>
              ); })}
            </section>
          )}
        </div>
      </div>

      {isCommish && (
        <section className="card msd-commish">
          <h2 className="h2">Commish</h2>
          <div className="msd-cm-row">
            <button className="btn" disabled={pending || !data.ready} onClick={() => run(() => createMsdPicks(), 'MSD picks created.')}>Give every club its 3 MSD picks</button>
            <span className="muted" style={{ fontSize: 12.5 }}>Safe to press again: it only adds missing picks.</span>
          </div>
          <div className="msd-cm-order">
            <span className="eyebrow">Draft order · pick 1 first (last on the ladder) · straight order every round</span>
            <ol>
              {draftOrder.map((t, i) => (
                <li key={t}>
                  <span className="mono muted">{i + 1}</span><b>{name(t)}</b>
                  <button className="btn" aria-label="Move up" disabled={i === 0} onClick={() => setDraftOrder(Object.assign([...draftOrder], { [i - 1]: t, [i]: draftOrder[i - 1] }))}>↑</button>
                  <button className="btn" aria-label="Move down" disabled={i === draftOrder.length - 1} onClick={() => setDraftOrder(Object.assign([...draftOrder], { [i + 1]: t, [i]: draftOrder[i + 1] }))}>↓</button>
                </li>
              ))}
            </ol>
            <div className="msd-cm-row">
              <button className="btn" onClick={() => setDraftOrder(ladderOrder)}>Reset to the ladder</button>
              <button className="btn dark" disabled={pending || !data.ready} onClick={() => run(() => saveMsdOrder(draftOrder), 'Order saved and picks numbered.')}>Save order + number the picks</button>
            </div>
            <span className="muted" style={{ fontSize: 12.5 }}>“Move up the MSD order” prizes won in side comps are applied when you save.</span>
          </div>
          <div className="msd-cm-row">
            {PHASES.map((p) => <button key={p.key} className={`btn ${state.phase === p.key ? 'dark' : ''}`} disabled={pending || !data.ready} onClick={() => run(() => setMsdPhase(p.key))}>{p.label}</button>)}
            <button className="btn" disabled={pending || !selections.length} onClick={() => run(() => undoMsdPick(), 'Last pick undone.')}>Undo last pick</button>
            <button className="btn green" disabled={pending || !selections.some((s) => !s.applied)} onClick={() => { if (confirm('Apply the draft to every list? Drops leave their clubs and picks join them.')) run(() => applyMsd(), 'Lists updated.'); }}>Apply to lists</button>
          </div>
        </section>
      )}
    </div>
  );
}
