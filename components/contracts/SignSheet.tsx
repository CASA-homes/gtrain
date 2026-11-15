'use client';
// Final approval for a signing or extension: the terms, then swipe the button across to sign. On success, a short
// celebration with the player's name and his contract numbers.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Result } from '@/app/(app)/contracts/actions';

export function SignSheet({ title, name, terms, headline, confirm, onClose, verb = 'sign' }: {
  title: string; name: string; terms: [string, string][]; headline: string;
  confirm: () => Promise<Result>; onClose: () => void; verb?: string;
}) {
  const router = useRouter();
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState<{ start: number; max: number } | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'err'>('idle');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && state !== 'busy') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, state]);

  const fire = async () => {
    setState('busy');
    const r = await confirm();
    if (r.ok) { setState('done'); setMsg(r.message); router.refresh(); }
    else { setState('err'); setMsg(r.message); setX(0); }
  };
  const down = (e: React.PointerEvent) => {
    if (state === 'busy' || state === 'done') return;
    const w = track.current!.clientWidth - 56;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ start: e.clientX - x, max: w });
  };
  const move = (e: React.PointerEvent) => { if (drag) setX(Math.max(0, Math.min(drag.max, e.clientX - drag.start))); };
  const up = () => {
    if (!drag) return;
    const done = x >= drag.max * 0.9;
    setDrag(null);
    if (done) { setX(drag.max); fire(); } else setX(0);
  };
  const pct = drag ? x / drag.max : x > 0 ? 1 : 0;

  return (
    <div className="sgn-back" role="dialog" aria-modal="true" aria-labelledby="sgn-h" onClick={(e) => { if (e.target === e.currentTarget && state !== 'busy') onClose(); }}>
      <div className={`sgn-card${state === 'done' ? ' done' : ''}`}>
        {state === 'done' ? (
          <div className="sgn-win" role="status">
            <div className="sgn-spark" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ['--a' as string]: `${i * 26}deg`, ['--d' as string]: `${(i % 4) * 60}ms` }} />)}</div>
            <span className="sgn-tick" aria-hidden="true">✓</span>
            <span className="sgn-eyebrow">Signed</span>
            <b className="sgn-name">{name}</b>
            <span className="sgn-line">{headline}</span>
            <p className="kc-sub" style={{ margin: 0 }}>{msg}</p>
            <button type="button" className="kc-btn dark" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div className="sgn-top">
              <div><span className="sgn-eyebrow">Final approval</span><h3 id="sgn-h">{title}</h3></div>
              <button type="button" className="cd-x" onClick={onClose} aria-label="Close" disabled={state === 'busy'}>×</button>
            </div>
            <dl className="sgn-terms">{terms.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            <p className="kc-sub" style={{ margin: 0 }}>By signing you agree to these terms. Salary counts to your cap every season of the deal; releasing him later leaves dead money.</p>
            {state === 'err' && <p className="kc-msg err" role="alert">{msg}</p>}
            <div ref={track} className={`sgn-track${state === 'busy' ? ' busy' : ''}`}>
              <span className="sgn-fill" style={{ width: `${x + 56}px`, transition: drag ? 'none' : 'width .25s' }} />
              <span className="sgn-label" style={{ opacity: 1 - pct * 1.2 }}>{state === 'busy' ? 'Signing…' : `Swipe to ${verb} →`}</span>
              <button type="button" className="sgn-knob" style={{ transform: `translateX(${x}px)`, transition: drag ? 'none' : 'transform .25s' }}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                onKeyDown={(e) => { if (e.key === 'Enter' && state !== 'busy') fire(); }}
                aria-label={`Swipe or press Enter to ${verb} ${name}`}>
                {state === 'busy' ? '…' : '✍'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
