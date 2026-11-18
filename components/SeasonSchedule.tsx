// League page: the keeper year on one bar, like the salary cap bar. Months along the bottom, brackets for the
// off-season and season, and pins for deadline day, draft day and end of season.
// 2027 AFL dates (AFL): Round 1 Wed 17 Mar, home and away ends Sun 30 Aug (round 24), Grand Final Sun 3 Oct.
// League rules: draft day is 2 weeks before the season, deadline day (contract expiry) 1 month before.
// The mid-season trade window is an estimate around the byes until the commish sets it.

export const D = (s: string) => new Date(`${s}T12:00:00+08:00`).getTime();
const START = D('2026-11-01'), END = D('2027-10-31');
const SEASON = { start: '2027-03-17', end: '2027-08-30' };
export const KEY: { key: string; label: string; date: string; tone: string; note?: string }[] = [
  { key: 'deadline', label: 'Deadline day', date: '2027-02-17', tone: '#c2462a', note: 'Contracts expire' },
  { key: 'draft', label: 'Draft day', date: '2027-03-03', tone: '#1f3a5c' },
  { key: 'r1', label: 'Season starts', date: SEASON.start, tone: '#2e6b47', note: 'Round 1' },
  { key: 'mid', label: 'Mid-season window', date: '2027-06-01', tone: '#8a6a1f', note: 'Approx. 2 weeks around the byes' },
  { key: 'end', label: 'End of season', date: SEASON.end, tone: '#151a17', note: 'Round 24' },
  { key: 'gf', label: 'Grand final', date: '2027-10-03', tone: '#c9a227' },
];
const MID = { start: '2027-06-01', end: '2027-06-14' };

const pos = (s: string | number) => ((typeof s === 'number' ? s : D(s)) - START) / (END - START) * 100;
export const fmt = (s: string) => new Date(`${s}T12:00:00+08:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

export function SeasonSchedule() {
  const now = Date.now();
  const today = Math.min(100, Math.max(0, pos(now)));
  const months = Array.from({ length: 12 }, (_, i) => new Date(2026, 10 + i, 1));
  const next = KEY.find((k) => D(k.date) > now);
  const days = (s: string) => Math.ceil((D(s) - now) / 86400000);
  const phase = now < D(KEY[0].date) ? 'Off-season · 2026 season complete, signings open'
    : now < D(KEY[1].date) ? 'Contracts expired · draft day next'
    : now < D(SEASON.start) ? 'Pre-season · draft done'
    : now < D(SEASON.end) ? (now >= D(MID.start) && now <= D(MID.end) ? 'Mid-season trade window open' : '2027 season in progress')
    : now < D('2027-10-03') ? 'Finals' : 'Off-season · 2027 season complete';
  const seg = (a: string | number, b: string | number) => ({ left: `${pos(a)}%`, width: `${pos(b) - pos(a)}%` });
  return (
    <section className="ss card" aria-labelledby="ss-h">
      <div className="ss-head">
        <div className="ss-title"><h2 id="ss-h">Season schedule <span className="mm-eyebrow">2027</span></h2><span className="ss-now"><i />{phase}</span></div>
        {next && <span className="ss-next"><b>{days(next.date)} days</b> to {next.label.toLowerCase()}</span>}
      </div>

      <div className="ss-chart" aria-hidden="true">
        <div className="ss-brk">
          <span className="ss-b off" style={seg(START, KEY[0].date)}><em>Off-season</em></span>
          <span className="ss-b on" style={seg(SEASON.start, SEASON.end)}><em>Season · 24 rounds</em></span>
          <span className="ss-b fin" style={seg(SEASON.end, '2027-10-03')}><em>Finals</em></span>
        </div>
        <div className="ss-bar">
          <i className="ss-off" style={seg(START, SEASON.start)} />
          <i className="ss-pre" style={seg(KEY[0].date, SEASON.start)} />
          <i className="ss-on" style={seg(SEASON.start, SEASON.end)} />
          <i className="ss-mid" style={seg(MID.start, MID.end)} />
          <i className="ss-fin" style={seg(SEASON.end, '2027-10-03')} />
          <i className="ss-off" style={seg('2027-10-03', END)} />
          {KEY.filter((k) => k.key !== 'mid').map((k) => <s key={k.key} style={{ left: `${pos(k.date)}%`, background: k.tone }} />)}
          <b className="ss-today" style={{ left: `${today}%` }}><span>Today</span></b>
        </div>
        <div className="ss-months">{months.map((m) => <span key={m.toISOString()}>{m.toLocaleDateString('en-AU', { month: 'narrow' })}</span>)}</div>
      </div>

      <ol className="ss-keys">
        {KEY.map((k) => {
          const past = D(k.date) < now;
          return (
            <li key={k.key} className={past ? 'past' : k === next ? 'next' : undefined}>
              <i style={{ background: k.tone }} />
              <span><b>{k.label}</b>{k.note && <small>{k.note}</small>}</span>
              <em>{k.key === 'mid' ? `${fmt(MID.start)}–${fmt(MID.end)}` : fmt(k.date)}</em>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** League banner: the next three key dates with a countdown. */
export function NextUp() {
  const now = Date.now();
  const up = KEY.filter((k) => D(k.date) > now).slice(0, 3);
  if (!up.length) return null;
  return (
    <div className="lg-next" aria-label="Next up">
      <span className="lg-next-h">Next up</span>
      <div className="lg-next-row">
        {up.map((k, i) => {
          const d = Math.ceil((D(k.date) - now) / 86400000);
          return (
            <div key={k.key} className={`lg-nx${i === 0 ? ' first' : ''}`} style={{ ['--tone' as string]: k.tone }}>
              <b>{d}<small> day{d === 1 ? '' : 's'}</small></b>
              <span>{k.label}</span>
              <em>{fmt(k.date)}{k.note ? ` · ${k.note}` : ''}</em>
            </div>
          );
        })}
      </div>
    </div>
  );
}
