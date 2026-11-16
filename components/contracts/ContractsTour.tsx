'use client';
// A short click-through for a coach's first visit to their contracts page. It spotlights each part of the page in turn
// (sections carry data-tour="…"), then remembers it's been seen. "How contracts work" replays it any time.
import { useCallback, useEffect, useMemo, useState } from 'react';

type Step = { target?: string; title: string; body: React.ReactNode };

const KEY = 'khq-tour-contracts-v1';

const Tag = ({ c, children }: { c: string; children: React.ReactNode }) => <span className={`kc-tag ${c}`} style={{ marginRight: 6 }}>{children}</span>;

function steps(setup: boolean, keeperCap: number, softCap: number, deadline: string): Step[] {
  return [
    {
      title: 'Welcome to your contracts',
      body: <>This is where you build your list for the season: who you keep, what you pay them, and how hard they are to poach. It takes a minute to learn. Tap <b>Next</b>.</>,
    },
    ...(setup ? [{
      target: 'setup',
      title: 'Re-sign your list',
      body: <>First off-season: <b>every player starts unsigned</b>. The players you sign become your <b>17 + 1 keepers</b>; anyone unsigned expires on deadline day. This card tracks how many you’ve signed and your room under the <b>${keeperCap}k keeper cap</b>. Everything is provisional until <b>{deadline}</b> (deadline day), so experiment freely.</>,
    }] : []),
    {
      target: 'unsigned',
      title: 'Your unsigned players',
      body: <>Players without a contract are listed here, shaded light red. <b>Tap any player</b> to open his row and offer him a contract. Each row shows his market value, trend and age.</>,
    },
    {
      target: 'unsigned',
      title: 'Offering a contract',
      body: (
        <>
          <p style={{ margin: '0 0 6px' }}>Pick a <b>length</b> (1 to 5 years) and a <b>release clause</b>, then swipe to sign.</p>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
            <li><b>Length:</b> short deals cost more (1 yr +6%), long deals less (5 yrs −6.7%). 3 years is market value.</li>
            <li><b>Home-grown:</b> your own players get 20% off.</li>
          </ul>
        </>
      ),
    },
    {
      title: 'Release clauses',
      body: (
        <>
          <p style={{ margin: '0 0 6px' }}>A clause is the KT price another coach can pay to take your player straight away.</p>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
            <li><b>Standard:</b> cheapest salary, lowest clause. Easiest to poach.</li>
            <li><b>High:</b> +10% salary, clause doubles.</li>
            <li><b>No clause</b> <span aria-hidden="true">🔒</span>: +25% salary, nobody can buy him.</li>
          </ul>
          <p style={{ margin: '6px 0 0' }}>Rising young players on cheap clauses are the ones rivals will target.</p>
        </>
      ),
    },
    {
      target: 'contracts',
      title: 'Under contract',
      body: <>Signed players move up here. Tap one to see his deal. Until deadline day you can <b>Undo</b> a signing for free or <b>Lock</b> it in. After that you can <b>extend</b> him (priced off his market value then) or <b>release</b> him (you keep paying dead money).</>,
    },
    {
      title: 'What the tags mean',
      body: (
        <div style={{ display: 'grid', gap: 7 }}>
          <span><Tag c="exp">Unsigned</Tag>no contract yet: sign him or he walks at season end</span>
          <span><Tag c="exp">Provisional</Tag>signed, but you can still undo it before deadline day</span>
          <span><Tag c="std">3 yrs left</Tag>under contract</span>
          <span><Tag c="exp">Final year</Tag>re-sign before the mid-season window closes or he becomes a free agent</span>
          <span><Tag c="high">Extended</Tag>a new deal starts next season</span>
          <span><Tag c="rook">Draft deal</Tag>a draftee: protected, no clause until mid-season</span>
          <span><Tag c="high">Home-grown</Tag>your own player, 20% cheaper to re-sign</span>
          <span><Tag c="exp">Pending FA</Tag>other clubs are making offers for him</span>
        </div>
      ),
    },
    {
      target: 'rookie',
      title: 'Your rookie slot',
      body: <>Keep one young player (10 or fewer games) as your 18th keeper, <b>off the cap</b>. Pick him here before player drop day.</>,
    },
    {
      title: 'The caps',
      body: <>Your keepers must fit under the <b>${keeperCap}k keeper cap</b> by deadline day. During the season you can go up to <b>${softCap}k over</b> it (the soft cap), mostly used up by draftees. Your <b>Finances</b> tab has a cap simulator to test signings, releases and trades first.</>,
    },
    {
      title: 'You’re set',
      body: <>Start by tapping your best player in the unsigned list. You can replay this any time with <b>How contracts work</b> at the top of the page.</>,
    },
  ];
}

export function ContractsTour({ setup, keeperCap, softCap, deadline }: { setup: boolean; keeperCap: number; softCap: number; deadline: string }) {
  const list = useMemo(() => steps(setup, keeperCap, softCap, deadline), [setup, keeperCap, softCap, deadline]);
  const [i, setI] = useState<number | null>(null);
  useEffect(() => { try { if (!localStorage.getItem(KEY)) setI(0); } catch { /* storage blocked: skip the auto tour */ } }, []);

  const close = useCallback(() => { setI(null); try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } }, []);

  // Spotlight the current step's section and bring it into view.
  useEffect(() => {
    document.querySelectorAll('.tour-hl').forEach((el) => el.classList.remove('tour-hl'));
    if (i == null) return;
    const t = list[i]?.target;
    const el = t ? document.querySelector<HTMLElement>(`[data-tour="${t}"]`) : null;
    if (el) { el.classList.add('tour-hl'); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [i, list]);
  useEffect(() => () => { document.querySelectorAll('.tour-hl').forEach((el) => el.classList.remove('tour-hl')); }, []);
  useEffect(() => {
    if (i == null) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') setI((n) => (n == null ? n : Math.min(list.length - 1, n + 1))); if (e.key === 'ArrowLeft') setI((n) => (n == null ? n : Math.max(0, n - 1))); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [i, close, list.length]);

  const step = i != null ? list[i] : null;
  const spot = !!step?.target && typeof document !== 'undefined' && !!document.querySelector(`[data-tour="${step.target}"]`);
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="kc-btn small" onClick={() => setI(0)}>How contracts work</button>
      </div>
      {step && (
        <>
          {!spot && <div className="tour-dim" onClick={close} aria-hidden="true" />}
          <div className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-t">
            <div className="tour-top"><span>{i! + 1} of {list.length}</span><button type="button" className="tour-x" onClick={close} aria-label="Close the tour">Skip</button></div>
            <h3 id="tour-t">{step.title}</h3>
            <div className="tour-body">{step.body}</div>
            <div className="tour-foot">
              <div className="tour-dots" aria-hidden="true">{list.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {i! > 0 && <button type="button" className="kc-btn small" onClick={() => setI(i! - 1)}>Back</button>}
                {i! < list.length - 1
                  ? <button type="button" className="kc-btn small sage" onClick={() => setI(i! + 1)}>Next</button>
                  : <button type="button" className="kc-btn small sage" onClick={close}>Got it</button>}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
