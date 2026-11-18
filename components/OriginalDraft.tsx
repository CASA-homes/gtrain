import { Fragment } from 'react';
import { ORIGINAL_DRAFT, ORIGINAL_DRAFT_TEAMS, ORIGINAL_DRAFT_YEAR } from '@/lib/gtrain-original-draft';

const TEAMS = ORIGINAL_DRAFT_TEAMS.length;

/** G-Train's original draft, pick 1 onwards, in one scrolling panel. */
export function OriginalDraft() {
  const rounds = Math.ceil(ORIGINAL_DRAFT.length / TEAMS);
  return (
    <section id="original-draft" className="card od" aria-labelledby="od-h">
      <div className="od-h">
        <div><span className="eyebrow">League history</span><h2 id="od-h" className="h2">The original draft · {ORIGINAL_DRAFT_YEAR}</h2></div>
        <span className="muted" style={{ fontSize: 12 }}>{ORIGINAL_DRAFT.length} picks · {rounds} rounds · snake · club names as on draft day</span>
      </div>
      <div className="od-scroll" tabIndex={0} aria-label="Every pick of the original draft">
        <ol className="od-list">
          {ORIGINAL_DRAFT.map((p) => {
            const rd = Math.ceil(p.pick / TEAMS);
            return (
              <Fragment key={p.pick}>
              {p.pick % TEAMS === 1 && <li className="od-rd" aria-hidden="true">Round {rd}</li>}
              <li>
                <span className="od-n">{p.pick}</span>
                <span className="od-p"><b>{p.player}</b><em>{p.club} · {p.pos}</em></span>
                <span className="od-t">{ORIGINAL_DRAFT_TEAMS[p.team]}</span>
              </li>
              </Fragment>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
