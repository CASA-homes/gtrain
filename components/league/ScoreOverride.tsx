'use client';
// Commish score override screen (mockup signed off 12 Nov 2026). The commish fixes or fills in player scores; coaches
// see the same screen read-only, including the change log.
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LGame, LogRow, LPlayer, LRound, OverrideRow } from '@/lib/scores';
import { lockRound, saveOverrides, setPaused, unlockRound, type OverrideChange } from '@/app/(app)/league/scores/actions';

type Draft = Record<number, { score: string; reason: string }>;
type Filter = 'all' | 'over' | 'miss';
const PERTH = 'Australia/Perth';
const when = (iso: string) => new Date(iso).toLocaleString('en-AU', { timeZone: PERTH, weekday: 'short', hour: 'numeric', minute: '2-digit' });
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const started = (g?: LGame) => !!g && g.status !== 'scheduled';
function gameState(g: LGame) {
  if (g.status === 'completed') return { label: 'Final', live: false };
  if (g.status === 'scheduled') return { label: new Date(g.date).toLocaleString('en-AU', { timeZone: PERTH, weekday: 'short', hour: 'numeric', minute: '2-digit' }), live: false };
  const m = Math.floor((g.periodSeconds ?? 0) / 60), sec = String((g.periodSeconds ?? 0) % 60).padStart(2, '0');
  return { label: g.period ? `Q${g.period} · ${m}:${sec}` : 'Live', live: true };
}

const C = { ink: '#151a16', dim: '#5d665f', line: '#dbe3d6', soft: '#eef1eb', sunk: '#f7f8f5', sage: '#2f5d46', brass: '#80622a', brassLine: '#c09a4b' };
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16 };
const btn = (kind: 'go' | 'dark' | 'alt' | 'line'): React.CSSProperties => ({
  minHeight: 44, padding: '0 18px', borderRadius: 99, font: '600 13.5px var(--font)', cursor: 'pointer', whiteSpace: 'nowrap',
  border: kind === 'line' ? `1px solid ${C.line}` : 0,
  background: kind === 'go' ? C.sage : kind === 'dark' ? C.ink : kind === 'alt' ? '#e7ede3' : '#fff',
  color: kind === 'go' || kind === 'dark' ? '#fff' : kind === 'alt' ? '#234836' : C.ink,
});

export function ScoreOverride({ comp, round, feedError, state, overrides, log, ready, isCommish }: {
  comp: string; round: LRound | null; feedError: string | null; state: { paused: boolean; lockedAt: string | null } | null;
  overrides: OverrideRow[]; log: LogRow[]; ready: boolean; isCommish: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [paste, setPaste] = useState('');
  const [unmatched, setUnmatched] = useState<string[]>([]);

  const locked = !!state?.lockedAt;
  const paused = !!state?.paused && !locked;
  const canEdit = isCommish && ready && !locked;
  const reasons = useMemo(() => new Map(overrides.map((o) => [o.player_id, o.reason ?? ''])), [overrides]);
  const gameBySquad = useMemo(() => { const m = new Map<number, LGame>(); for (const g of round?.games ?? []) { m.set(g.homeId, g); m.set(g.awayId, g); } return m; }, [round]);
  const playerById = useMemo(() => new Map((round?.players ?? []).map((p) => [p.id, p])), [round]);

  const run = (f: () => Promise<{ ok: boolean; error?: string }>, okText: string, after?: () => void) => start(async () => {
    setMsg(null);
    const r = await f();
    if (!r.ok) { setMsg({ ok: false, text: r.error ?? 'Something went wrong.' }); return; }
    after?.(); setMsg({ ok: true, text: okText }); router.refresh();
  });

  // ---------- feed status ----------
  const anyLive = (round?.games ?? []).some((g) => started(g) && g.status !== 'completed');
  const status = feedError || !round
    ? { tone: 'down', title: 'Feed is down', sub: `AFL Fantasy isn't answering${feedError ? ` (${feedError})` : ''}. Scores can't load until it's back. Try again in a minute.` }
    : locked ? { tone: 'locked', title: `${round.name} is locked`, sub: `Scores were frozen ${when(state!.lockedAt!)}. Late feed changes won't move any result.` }
    : paused ? { tone: 'paused', title: 'Feed paused: manual scores only', sub: `The site ignores the feed for ${round.name} until you turn it back on. Enter or paste scores below.` }
    : round.feedOk === false && anyLive ? { tone: 'quiet', title: 'Live scores have stopped coming through', sub: 'The fixture loads, but the live scores file isn’t answering while games are on. Scores may be behind.' }
    : { tone: 'live', title: anyLive ? 'Feed is live' : 'Feed is working', sub: `${comp} scores from AFL Fantasy, checked ${when(round.fetchedAt)}. Overrides always win over the feed.` };
  const TONE: Record<string, { bg: string; line: string; dot: string; ink: string }> = {
    live: { bg: '#ecf4ee', line: '#cfe3d4', dot: '#1d8a3c', ink: '#155c2a' }, quiet: { bg: '#fbf4e4', line: '#ecdcb4', dot: '#c08a1f', ink: '#6e4f12' },
    down: { bg: '#fbeae6', line: '#f0c9c0', dot: '#c8401f', ink: '#7a1d12' }, paused: { bg: C.soft, line: C.line, dot: C.dim, ink: C.ink }, locked: { bg: C.soft, line: C.line, dot: C.sage, ink: '#234836' },
  };
  const tone = TONE[status.tone];

  // ---------- rows ----------
  const isMissing = (p: LPlayer) => started(gameBySquad.get(p.squadId)) && (p.manual ? p.feed : p.score) == null;
  const rowsFor = (g: LGame) => (round?.players ?? [])
    .filter((p) => p.squadId === g.homeId || p.squadId === g.awayId)
    .filter((p) => !q || norm(p.name).includes(norm(q)))
    .filter((p) => filter === 'all' || (filter === 'over' && (p.manual || draft[p.id]?.score)) || (filter === 'miss' && isMissing(p)))
    .sort((a, b) => ((b.manual ? b.feed : b.score) ?? -1) - ((a.manual ? a.feed : a.score) ?? -1) || a.name.localeCompare(b.name));
  const games = (round?.games ?? []).map((g) => ({ g, rows: rowsFor(g) })).filter((x) => x.rows.length);

  // ---------- changes ----------
  const changes: OverrideChange[] = Object.entries(draft).flatMap(([k, d]) => {
    const p = playerById.get(Number(k)); if (!p) return [];
    const feed = p.manual ? (p.feed ?? null) : p.score;
    const cur = p.manual ? String(p.score ?? '') : '';
    const next = d.score.trim();
    if (next === cur && (d.reason ?? '') === (reasons.get(p.id) ?? '')) return [];
    if (next === '' && !p.manual) return [];
    const n = next === '' ? null : Number(next);
    if (n != null && !Number.isFinite(n)) return [];
    return [{ player_id: p.id, player_name: p.name, score: n, feed_score: feed, reason: d.reason ?? '' }];
  });
  const setScore = (p: LPlayer, score: string) => setDraft((d) => ({ ...d, [p.id]: { score, reason: d[p.id]?.reason ?? reasons.get(p.id) ?? '' } }));
  const setReason = (p: LPlayer, reason: string) => setDraft((d) => ({ ...d, [p.id]: { score: d[p.id]?.score ?? (p.manual ? String(p.score ?? '') : ''), reason } }));

  const doPaste = () => {
    const players = round?.players ?? [];
    const byFull = new Map(players.map((p) => [norm(p.name), p]));
    const miss: string[] = []; const add: Draft = {};
    for (const raw of paste.split('\n')) {
      const line = raw.trim(); if (!line) continue;
      const m = line.match(/^(.*?)[\s,:\t-]+(-?\d{1,3})\s*$/);
      if (!m) { miss.push(line); continue; }
      const name = norm(m[1]);
      let p = byFull.get(name);
      if (!p) { const last = players.filter((x) => norm(x.name).endsWith(' ' + name.split(' ').pop()) && (name.split(' ').length === 1 || norm(x.name).startsWith(name[0]))); if (last.length === 1) p = last[0]; }
      if (!p) { miss.push(line); continue; }
      add[p.id] = { score: m[2], reason: draft[p.id]?.reason || reasons.get(p.id) || 'Pasted while the feed was down' };
    }
    setDraft((d) => ({ ...d, ...add }));
    setUnmatched(miss);
    setFilter('over');
    setMsg({ ok: true, text: `Matched ${Object.keys(add).length} player${Object.keys(add).length === 1 ? '' : 's'}. Check them below, then save.` });
  };

  const finished = (round?.games ?? []).filter((g) => g.status === 'completed').length, total = round?.games.length ?? 0;

  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFeatureSettings: "'tnum'", paddingBottom: 48 }}>
      {/* heading */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Link href="/league" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: C.dim, textDecoration: 'none' }}>← The League · Commish tools</Link>
          <h1 style={{ margin: 0, font: '600 40px/1.05 var(--font)', letterSpacing: '-.035em' }}>Score override</h1>
          <p style={{ margin: 0, fontSize: 15, color: C.dim, maxWidth: 640 }}>Fix or fill in a player&rsquo;s score when the feed is wrong or down. An override counts everywhere live scores are used.</p>
        </div>
        {round && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: C.dim }}>Round
            <select value={round.round} onChange={(e) => router.push(`/league/scores?round=${e.target.value}`)} style={{ minHeight: 40, borderRadius: 99, border: `1px solid ${C.line}`, background: '#fff', padding: '0 14px', font: '500 14px var(--font)', color: C.ink }}>
              {round.rounds.map((r) => <option key={r.n} value={r.n}>{r.name} · {r.status === 'completed' ? 'final' : r.status === 'scheduled' ? 'upcoming' : 'live'}</option>)}
            </select>
          </label>
        )}
      </div>

      {!ready && <div role="alert" style={{ ...card, padding: 16, background: '#fbf4e4', borderColor: '#ecdcb4' }}>The override tables aren&rsquo;t set up yet: run <code>supabase/migrations/0029_score_overrides.sql</code> in Supabase.</div>}
      {!isCommish && <div style={{ ...card, padding: '12px 16px', fontSize: 14, color: C.dim }}>Only the commish can change scores. You can see every override and why it was made.</div>}

      {/* feed status */}
      <section aria-label="Feed status" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '16px 20px', borderRadius: 16, background: tone.bg, border: `1px solid ${tone.line}` }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: tone.dot, flex: 'none' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 320px', minWidth: 0 }}>
          <b style={{ fontSize: 15, color: tone.ink }}>{status.title}</b>
          <span style={{ fontSize: 13.5, color: '#3c4740' }}>{status.sub}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={btn('line')} onClick={() => router.refresh()} disabled={pending}>Check feed now</button>
          {isCommish && ready && round && !locked && (
            <button type="button" style={btn(paused ? 'go' : 'dark')} disabled={pending}
              onClick={() => run(() => setPaused(round.round, !paused), paused ? 'Feed back on.' : 'Feed paused for this round.')}>{paused ? 'Turn feed back on' : 'Pause feed'}</button>
          )}
        </div>
      </section>

      {msg && <div role="status" style={{ ...card, padding: '12px 16px', fontSize: 14, borderColor: msg.ok ? '#cfe3d4' : '#f0c9c0', background: msg.ok ? '#ecf4ee' : '#fbeae6', color: msg.ok ? '#155c2a' : '#7a1d12' }}>{msg.text}</div>}

      {round && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
          {/* scores */}
          <section aria-label="Player scores" style={{ ...card, flex: '999 1 640px', minWidth: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '16px 18px', borderBottom: '1px solid #e7ede3' }}>
              <input type="search" aria-label="Find a player" placeholder="Find a player" value={q} onChange={(e) => setQ(e.target.value)}
                style={{ flex: '1 1 220px', minHeight: 44, borderRadius: 12, border: `1px solid ${C.line}`, background: C.sunk, padding: '0 14px', font: '500 14px var(--font)', color: C.ink }} />
              <div role="group" aria-label="Show" style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 99, background: C.soft }}>
                {([['all', 'All'], ['over', 'Overridden'], ['miss', 'Missing']] as [Filter, string][]).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
                    style={{ minHeight: 38, padding: '0 14px', borderRadius: 99, border: 0, font: '600 13px var(--font)', cursor: 'pointer', background: filter === k ? '#fff' : 'transparent', color: filter === k ? C.ink : C.dim }}>{label}</button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: C.dim, fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                    <th scope="col" style={{ padding: '12px 18px', fontWeight: 600 }}>Player</th>
                    <th scope="col" style={{ padding: '12px 8px', fontWeight: 600, textAlign: 'right' }}>Feed</th>
                    <th scope="col" style={{ padding: '12px 8px', fontWeight: 600 }}>Override</th>
                    <th scope="col" style={{ padding: '12px 8px', fontWeight: 600, textAlign: 'right' }}>Counts</th>
                    <th scope="col" style={{ padding: '12px 18px', fontWeight: 600 }}>Reason</th>
                  </tr>
                </thead>
                {games.length === 0 && <tbody><tr><td colSpan={5} style={{ padding: 24, color: C.dim }}>{filter === 'over' ? 'No overrides this round.' : filter === 'miss' ? 'No missing scores.' : 'No players match.'}</td></tr></tbody>}
                {games.map(({ g, rows }) => {
                  const gs = gameState(g);
                  return (
                    <tbody key={g.id}>
                      <tr>
                        <th colSpan={5} scope="colgroup" style={{ textAlign: 'left', padding: '14px 18px 8px', background: C.sunk, borderTop: '1px solid #e7ede3' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{g.home} v {g.away}</span>
                          <span style={{ fontSize: 12.5, fontWeight: 500, color: gs.live ? '#155c2a' : C.dim, marginLeft: 10 }}>{gs.label}</span>
                        </th>
                      </tr>
                      {rows.map((p) => {
                        const feed = p.manual ? (p.feed ?? null) : p.score;
                        const d = draft[p.id];
                        const ov = d ? d.score : p.manual ? String(p.score ?? '') : '';
                        const manual = ov.trim() !== '';
                        const counts = manual ? ov : feed ?? '—';
                        const missing = isMissing(p);
                        const reason = d?.reason ?? reasons.get(p.id) ?? '';
                        return (
                          <tr key={p.id} style={{ borderTop: `1px solid ${C.soft}`, background: manual ? '#fdf9ef' : missing ? '#fdf3f1' : '#fff' }}>
                            <td style={{ padding: '10px 18px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <b style={{ fontWeight: 600 }}>{p.name}</b>
                                <span style={{ fontSize: 12.5, color: C.dim }}>{p.squad} · {p.pos.join('/')}</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: feed == null && started(gameBySquad.get(p.squadId)) ? '#c8401f' : C.dim }}>{feed ?? '—'}</td>
                            <td style={{ padding: '10px 8px' }}>
                              <input type="number" inputMode="numeric" aria-label={`Override score for ${p.name}`} placeholder="–" value={ov} disabled={!canEdit}
                                onChange={(e) => setScore(p, e.target.value)}
                                style={{ width: 76, minHeight: 40, borderRadius: 10, border: `1px solid ${manual ? C.brassLine : C.line}`, background: manual ? '#fff' : C.sunk, padding: '0 10px', font: '600 14px var(--mono)', color: C.ink, textAlign: 'right' }} />
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15 }}>{counts}</span>
                              {manual && <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.brass, letterSpacing: '.04em' }}>MANUAL</span>}
                            </td>
                            <td style={{ padding: '10px 18px', fontSize: 13, color: '#3c4740' }}>
                              {manual && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {canEdit
                                    ? <input aria-label={`Reason for ${p.name}`} placeholder="Why? e.g. stat correction" value={reason} maxLength={120} onChange={(e) => setReason(p, e.target.value)}
                                        style={{ flex: 1, minWidth: 120, minHeight: 36, borderRadius: 10, border: `1px solid ${C.line}`, background: C.sunk, padding: '0 10px', font: '500 13px var(--font)', color: C.ink }} />
                                    : <span style={{ flex: 1 }}>{reason}</span>}
                                  {canEdit && <button type="button" onClick={() => setScore(p, '')} style={{ minHeight: 34, padding: '0 12px', borderRadius: 99, border: `1px solid ${C.line}`, background: '#fff', font: '600 12px var(--font)', color: C.dim, cursor: 'pointer', whiteSpace: 'nowrap' }}>Use feed</button>}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>
            </div>

            {canEdit && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 18px', borderTop: '1px solid #e7ede3', background: C.sunk }}>
                <span style={{ fontSize: 13, color: C.dim }}>{changes.length ? `${changes.length} change${changes.length === 1 ? '' : 's'} not saved. Everyone sees them as soon as you save.` : 'No unsaved changes.'}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {changes.length > 0 && <button type="button" style={btn('line')} disabled={pending} onClick={() => { setDraft({}); setUnmatched([]); }}>Discard</button>}
                  <button type="button" style={{ ...btn('go'), opacity: changes.length ? 1 : 0.5 }} disabled={pending || !changes.length}
                    onClick={() => run(() => saveOverrides(round.round, changes), 'Overrides saved.', () => { setDraft({}); setUnmatched([]); })}>{pending ? 'Saving…' : 'Save overrides'}</button>
                </div>
              </div>
            )}
          </section>

          {/* side panel */}
          <aside style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <section style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Lock the round</h2>
              <p style={{ margin: 0, fontSize: 13.5, color: '#3c4740', lineHeight: 1.5 }}>Freezes every score once the last game is over, so a late stats correction can&rsquo;t flip a result after the fact.</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.dim }}><span>Games finished</span><b style={{ color: C.ink, fontFamily: 'var(--mono)' }}>{finished} / {total}</b></div>
              <div aria-hidden style={{ height: 6, borderRadius: 99, background: '#e7ede3', overflow: 'hidden' }}><div style={{ width: `${total ? (finished / total) * 100 : 0}%`, height: '100%', background: C.sage }} /></div>
              {locked
                ? <>
                    <span style={{ fontSize: 13.5, color: '#234836', fontWeight: 600 }}>Locked {when(state!.lockedAt!)}</span>
                    {isCommish && <button type="button" style={btn('line')} disabled={pending} onClick={() => run(() => unlockRound(round.round), 'Round unlocked.')}>Unlock {round.name}</button>}
                  </>
                : isCommish && (
                    <button type="button" style={{ ...btn(finished === total && total > 0 ? 'go' : 'alt'), opacity: finished === total && total > 0 ? 1 : 0.6 }} disabled={pending || !ready || finished !== total || !total}
                      onClick={() => run(() => lockRound(round.round), `${round.name} locked.`)}>{finished === total && total > 0 ? `Lock ${round.name}` : `Lock ${round.name} (after the last game)`}</button>
                  )}
            </section>

            {canEdit && (
              <section style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Feed down? Paste scores</h2>
                <label htmlFor="paste" style={{ fontSize: 13, color: '#3c4740', lineHeight: 1.5 }}>One player per line: name, score. Copy straight from the AFL Fantasy app or a group chat.</label>
                <textarea id="paste" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Bailey Smith, 112\nNoah Anderson, 98'}
                  style={{ borderRadius: 12, border: `1px solid ${C.line}`, background: C.sunk, padding: '10px 12px', font: '500 13.5px var(--mono)', color: C.ink, resize: 'vertical' }} />
                <button type="button" style={btn('alt')} disabled={!paste.trim()} onClick={doPaste}>Match players and preview</button>
                {unmatched.length > 0 && (
                  <div style={{ fontSize: 13, color: '#7a1d12' }}>Couldn&rsquo;t match {unmatched.length}: {unmatched.slice(0, 6).join(' · ')}{unmatched.length > 6 ? ' …' : ''}</div>
                )}
              </section>
            )}

            <section style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Change log</h2>
              {log.length === 0 && <span style={{ fontSize: 13.5, color: C.dim }}>No changes this round.</span>}
              {log.map((l) => (
                <div key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 0', borderTop: `1px solid ${C.soft}` }}>
                  <b style={{ fontWeight: 600, fontSize: 13.5 }}>{l.what}</b>
                  <span style={{ fontSize: 12.5, color: C.dim }}>{l.who || 'Commish'} · {when(l.at)}</span>
                </div>
              ))}
              <span style={{ fontSize: 12.5, color: C.dim }}>Every coach can see this log, so overrides stay above board.</span>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
