'use client';
// Knockout Cup pick prizes: shown on the Cup page ("Up for grabs") and in League settings. The commish switches them
// on or off, sets the rounds, and awards the picks once the final is in.
import { useState, useTransition } from 'react';
import { awardCupPrizes, setCupPrizes, unawardCupPrizes, type CupPrizeSettings } from '@/app/(app)/live/cup-actions';
import { CUP_SEASON } from '@/lib/cup';

function Toggle({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className={`cpz-tg ${on ? 'on' : ''}`}>
      <i />
    </button>
  );
}

export function CupPrizes({ settings, isCommish, teams, final, variant = 'cup' }: {
  settings: CupPrizeSettings | null; isCommish: boolean; teams: { id: number; name: string }[];
  /** the final's result, once it's in */
  final?: { winner: number; runner: number } | null; variant?: 'cup' | 'settings';
}) {
  const [s, setS] = useState(settings);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const tn = (id: number | null) => teams.find((t) => t.id === id)?.name ?? 'TBC';
  const next = CUP_SEASON + 1;

  if (!s) {
    return isCommish ? <div className={`cpz ${variant}`}><span className="cpz-k">Cup pick prizes</span><span className="cpz-dim">Run supabase/migrations/0025_cup_prizes.sql in Supabase to switch these on.</span></div> : null;
  }
  if (!s.prizes_on && !isCommish && variant === 'cup') return null;

  const save = (patch: Partial<Pick<CupPrizeSettings, 'prizes_on' | 'winner_round' | 'runner_round'>>) => {
    const prev = s;
    setS({ ...s, ...patch }); setMsg(null);
    start(async () => {
      const r = await setCupPrizes(patch);
      if (!r.ok) { setS(prev); setMsg({ ok: false, text: r.error ?? 'Couldn’t save.' }); }
      else setMsg({ ok: true, text: 'Saved.' });
    });
  };
  const awarded = !!s.awarded_at;
  const locked = awarded || pending;

  return (
    <div className={`cpz ${variant} ${s.prizes_on ? '' : 'off'}`}>
      <div className="cpz-h">
        <div>
          <span className="cpz-k">{variant === 'cup' ? 'Up for grabs' : 'Knockout Cup prizes'}</span>
          <b>{s.prizes_on ? `Bonus picks in the ${next} draft` : 'No pick prizes this season'}</b>
        </div>
        {isCommish && <label className="cpz-sw"><span>{s.prizes_on ? 'On' : 'Off'}</span><Toggle on={s.prizes_on} disabled={locked} label="Cup pick prizes" onChange={(v) => save({ prizes_on: v })} /></label>}
      </div>

      {s.prizes_on && (
        <div className="cpz-prizes">
          <div className="cpz-p gold">
            <span className="cpz-medal">🏆</span>
            <div>
              <span className="cpz-k">Winner</span>
              <b>Start of round {s.winner_round}</b>
              <span className="cpz-dim">{awarded ? `Awarded to ${tn(s.winner_team)}` : `First pick of round ${s.winner_round}, ${next} draft`}</span>
            </div>
            {isCommish && !awarded && <select aria-label="Winner's round" value={s.winner_round} disabled={locked} onChange={(e) => save({ winner_round: Number(e.target.value) })}>{Array.from({ length: 16 }, (_, i) => <option key={i} value={i + 1}>Round {i + 1}</option>)}</select>}
          </div>
          <div className="cpz-p silver">
            <span className="cpz-medal">🥈</span>
            <div>
              <span className="cpz-k">Runner-up</span>
              <b>Start of round {s.runner_round}</b>
              <span className="cpz-dim">{awarded ? `Awarded to ${tn(s.runner_team)}` : `First pick of round ${s.runner_round}, ${next} draft`}</span>
            </div>
            {isCommish && !awarded && <select aria-label="Runner-up's round" value={s.runner_round} disabled={locked} onChange={(e) => save({ runner_round: Number(e.target.value) })}>{Array.from({ length: 16 }, (_, i) => <option key={i} value={i + 1}>Round {i + 1}</option>)}</select>}
          </div>
        </div>
      )}

      {s.prizes_on && (
        <span className="cpz-dim">
          {awarded ? `In both clubs’ ${next} picks. They can be traded like any pick and count toward list spots.`
            : `Extra picks: nobody loses one. They go first in their round, can be traded, and count toward list spots.`}
        </span>
      )}

      {isCommish && s.prizes_on && (
        <div className="cpz-acts">
          {!awarded && final && (
            <button className="cpz-btn go" disabled={pending} onClick={() => start(async () => {
              const r = await awardCupPrizes(final.winner, final.runner);
              if (r.ok) { setS({ ...s, awarded_at: new Date().toISOString(), winner_team: final.winner, runner_team: final.runner }); setMsg({ ok: true, text: `Awarded: ${tn(final.winner)} and ${tn(final.runner)} have their Cup picks.` }); }
              else setMsg({ ok: false, text: r.error ?? 'Couldn’t award.' });
            })}>Award the Cup picks to {tn(final.winner)} and {tn(final.runner)}</button>
          )}
          {!awarded && !final && variant === 'cup' && <span className="cpz-dim">Once the final is in, you&apos;ll award the picks here.</span>}
          {awarded && (
            <button className="cpz-btn" disabled={pending} onClick={() => {
              if (!window.confirm('Take the Cup picks back? Both bonus picks are removed from the 2028 draft.')) return;
              start(async () => {
                const r = await unawardCupPrizes();
                if (r.ok) { setS({ ...s, awarded_at: null, winner_team: null, runner_team: null }); setMsg({ ok: true, text: 'Cup picks removed.' }); }
                else setMsg({ ok: false, text: r.error ?? 'Couldn’t undo.' });
              });
            }}>Undo the award</button>
          )}
        </div>
      )}
      {msg && <span className={`cpz-msg ${msg.ok ? 'ok' : ''}`} role="status">{msg.text}</span>}
    </div>
  );
}
