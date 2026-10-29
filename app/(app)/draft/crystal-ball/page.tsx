import { gtrainPicksFor } from '@/lib/gtrain-draft';
import Link from 'next/link';
import { DraftTabs } from '@/components/DraftTabs';
import { InfoPopover } from '@/components/InfoPopover';
import { HighlightsLink, ProfileSheet } from '@/components/ProfileSheet';
import { draftProfileByName, draftProfileFor } from '@/lib/draft-profiles';
import { YearSelect } from '@/components/YearSelect';
import { TableSearch } from '@/components/TableSearch';
import { crystalUnlocked } from '@/lib/crystal-access';
import { getMe } from '@/lib/data';
import { lockCrystal, unlockCrystal } from './actions';
import data from '@/lib/crystal-ball.json';
import freeAgents from '@/lib/free-agents.json';
import seconds from '@/lib/fa-seconds.json';
import faPlayers from '@/lib/free-agent-players.json';
import { C } from '@/lib/ratings';

// Crystal ball: patterns in pre-draft profiles that led to fantasy stars, applied to the 2026 crop.
// Built offline by scripts/crystal.py → crystal_model.py → crystal_score.py.

type Reason = { label: string; effect: number };
type Prospect = {
  rank: number; slot?: number; boards?: { tw?: number | null; rm?: number | null; zh?: number | null }; name: string; junior: string; position: string; height: number | null;
  jFP: number | null; jD: number | null; jT: number | null; jSeason?: number | null; jMax?: number | null; j120?: number | null; traits: string[]; flags: string[]; type?: string; club?: string | null; drafted?: boolean; ceiling?: boolean;
  chance: number; relevant: number; positionOnly: number; role: string; reasons: Reason[];
  why: { good: boolean; text: string }[];
  comps: { name: string; pick: number; year: number; peak: number; now: number | null; jFP: number | null; jT: number | null; jD: number | null; scouts: string[]; workons: string[]; role: string; type?: string }[];
};
type Pattern = { kind: 'strength' | 'workon'; label: string; n: number; hits: number; rate: number; lift: number };
type Bucket = { label: string; n: number; hits: number; rate: number; lift: number };
const D = data as unknown as {
  // ruckTime: rucks who made it and the season (after the draft) they first averaged 90+
  meta: { hitBar: number; relBar: number; aucRel: number; trainN: number; trainHits: number; years: string; auc: number; aucPositionOnly: number; aucLate: number; aucLatePositionOnly: number; ruckTime?: { name: string; years: number }[]; lateHits: { name: string; pick: number; year: number; peak: number }[];
    accumulator?: { acc: { made: number; rel: number; medPeak: number | null; examples: string[] }; rest: { made: number; rel: number; medPeak: number | null } } };
  patterns: Pattern[]; numbers: Record<string, Bucket[]>;
  validation: { name: string; year: number; pick: number; peak: number; chance: number; positionOnly: number; jFP: number | null; traits: string[] }[];
  prospects: Prospect[];
  past: { years: number[]; path: Record<string, number>; surprises: string[]; breakouts: string[]; sleepers?: string[]; players: Past[] };
};
type Past = {
  year: number; pick: number; name: string; club: string; age: number | null; mature: boolean; pre: number; positionOnly: number; now: number;
  games: number; current: { games: number; avg: number } | null; best: number | null; peak: number | null; track: number | null;
  status: 'Star' | 'On track' | 'Building' | 'Blocked' | 'Sidelined' | 'Close' | 'Long shot' | 'Unlikely' | 'Yet to debut' | 'Too early'; why?: string[]; like?: string[]; traits: string[]; jFP: number | null; jMax?: number | null; j120?: number | null; seasons: [number, number, number][]; role: string; cba: Record<string, number>;
  state?: { league: string; year: number; games: number; fp: number; disposals: number; tackles: number; marks: number; goals: number }[];
};

const base = D.meta.trainHits / D.meta.trainN;
const pct = (x: number) => `${Math.round(x * 100)}%`;

function reasonText(r: Reason, p: Prospect) {
  if (r.label === 'Junior fantasy avg') return `Junior fantasy ${p.jFP?.toFixed(0)}`;
  if (r.label === 'Big junior games (140+)') return `Best junior game ${p.jMax?.toFixed(0)}`;
  if (r.label === 'Junior tackles') return `${p.jT?.toFixed(1)} tackles a game`;
  if (r.label === 'No junior numbers') return 'Barely played in 2026';
  if (r.label === 'Key position') return 'Key-position role';
  if (r.label === 'Tall utility') return 'Tall-utility role';
  if (r.label === 'Small forward') return 'Small-forward role';
  if (r.label.startsWith('Combine: ')) return r.label.replace('Combine: ', 'Combine ');
  if (r.label.startsWith('needs')) return `Work-on: ${r.label.replace('needs ', '')}`;
  return r.label;
}

function Chance({ value, size = 34, width }: { value: number; size?: number; width?: number }) {
  const bg = value >= 50 ? C.green5 : value >= 30 ? C.green4 : value >= 18 ? C.green3 : value >= 10 ? C.yellow : C.empty;
  const fg = value >= 30 ? '#fff' : C.ink;
  return <span style={{ display: 'inline-flex', alignItems: 'baseline', justifyContent: 'center', gap: 2, width, boxSizing: 'border-box', background: bg, color: fg, borderRadius: 10, padding: '4px 10px', font: `600 ${size}px/1 var(--font)`, letterSpacing: '-.03em' }}>{Math.round(value)}<span style={{ fontSize: size * 0.45 }}>%</span></span>;
}

function TwoBars({ star, relevant }: { star: number; relevant: number }) {
  const row = (label: string, v: number, colour: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr 40px', gap: 8, alignItems: 'center', fontSize: 12 }}>
      <span>{label}</span>
      <span style={{ height: 10, background: 'var(--line)', borderRadius: 5, position: 'relative' }}>
        <span style={{ position: 'absolute', inset: 0, width: `${Math.min(100, v)}%`, background: colour, borderRadius: 5 }} />
      </span>
      <b className="mono" style={{ textAlign: 'right' }}>{Math.round(v)}%</b>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {row('Star (90+ season)', star, C.green5)}
      {row('Relevant (80+)', relevant, C.green3)}
    </div>
  );
}

function WhyDetails({ p }: { p: Prospect }) {
  const top = p.comps[0];
  return (
    <>
      <HighlightsLink name={p.name} />
      <TwoBars star={p.chance} relevant={p.relevant} />
      <span className="muted" style={{ fontSize: 12 }}>Draft slot alone would say {Math.round(p.positionOnly)}% for a 90+ season. Role: {p.role}.</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="eyebrow" style={{ color: C.green5 }}>Why we like him</span>
        {p.why.filter((w) => w.good).map((w) => <p key={w.text} style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}><b style={{ color: C.green5 }}>▲</b> {w.text}</p>)}
        {p.why.some((w) => !w.good) && <span className="eyebrow" style={{ color: '#b4532a', marginTop: 4 }}>Watch-outs</span>}
        {p.why.filter((w) => !w.good).map((w) => <p key={w.text} style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}><b style={{ color: '#b4532a' }}>▼</b> {w.text}</p>)}
      </div>
      {top && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="eyebrow">Same type of player{p.type ? `: ${p.type}` : ''}</span>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
            <b>{top.name}</b> (pick {top.pick}, {top.year}) looked like this before the draft:
            {top.jFP ? ` junior fantasy ${Math.round(top.jFP)}` : ''}{top.jT ? `, ${top.jT.toFixed(1)} tackles` : ''}{top.jD ? `, ${top.jD.toFixed(1)} disposals` : ''}.
            {top.scouts.length ? <> Scouts said: <i>{top.scouts.join(', ').replace('imapct', 'impact')}</i>{top.workons.length ? <>; work on <i>{top.workons.join(', ').replace('imapct', 'impact')}</i></> : null}.</> : null}
            {' '}He peaked at <b>{top.peak.toFixed(1)}</b>{top.now ? <> and averages <b>{top.now.toFixed(1)}</b> in 2026</> : null}.
          </p>
          <p style={{ margin: 0, fontSize: 14 }}>
            <span className="muted">This year:</span> {p.name}: junior fantasy {p.jFP?.toFixed(0) ?? '–'}, {p.jT?.toFixed(1) ?? '–'} tackles, {p.jD?.toFixed(1) ?? '–'} disposals; scouts noted {p.traits.slice(0, 5).join(', ').toLowerCase() || '–'}.
          </p>
          {p.comps.length > 1 && <span className="muted" style={{ fontSize: 12 }}>Other {p.type ? `${p.type}s` : 'players'} with a similar draft profile: {p.comps.slice(1).map((c) => `${c.name} (#${c.pick} ’${String(c.year).slice(2)}, peak ${c.peak.toFixed(0)})`).join(', ')}</span>}
        </div>
      )}
    </>
  );
}

function CeilingPill({ small = false }: { small?: boolean }) {
  const a = D.meta.accumulator;
  const tip = a ? `Accumulator: ${Math.round((a.acc.rel / a.acc.made) * 100)}% of accumulators who played 50+ games had an 80+ season, against ${Math.round((a.rest.rel / a.rest.made) * 100)}% of everyone else` : 'Accumulator';
  return <span className="pill" title={tip} style={{ background: '#f5e3a8', color: C.ink, fontSize: small ? 11 : 12, whiteSpace: 'nowrap' }}>★ High ceiling</span>;
}

function ProspectCard({ p, note, info = false, focus = 'star' }: { p: Prospect; note?: string; info?: boolean; focus?: 'star' | 'relevant' }) {
  return (
    <article className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 92px', alignItems: 'start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow">{p.drafted ? `Pick ${p.rank}${p.club ? ` · ${p.club}` : ''}` : `Consensus #${p.slot ?? p.rank}`} · {p.type || p.position || '–'}{p.height ? ` · ${p.height}cm` : ''}</span>
          <h3 style={{ font: '600 20px var(--font)', letterSpacing: '-.02em', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            {p.name}
            {info && <InfoPopover title={p.name}><WhyDetails p={p} /></InfoPopover>}
          </h3>
          <span className="muted" style={{ fontSize: 12 }}>{p.junior}{p.role && p.role !== 'Midfielder' ? ` · ${p.role}` : ''}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <Chance value={focus === 'relevant' ? p.relevant : p.chance} size={24} width={84} />
          <div className="muted" style={{ fontSize: 11, textAlign: 'right', lineHeight: 1.25 }}>{focus === 'relevant' ? '80+ season' : `slot alone ${Math.round(p.positionOnly)}%`}</div>
        </div>
      </div>
      <TwoBars star={p.chance} relevant={p.relevant} />
      {note && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>{note}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {p.reasons.map((r) => (
          <span key={r.label} className="pill" style={{ background: r.effect > 0 ? '#d8ecd0' : '#f3d9d2', color: C.ink, fontSize: 12 }}>
            {r.effect > 0 ? '▲' : '▼'} {reasonText(r, p)}
          </span>
        ))}
        {p.ceiling && <CeilingPill />}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12 }} className="mono">
        <span>Junior fantasy <b>{p.jFP?.toFixed(0) ?? '–'}</b>{p.jMax ? <span className="muted"> · best game <b style={{ color: p.jMax >= 140 ? C.green5 : undefined }}>{p.jMax.toFixed(0)}</b></span> : null}{p.jSeason && p.jSeason < 2026 ? <span className="muted"> ({p.jSeason}{p.jSeason <= 2024 ? ' U16, −10%' : ''})</span> : null}</span>
        <span>Disposals <b>{p.jD?.toFixed(1) ?? '–'}</b></span>
        <span>Tackles <b>{p.jT?.toFixed(1) ?? '–'}</b></span>
      </div>
      <span className="muted" style={{ fontSize: 12 }}>
        Profile looks like: {p.comps.map((c, i) => <span key={c.name}>{i ? ', ' : ''}<b style={{ color: C.ink, fontWeight: 600 }}>{c.name}</b> (#{c.pick}, ’{String(c.year).slice(2)})</span>)}
      </span>
    </article>
  );
}

/** Compact side panel: one line per player, tap to open his full card. */
function Panel({ title, blurb, rows, focus = 'star' }: { title: string; blurb: string; rows: Prospect[]; focus?: 'star' | 'relevant' }) {
  return (
    <section className="card cb-panel">
      <div style={{ padding: '10px 12px 6px' }}>
        <h3 style={{ font: '600 15px var(--font)', margin: 0, letterSpacing: '-.01em' }}>{title}</h3>
        <span className="muted" style={{ fontSize: 11 }}>{blurb}</span>
      </div>
      {rows.map((p) => (
        <details key={p.name} className="cb-item">
          <summary>
            <span style={{ minWidth: 0 }}>
              <b style={{ fontWeight: 600 }}>{p.name}</b>
              <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>{p.drafted ? `Pick ${p.rank}` : `Board #${p.slot ?? p.rank}`} · {p.type || p.position || '–'}</span>
            </span>
            <Chance value={focus === 'relevant' ? p.relevant : p.chance} size={13} width={48} />
            <span className="cb-caret" aria-hidden="true">▾</span>
          </summary>
          <div style={{ padding: '0 8px 10px' }}><ProspectCard p={p} info focus={focus} /></div>
        </details>
      ))}
    </section>
  );
}

function Bars({ title, rows, note }: { title: string; rows: Bucket[]; note?: string }) {
  const max = Math.max(...rows.map((r) => r.rate), base) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="eyebrow">{title}</span>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 64px', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <span>{r.label}</span>
          <span style={{ position: 'relative', height: 14, background: 'var(--line)', borderRadius: 7 }}>
            <span style={{ position: 'absolute', inset: 0, width: `${(r.rate / max) * 100}%`, background: r.rate >= base * 1.5 ? C.green5 : r.rate >= base ? C.green3 : C.yellow, borderRadius: 7 }} />
            <span aria-hidden="true" title="Average hit rate" style={{ position: 'absolute', top: -3, bottom: -3, left: `${(base / max) * 100}%`, width: 2, background: C.ink, opacity: 0.5 }} />
          </span>
          <span className="mono" style={{ textAlign: 'right' }}>{pct(r.rate)} <span className="muted" style={{ fontSize: 11 }}>({r.hits}/{r.n})</span></span>
        </div>
      ))}
      {note && <span className="muted" style={{ fontSize: 12 }}>{note}</span>}
    </div>
  );
}

function PatternList({ title, rows, good }: { title: string; rows: Pattern[]; good: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="eyebrow" style={{ color: good ? C.green5 : '#b4532a' }}>{title}</span>
      {rows.map((r) => (
        <div key={r.kind + r.label} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 76px', gap: 8, fontSize: 13, alignItems: 'baseline' }}>
          <span>{r.kind === 'workon' ? <span className="muted">Work-on: </span> : null}{r.label.replace(/^needs /, '')}</span>
          <span className="mono" style={{ textAlign: 'right' }}>{pct(r.rate)} <span className="muted" style={{ fontSize: 11 }}>{r.hits}/{r.n}</span></span>
          <span className="pill" style={{ justifySelf: 'end', background: r.lift >= 1 ? '#d8ecd0' : '#f3d9d2', color: C.ink }}>{r.lift.toFixed(1)}× slot</span>
        </div>
      ))}
    </div>
  );
}

const STATUS: Record<Past['status'], { bg: string; fg: string }> = {
  Star: { bg: C.green5, fg: '#fff' }, 'On track': { bg: C.green4, fg: '#fff' }, Building: { bg: '#2f6f8f', fg: '#fff' }, Blocked: { bg: '#7a5fc0', fg: '#fff' }, Sidelined: { bg: '#e6def5', fg: C.ink }, Close: { bg: '#d8ecd0', fg: C.ink },
  'Long shot': { bg: '#f4ead0', fg: C.ink }, Unlikely: { bg: '#f3d9d2', fg: C.ink }, 'Yet to debut': { bg: C.empty, fg: C.muted }, 'Too early': { bg: C.yellow, fg: C.ink },
};

function Header({ view }: { view: 'next' | 'past' | 'fa' }) {
  return (
    <div className="row-between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <span className="eyebrow">{view === 'next' ? 'What the draft profiles of today’s stars had in common, and who in 2026 has it' : view === 'fa' ? 'Every unowned player in the league, and who is worth a pick' : 'What we would have said on draft night, and how they’re tracking'}</span>
        <h1 style={{ font: '600 34px var(--font)', letterSpacing: '-.03em' }}>Crystal ball</h1>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <DraftTabs active="crystal" showCrystal />
        <form action={lockCrystal}><button className="btn" type="submit" style={{ fontSize: 12 }}>Lock</button></form>
      </div>
      <div role="tablist" aria-label="Crystal ball view" style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: 'var(--line)', gap: 2, flexWrap: 'wrap', maxWidth: '100%', flexBasis: '100%', width: 'fit-content' }}>
        {([['next', '2026 prospects', '/draft/crystal-ball'], ['past', 'Previous drafts: how they’re tracking', '/draft/crystal-ball?view=past'], ['fa', '2027 free agents', '/draft/crystal-ball?view=fa']] as const).map(([k, label, href]) => (
          <Link key={k} href={href} role="tab" aria-selected={view === k}
            style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', background: view === k ? '#fff' : 'transparent', color: view === k ? C.ink : C.muted }}>{label}</Link>
        ))}
      </div>
    </div>
  );
}

function Seasons({ s }: { s: Past['seasons'] }) {
  if (!s.length) return <span className="muted">–</span>;
  return (
    <span className="mono" style={{ fontSize: 12, display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
      {s.map(([y, g, a]) => <span key={y} title={`${g} games`} style={{ opacity: g >= 5 ? 1 : 0.5 }}>’{String(y).slice(2)} <b style={{ fontWeight: 600 }}>{a.toFixed(0)}</b></span>)}
    </span>
  );
}

function Cba({ c }: { c: Record<string, number> }) {
  const ys = Object.keys(c).sort();
  if (!ys.length) return <span className="muted">–</span>;
  return (
    <span className="mono" style={{ fontSize: 12, display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
      {ys.map((y) => <span key={y} style={{ color: c[y] >= 40 ? C.green5 : c[y] >= 15 ? C.ink : C.muted }}>’{y.slice(2)} <b style={{ fontWeight: 600 }}>{Math.round(c[y])}%</b></span>)}
    </span>
  );
}

function TrackBar({ r, path }: { r: Past; path: Record<string, number> }) {
  // Best season so far against the typical star path at the same stage.
  const n = Math.min(2026 - r.year, 5);
  const ref = path[String(n)];
  if (!r.best || !ref) return <span className="muted" style={{ fontSize: 12 }}>{r.games ? 'Not enough games yet' : 'Yet to debut'}</span>;
  const w = Math.min(140, (r.best / ref) * 100);
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 140 }}>
      <span style={{ position: 'relative', height: 10, background: 'var(--line)', borderRadius: 5 }}>
        <span style={{ position: 'absolute', inset: 0, width: `${(w / 140) * 100}%`, background: r.status === 'Star' || r.status === 'On track' ? C.green5 : r.status === 'Close' ? C.green3 : C.yellow, borderRadius: 5 }} />
        <span aria-hidden="true" style={{ position: 'absolute', top: -3, bottom: -3, left: `${(100 / 140) * 100}%`, width: 2, background: C.ink, opacity: 0.6 }} />
      </span>
      <span className="muted" style={{ fontSize: 11 }}>Best {r.best.toFixed(0)} (games-weighted) vs star path {ref.toFixed(0)} by year {n}</span>
    </span>
  );
}

const ROW_CLASS: Partial<Record<Past['status'], string>> = { Star: 'cb-row-star', 'On track': 'cb-row-track', Building: 'cb-row-building', Blocked: 'cb-row-blocked', Close: 'cb-row-close' };

/** Historical players who looked most like him at the same stage; a star marks the ones who went on to a 90+ season. */
function Like({ r, n = 3 }: { r: Past; n?: number }) {
  if (!r.like?.length) return null;
  return (
    <span style={{ fontSize: 12 }}>
      {r.like.slice(0, n).map((x, i) => {
        const made = x.endsWith('*');
        const nm = x.replace(/\*$/, '').replace(/\+$/, '');
        return <span key={x}>{i ? ', ' : ''}<span style={made ? { fontWeight: 700 } : undefined}>{made ? nm + ' ★' : nm}</span></span>;
      })}
    </span>
  );
}

const BURGUNDY = '#7a1f3d';
/** His G-Train redraft pick(s), in burgundy. */
function GPick({ name, prefix = '' }: { name: string; prefix?: string }) {
  const ps = gtrainPicksFor(name);
  if (!ps.length) return null;
  return <span title={ps.map((p) => `G-Train ${p.year} draft: pick ${p.pick} (${p.team})`).join('\n')} style={{ color: BURGUNDY, fontWeight: 600 }}>{prefix}{ps.map((p) => `#${p.pick}`).join(', ')}</span>;
}

/** A collapsible panel: title and count always visible, cards on click. */
function Drop({ title, blurb, count, children }: { title: string; blurb: string; count: number; children: React.ReactNode }) {
  return (
    <details className="card" style={{ padding: '12px 16px' }}>
      <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', listStyle: 'revert' }}>
        <span className="h2" style={{ display: 'inline' }}>{title}</span>
        <span className="muted" style={{ fontSize: 13 }}>{count} player{count === 1 ? '' : 's'}</span>
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
        <span className="muted" style={{ fontSize: 13 }}>{blurb}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>{children}</div>
      </div>
    </details>
  );
}

/** Seconds footy (VFL / SANFL / WAFL) since the draft, latest first. */
function Seconds({ r }: { r: Past }) {
  const s = (r.state ?? []).filter((x) => x.games >= 2).slice(0, 2);
  if (!s.length) return null;
  const tone = (fp: number) => (fp >= 90 ? C.green5 : fp >= 78 ? C.green4 : fp >= 65 ? C.ink : C.muted);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {s.map((x) => (
        <span key={x.league + x.year} style={{ fontSize: 12 }}>
          <span className="muted">{x.league} {x.year} </span>
          <b style={{ color: tone(x.fp) }}>{x.fp.toFixed(0)}</b>
          <span className="muted"> avg · {x.games} gm · {x.disposals.toFixed(0)} disp · {x.tackles.toFixed(1)} tkl{x.goals >= 0.5 ? ` · ${x.goals.toFixed(1)} gl` : ''}</span>
        </span>
      ))}
    </div>
  );
}

/** The scouts' pre-draft profile (Rookie Me guide, plus ESPN's phantom for 2020), when we have one. */
function PastProfile({ r }: { r: Past }) {
  const prof = draftProfileFor(r.year, r.name.replace('+', ''));
  return prof ? <ProfileSheet name={r.name.replace('+', '')} profile={prof} highlights={r.year} context={`Pick ${r.pick} · ${r.club} · ${r.year} draft`} /> : null;
}

function PastCard({ r, path }: { r: Past; path: Record<string, number> }) {
  const st = STATUS[r.status];
  return (
    <article className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 92px', alignItems: 'start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow">{r.year} draft · pick {r.pick}<GPick name={r.name} prefix=" · G-Train " /> · {r.club}{r.role && r.role !== 'Midfielder' && r.role !== 'Unknown' ? ` · ${r.role}` : ''}</span>
          <h3 style={{ font: '600 20px var(--font)', letterSpacing: '-.02em', margin: '2px 0 0' }}>{r.name.replace('+', '')}</h3>
          <span className="pill" style={{ background: st.bg, color: st.fg, marginTop: 4, display: 'inline-block' }}>{r.status}</span>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <span className="eyebrow">Draft night</span>
          <Chance value={r.pre} size={18} width={72} />
          <span className="eyebrow" style={{ marginTop: 2 }}>Now</span>
          <Chance value={r.now} size={18} width={72} />
        </div>
      </div>
      <PastProfile r={r} />
      <TrackBar r={r} path={path} />
      {r.like && r.like.length > 0 && <span style={{ fontSize: 12 }}><span className="muted">Tracking like </span><Like r={r} n={4} /></span>}
      {r.why && r.why.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {r.why.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 12 }}><span className="muted">Avg </span><Seasons s={r.seasons} /></span>
        <span style={{ fontSize: 12 }}><span className="muted">Centre bounces </span><Cba c={r.cba} /></span>
      </div>
      {r.games <= 25 && <Seconds r={r} />}
    </article>
  );
}

function PastView({ year }: { year: number }) {
  const P = D.past.players;
  const path = D.past.path;
  const surprises = D.past.surprises.map((k) => P.find((r) => `${r.name}|${r.year}` === k)).filter(Boolean) as Past[];
  const breakouts = (D.past.breakouts ?? []).map((k) => P.find((r) => `${r.name}|${r.year}` === k)).filter(Boolean).slice(0, 6) as Past[];
  const sleepers = (D.past.sleepers ?? []).map((k) => P.find((r) => `${r.name}|${r.year}` === k)).filter(Boolean) as Past[];
  const rows = P.filter((r) => r.year === year).sort((a, b) => a.pick - b.pick);
  const count = (s: Past['status']) => rows.filter((r) => r.status === s).length;
  const expected = rows.reduce((t, r) => t + r.pre / 100, 0);
  const tops = rows.filter((r) => r.status === 'On track' || r.status === 'Building' || r.status === 'Blocked' || r.status === 'Close').sort((a, b) => b.now - a.now).slice(0, 4);
  const slow = rows.filter((r) => r.pre >= 25 && (r.status === 'Long shot' || r.status === 'Unlikely' || r.status === 'Yet to debut')).sort((a, b) => b.pre - a.pre).slice(0, 4);
  const years = D.past.years.slice().reverse().map((y) => ({ value: String(y), label: `${y} draft` }));

  return (
    <div className="wrap">
      <Header view="past" />

      <section className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0, lineHeight: 1.55, maxWidth: '80ch' }}>
          <b>Draft night</b> is the chance the crystal ball would have given each player before he was picked, worked out without his own draft year in the data.
          <b> Tracking</b> compares his best season so far with the path today’s stars took: eventual {D.meta.hitBar}+ players averaged about
          {' '}{Object.entries(path).slice(0, 4).map(([n, v]) => `${Math.round(v)} in year ${n}`).join(', ')}.
          <b> Now</b> is his chance of ever having a {D.meta.hitBar}+ season, and nothing else: a solid 75 player is not “close”. Once he has 10+ AFL games it comes from
          the 25 players drafted 2016–2021 who looked most like him at the same stage (average, latest season, how many games he actually plays, how often he goes 100+,
          centre bounces, time stuck in the 2s, role and age) and how many of them got there. Bands: <b>On track</b> 50%+, <b>Close</b> 30–50%, <b>Long shot</b> 10–30%, <b>Unlikely</b> under 10%.
          <b> Building</b> is a midfielder by trade who is a regular and having real impact (AFL Player Ratings in the top quarter for his stage)
          but is being used on a wing, half-back or forward, so the fantasy scores haven’t come yet. Comparables are matched on where he actually plays (heatmap zones and starting positions), not just his numbers.
          <b> Blocked</b> is a first- or second-year player scoring 75+ in the VFL/SANFL/WAFL but not getting a regular AFL spot, usually behind an established midfield.
          On the 2016–2023 drafts, first-years like that still became stars at about their draft-night rate (4 of 20), while first-years who didn’t score in the seconds never did (0 of 84),
          so in year one his chance leans on his draft-night rating until he gets a run. By year two, still stuck there is close to fatal (1 of 115), so there’s no allowance then: the label just flags it.
          <b> Sidelined</b> means he barely played all year (injury or not picked), too little to judge, so his chance leans on his draft rating.
          Small samples are discounted, so 79 from 6 games counts for a lot less than 79 from 22.
        </p>
      </section>

      <Drop title="Beat the crystal ball" count={surprises.length} blurb="Draft-age picks we gave under a 20% chance who are already stars or ahead of the star path. Mature-age and re-drafted veterans left out.">
        {surprises.map((r) => <PastCard key={r.name + r.year} r={r} path={path} />)}
      </Drop>

      <Drop title="Breakout watch: moving into the middle" count={breakouts.length} blurb="Centre-bounce attendance is the best early sign of a fantasy breakout. These 2020–25 draftees (not yet stars, rucks left out) jumped into the centre square in 2026.">
        {breakouts.map((r) => <PastCard key={r.name + r.year} r={r} path={path} />)}
      </Drop>

      {sleepers.length > 0 && (
        <Drop title="Sleeper watch: barely seen, going well in the 2s" count={sleepers.length} blurb="2024–25 draftees with 8 AFL games or fewer who were rated highly on draft night or are piling up numbers in the VFL, SANFL or WAFL. Seconds average is AFL Fantasy scoring; 90+ in the 2s is green.">
          {sleepers.map((r) => <PastCard key={r.name + r.year} r={r} path={path} />)}
        </Drop>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <h2 className="h2">The {year} draft</h2>
          <YearSelect years={years} value={String(year)} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', fontSize: 13 }}>
          <span>Crystal ball expected <b>{expected.toFixed(1)}</b> stars from this draft</span>
          {(['Star', 'On track', 'Building', 'Blocked', 'Sidelined', 'Close', 'Long shot', 'Unlikely', 'Yet to debut'] as const).map((s) => (
            <span key={s}><span className="pill" style={{ background: STATUS[s].bg, color: STATUS[s].fg }}>{s}</span> {count(s)}</span>
          ))}
        </div>
        {tops.length > 0 && (
          <>
            <span className="eyebrow">Best placed to get there</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {tops.map((r) => <PastCard key={r.name} r={r} path={path} />)}
            </div>
          </>
        )}
        {slow.length > 0 && (
          <>
            <span className="eyebrow">Rated highly, not there yet</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {slow.map((r) => <PastCard key={r.name} r={r} path={path} />)}
            </div>
          </>
        )}
        <div className="table-box">
          <table className="squad" style={{ minWidth: 1050 }}>
            <thead><tr><th style={{ width: 46 }}>Pick</th><th style={{ width: 70, color: BURGUNDY }}>G-Train</th><th>Player</th><th style={{ width: 90, textAlign: 'center' }}>Draft night</th><th style={{ width: 80, textAlign: 'center' }}>Now</th><th style={{ width: 120 }}>Status</th><th style={{ width: 170 }}>Tracking</th><th style={{ width: 200 }}>Tracks like (★ made it)</th><th>Seasons</th><th>Centre bounces</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className={ROW_CLASS[r.status]} title={r.why?.join('\n') || undefined}>
                  <td className="mono">{r.pick}</td>
                  <td className="mono"><GPick name={r.name} /></td>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name.replace('+', '')}<div className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{r.club}{r.mature ? ' · mature-age' : ''}{r.role === 'Key position' || r.role === 'Small forward' || r.role === 'Ruck' ? ` · ${r.role}` : ''}</div>
                    <PastProfile r={r} /></td>
                  <td style={{ textAlign: 'center' }}><Chance value={r.pre} size={15} /></td>
                  <td style={{ textAlign: 'center' }}><Chance value={r.now} size={15} /></td>
                  <td><span className="pill" style={{ background: STATUS[r.status].bg, color: STATUS[r.status].fg }}>{r.status}</span></td>
                  <td><TrackBar r={r} path={path} /></td>
                  <td><Like r={r} />{r.why?.[0] && <div className="muted" style={{ fontSize: 11, marginTop: 2, whiteSpace: 'normal', maxWidth: 220 }}>{r.why[0]}</div>}</td>
                  <td><Seasons s={r.seasons} /></td>
                  <td><Cba c={r.cba} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CrystalBallView() {
  const P = D.prospects;
  const likely = [...P].sort((a, b) => b.chance - a.chance).slice(0, 4);
  const likelyNames = new Set(likely.map((p) => p.name));
  const sleepers = [...P].filter((p) => (p.slot ?? p.rank) >= 12 && !likelyNames.has(p.name)).sort((a, b) => (b.chance - b.positionOnly) - (a.chance - a.positionOnly)).slice(0, 4);
  const shown = new Set([...likely, ...sleepers].map((p) => p.name));
  const relevant = [...P].filter((p) => !shown.has(p.name) && p.relevant >= 40).sort((a, b) => b.relevant - a.relevant).slice(0, 4);
  relevant.forEach((p) => shown.add(p.name));
  const relValue = [...P].filter((p) => !shown.has(p.name) && (p.slot ?? p.rank) >= 15 && p.relevant >= 20).sort((a, b) => b.relevant - a.relevant).slice(0, 4);
  const caution = [...P].filter((p) => (p.slot ?? p.rank) <= 15 && p.positionOnly - p.chance >= 8).sort((a, b) => (b.positionOnly - b.chance) - (a.positionOnly - a.chance)).slice(0, 4);
  const boosts = D.patterns.filter((r) => r.lift >= 1.2 && r.n >= 10).sort((a, b) => b.lift - a.lift);
  const drags = D.patterns.filter((r) => r.lift <= 0.8 && r.n >= 10).sort((a, b) => a.lift - b.lift);
  const accum = D.patterns.find((r) => r.label === 'Accumulator');
  const fp110 = D.numbers.juniorFantasy.find((b) => b.label === '110+');
  const acc = D.meta.accumulator;

  const ranked = [...P].sort((a, b) => b.chance - a.chance);
  const ruck = D.meta.ruckTime ?? [];
  return (
    <div className="wrap" style={{ maxWidth: 1480 }}>
      <Header view="next" />

      <section className="card" style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '6px 22px', alignItems: 'baseline', fontSize: 13 }}>
        <span style={{ maxWidth: '86ch', lineHeight: 1.5 }}>
          Trained on {D.meta.trainN} national draft picks from 2016–2024: the scouts’ strengths and work-ons, junior numbers, role and combine results, against who went on to a <b>{D.meta.hitBar}+ AFL Fantasy season</b>.
          Recent drafts count a little more (the game now rewards classy ball users), but a recent pick who hasn’t hit yet only counts as a weak “no”, because stars usually arrive in years 4–6.
        </span>
        <span>Picks stars better than draft slot alone: <b>{D.meta.auc}</b> vs {D.meta.aucPositionOnly} (AUC) · picks 15+: <b>{D.meta.aucLate}</b> vs {D.meta.aucLatePositionOnly}</span>
      </section>

      <div className="cb-layout">
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div className="row-between" style={{ alignItems: 'baseline' }}>
            <h2 className="h2">All 2026 prospects, by star chance</h2>
            <span className="muted" style={{ fontSize: 12 }}>Board = consensus rank (Twomey 40%, Rookie Me 35%, Zero Hanger 25%)</span>
          </div>
          <div className="table-box">
            <table className="squad cb-table">
              <thead><tr><th style={{ width: 28 }}>#</th><th>Prospect</th><th style={{ width: 62, textAlign: 'center' }}>Star 90+</th><th style={{ width: 52, textAlign: 'center' }}>80+</th><th style={{ width: 52, textAlign: 'center' }} title="Star chance from draft slot alone">Slot</th><th style={{ width: 46, textAlign: 'center' }}>Jr FP</th><th>Why</th></tr></thead>
              <tbody>
                {ranked.map((p, i) => (
                  <tr key={p.name}>
                    <td className="mono muted">{i + 1}</td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{p.name}<InfoPopover title={p.name}><WhyDetails p={p} /></InfoPopover></span>
                      <div className="muted" style={{ fontWeight: 400, fontSize: 11 }}>
                        {p.drafted ? `Pick ${p.rank}` : `Board #${p.slot ?? p.rank}`} · {p.position}{p.height ? ` · ${p.height}cm` : ''}{p.role !== 'Midfielder' ? ` · ${p.role}` : ''}
                        {(() => { const prof = draftProfileFor(2026, p.name); return prof ? <> · <ProfileSheet name={p.name} profile={prof} highlights={2026} context={`${p.drafted ? `Pick ${p.rank}${p.club ? ` · ${p.club}` : ''}` : `Consensus #${p.slot ?? p.rank}`} · 2026 draft`} /></> : null; })()}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}><Chance value={p.chance} size={14} /></td>
                    <td className="mono" style={{ textAlign: 'center' }}>{Math.round(p.relevant)}%</td>
                    <td className="mono muted" style={{ textAlign: 'center' }}>{Math.round(p.positionOnly)}%</td>
                    <td className="mono" style={{ textAlign: 'center' }}>{p.jFP?.toFixed(0) ?? '–'}</td>
                    <td style={{ fontSize: 11, lineHeight: 1.35 }}>{p.ceiling && <><CeilingPill small />{' '}</>}{p.reasons.slice(0, 3).map((r) => `${r.effect > 0 ? '▲' : '▼'} ${reasonText(r, p)}`).join('  ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="muted" style={{ fontSize: 11 }}>
            Tap ⓘ for the full read on a player. Sources: Rookie Me Central draft profiles and rankings (2016–2026), Matt Balmer’s 2016 power rankings, AFL.com.au Phantom Form Guides, combine results; AFL careers from DFS Australia.
          </span>
        </section>

        <aside className="cb-side">
          <Panel title="Likely stars" blurb="Top-end profiles that look like Ashcroft, Smith and Brayshaw did." rows={likely} />
          <Panel title="Roughies: later picks with a star profile" blurb="Board 12th or lower, but the profile says more than the draft range." rows={sleepers} />
          {relevant.length > 0 && <Panel title="Fantasy relevant: likely 80+" blurb="Best bets for a regular 80+ season." rows={relevant} focus="relevant" />}
          {relValue.length > 0 && <Panel title="Late value (board 15+)" blurb="Cheap end of the draft with a real shot at 80+." rows={relValue} focus="relevant" />}
          {caution.length > 0 && <Panel title="Great player, harder fantasy path" blurb="High picks whose profile looks less like a fantasy scorer." rows={caution} />}
          {ruck.length > 0 && (
            <div className="card" style={{ padding: '10px 12px', fontSize: 12, lineHeight: 1.45 }}>
              <b>Rucks are the exception to “talls don’t score”, but they take time.</b> The rucks who became 90+ players first got there {Math.min(...ruck.map((r) => r.years))}–{Math.max(...ruck.map((r) => r.years))} seasons after their draft: {ruck.map((r) => `${r.name} (year ${r.years})`).join(', ')}.
            </div>
          )}
        </aside>
      </div>

      <section className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 className="h2">The patterns</h2>
        <p style={{ margin: 0, lineHeight: 1.55, maxWidth: '78ch' }}>
          Hit rate is how many with that note went on to a {D.meta.hitBar}+ season. “× slot” compares that with what their draft position alone would expect, so a trait only scores if it found stars the draft order missed.
          {accum && fp110 && acc ? <> The scouts’ <b>“Accumulator”</b> label doesn’t predict who makes it ({accum.lift.toFixed(1)}× slot), so it no longer counts against a player. It predicts the ceiling instead: {pct(acc.acc.rel / acc.acc.made)} of accumulators who played 50+ games had an 80+ season, against {pct(acc.rest.rel / acc.rest.made)} of everyone else. Those players get a gold <b>High ceiling</b> tag. Piling up the ball as a junior also counts: juniors averaging 110+ fantasy hit {pct(fp110.rate)} of the time.</> : null}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
          <PatternList title="Found stars the draft order missed" rows={boosts} good />
          <PatternList title="Less likely than the draft order suggested" rows={drags} good={false} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
          <Bars title="Junior fantasy average (draft year)" rows={D.numbers.juniorFantasy} note="The line marks the average hit rate." />
          <Bars title="Junior tackles a game" rows={D.numbers.juniorTackles} />
          <Bars title="Height" rows={D.numbers.height} note="Talls take longer and score less; rucks are the exception." />
          <Bars title="Where they were picked" rows={D.numbers.pick} />
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, fontSize: 14, maxWidth: '80ch' }}>
          <li><b>Talls don’t become fantasy stars.</b> Not one non-ruck player 192cm+ drafted 2016–24 has had a 90+ season. Rucks are the exception, but they take five to seven seasons.</li>
          <li><b>The game has shifted to class.</b> In the 2016–19 drafts, contested midfielders with skill were the star factory (Smith, Brayshaw, Serong, Flanders). Since 2020 the stars have come from classy, smart ball users, often flagged for a lacking inside game: Nick Daicos, Gulden, Wanganeen-Milera, Sheezel, Holmes.</li>
          <li><b>Class plus production is the modern star profile.</b> A skilled ball user who also piles up the ball as a junior (Daicos, Will Ashcroft, Jagga and Levi Ashcroft). It gets a small boost.</li>
          <li><b>Pure runners and accumulators without class don’t translate.</b> Sold only on running or athleticism, or only on ball-winning volume, almost none became stars (Hollands, Ginbey, Robertson, Schoenberg). Both get a small penalty.</li>
          <li><b>Hunters and big juniors still count.</b> Tackling, 6+ junior tackles and a 105+ junior fantasy average remain strong signals.</li>
          <li><b>Mixed signals are left neutral.</b> “Speed as a weakness” and “kicking knocks” helped in some drafts and hurt in others, so they don’t move the number.</li>
        </ul>
      </section>


      <section className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="h2">Would it have called them?</h2>
        <span className="muted" style={{ fontSize: 13 }}>Each chance below was worked out without that player’s draft year in the data, so it’s a fair test.</span>
        <div className="table-box">
          <table className="squad" style={{ minWidth: 620 }}>
            <thead><tr><th>Player</th><th style={{ width: 70 }}>Pick</th><th style={{ width: 110, textAlign: 'center' }}>Crystal ball</th><th style={{ width: 110, textAlign: 'center' }}>Slot alone</th><th style={{ width: 120 }}>Best season</th><th>Profile signals</th></tr></thead>
            <tbody>
              {D.validation.map((v) => (
                <tr key={v.name}>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{v.name}</td>
                  <td className="mono">#{v.pick} ’{String(v.year).slice(2)}</td>
                  <td style={{ textAlign: 'center' }}><Chance value={v.chance} size={18} /></td>
                  <td className="mono muted" style={{ textAlign: 'center' }}>{Math.round(v.positionOnly)}%</td>
                  <td className="mono">{v.peak.toFixed(1)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{[v.jFP ? `Junior fantasy ${Math.round(v.jFP)}` : null, ...v.traits.slice(0, 4)].filter(Boolean).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          Late-pick stars since 2016 (pick 20+): {D.meta.lateHits.map((h) => `${h.name} (#${h.pick})`).join(', ')}.
        </span>
      </section>
    </div>
  );
}

export const dynamic = 'force-dynamic';

/** Password wall: nothing from the model is rendered until the password is entered. */
export default async function CrystalBallPage({ searchParams }: { searchParams: Promise<{ wrong?: string; view?: string; year?: string; pos?: string }> }) {
  const me = await getMe();
  const sp = await searchParams;
  if (!(await crystalUnlocked(me))) {
    const wrong = sp.wrong === '1';
    return (
      <div className="wrap">
        <form action={unlockCrystal} className="card" style={{ padding: 24, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="eyebrow">Password required</span>
          <h1 style={{ font: '600 28px var(--font)', margin: 0, letterSpacing: '-.02em' }}>🔮 Crystal ball</h1>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="eyebrow">Password</span>
            <input className="input" type="password" name="password" autoComplete="current-password" required autoFocus />
          </label>
          {wrong && <span style={{ color: '#b4532a', fontSize: 13 }}>That’s not it.</span>}
          <button className="btn" type="submit" style={{ alignSelf: 'flex-start' }}>Unlock</button>
        </form>
      </div>
    );
  }
  if (sp.view === 'fa') return <FreeAgentsView pos={sp.pos} />;
  if (sp.view === 'past') {
    const y = Number(sp.year);
    return <PastView year={D.past.years.includes(y) ? y : 2025} />;
  }
  return <CrystalBallView />;
}

// ---------- 2027 free agents ----------
type FA = { name: string; full: string; pos: string; club: string; status: string; own: string; gp: number; avg: number | null; l5: number | null;
  age: number | null; a25: number | null; a24: number | null; proj: number | null; tags: string[]; why: string[] };
const FAD = freeAgents as unknown as { updated: string; players: FA[] };
const FA_TAG: Record<string, string> = {
  'Breakout signs': '#e9d7f5', 'Young and rising': '#d8ecd0', 'Finished strong': '#d6e6f5', 'Bigger role': '#f5ecc8', 'Injury discount': '#f3d9d2', 'Proven ceiling': '#f6e1c6',
};
// Free agents link to their player profile: Keeper's short name + AFL club -> the site's player id.
const FA_CLUB: Record<string, string> = { 'Adelaide Crows': 'ADE', 'Brisbane Lions': 'BRL', Carlton: 'CAR', Collingwood: 'COL', Essendon: 'ESS', Fremantle: 'FRE', 'Geelong Cats': 'GEE',
  'Gold Coast Suns': 'GCS', 'GWS Giants': 'GWS', Hawthorn: 'HAW', Melbourne: 'MEL', 'North Melbourne': 'NTH', 'Port Adelaide': 'PTA', Richmond: 'RIC', 'St Kilda': 'STK',
  'Sydney Swans': 'SYD', 'West Coast Eagles': 'WCE', 'Western Bulldogs': 'WBD' };
const FA_ID = new Map((faPlayers as unknown as { players: { id: number; name: string; afl_club: string | null }[] }).players.map((p) => [`${p.name}|${p.afl_club}`, p.id]));
/** Draft profile button for a free agent, when we have his pre-draft profile. */
function FAProfile({ p }: { p: { full: string; club: string } }) {
  const prof = draftProfileByName(p.full);
  return prof ? <ProfileSheet name={p.full} profile={prof} highlights={prof.year} context={`${prof.projection && /rookie/i.test(prof.projection) ? prof.projection : 'National draft'} · ${prof.year} · now ${p.club}`} /> : null;
}
function FAName({ p, size = 16 }: { p: { name: string; full: string; club: string }; size?: number }) {
  const id = FA_ID.get(`${p.name}|${FA_CLUB[p.club] ?? p.club}`);
  const style = { fontWeight: 600, fontSize: size, color: 'inherit' } as const;
  return id ? <Link href={`/players/${id}`} style={{ ...style, textDecoration: 'underline', textDecorationColor: 'var(--line)', textUnderlineOffset: 3 }}>{p.full}</Link> : <span style={style}>{p.full}</span>;
}

type Sec = { name: string; full: string; pos: string; club: string; age: number | null; league: string; year: number; g: number; avg: number; max: number; g100: number;
  disp: number; tkl: number; mk: number; gl: number; ho: number; last: number[]; aflG: number; aflAvg: number | null; ruck: boolean; why: string[] };
const SEC = seconds as unknown as { updated: string; players: Sec[] };
/** Seconds (VFL / SANFL / WAFL) numbers are always shown in purple so they're never mistaken for AFL output. */
const S2 = { fg: '#5b2d8e', bg: '#f3ecfa', line: '#dccbef' };
const SEC_BY = new Map(SEC.players.map((p) => [p.name + '|' + p.club, p]));
const FA_STATUS: Record<string, string> = { SEASON: 'Season-ending injury', LONG: 'Long-term injury', SHORT: 'Short-term injury', OUT: 'Out of the side', SUSP: 'Suspended' };
const FA_POS = ['All', 'DEF', 'MID', 'RUC', 'FWD'] as const;
const fmt = (x: number | null) => (x == null ? '–' : Math.round(x));
const updatedLabel = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

function FATags({ p }: { p: FA }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {p.tags.map((t) => <span key={t} className="pill" style={{ background: FA_TAG[t] ?? C.empty, color: C.ink, fontSize: 11 }}>{t}</span>)}
    </span>
  );
}

function SecondsPanel({ pos, targets }: { pos: string; targets: Set<string> }) {
  const list = SEC.players.filter((p) => pos === 'All' || p.pos.split('/').includes(pos));
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
        <h2 className="h2">Dominating the 2s</h2>
        <span style={{ fontSize: 12, color: S2.fg }}>Purple numbers are VFL / SANFL / WAFL, not AFL · 27 and under · 90+ average</span>
      </div>
      {list.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nobody at this position tore up the seconds.</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
          {list.map((p) => (
            <div key={p.name + p.club} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, borderColor: S2.line }}>
              <div className="row-between" style={{ alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <span className="eyebrow">{p.pos} · {p.club}{p.age ? ` · ${Math.floor(p.age)}` : ''}</span>
                  <div><FAName p={p} /></div>
                    <FAProfile p={p} />
                </div>
                <div style={{ textAlign: 'right', flex: 'none', color: S2.fg }}>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 20, lineHeight: 1 }}>{Math.round(p.avg)}</div>
                  <span style={{ fontSize: 10 }}>{p.league} avg ’{String(p.year).slice(2)}</span>
                </div>
              </div>
              <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                <span className="pill" style={{ background: S2.bg, color: S2.fg, fontSize: 11 }}>Dominating the 2s</span>
                {targets.has(p.name + '|' + p.club) && <span className="pill" style={{ background: FA_TAG['Breakout signs'], color: C.ink, fontSize: 11 }}>Also a draft target</span>}
              </span>
              <div style={{ background: S2.bg, color: S2.fg, borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12 }}>
                <span className="mono">{p.league} {p.year} · {p.g} gm · max {p.max} · {p.g100}× 100+</span>
                <span className="mono">{p.disp.toFixed(0)} disp · {p.tkl.toFixed(1)} tkl · {p.mk.toFixed(1)} mk{p.gl >= 0.5 ? ` · ${p.gl.toFixed(1)} gl` : ''}{p.ho >= 5 ? ` · ${p.ho.toFixed(0)} ho` : ''}</span>
                {p.last.length > 0 && (
                  <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>Last {p.last.length}</span>
                    {p.last.map((x, i) => <span key={i} className="mono" style={{ background: '#fff', borderRadius: 6, padding: '1px 6px', fontWeight: x >= 100 ? 700 : 400 }}>{x}</span>)}
                  </span>
                )}
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.45 }}>{p.why.map((w) => <li key={w}>{w}</li>)}</ul>
              <span className="muted mono" style={{ fontSize: 11 }}>AFL ’26 {p.aflAvg != null ? `${fmt(p.aflAvg)} (${p.aflG}g)` : 'no games'}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FreeAgentsView({ pos }: { pos?: string }) {
  const filt = FA_POS.includes(pos as (typeof FA_POS)[number]) ? pos! : 'All';
  const all = FAD.players.filter((p) => filt === 'All' || p.pos.split('/').includes(filt));
  const targets = all.filter((p) => p.tags.length).sort((a, b) => (b.proj ?? 0) - (a.proj ?? 0));
  const ranked = all.filter((p) => p.avg != null);
  const unplayed = all.filter((p) => p.avg == null);
  return (
    <div className="wrap">
      <Header view="fa" />
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <span className="muted" style={{ fontSize: 12 }}>From the Keeper board, {updatedLabel(FAD.updated)} · {FAD.players.length} unowned players · refreshed once keepers lock</span>
        <div role="tablist" aria-label="Position" style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: 'var(--line)', gap: 2 }}>
          {FA_POS.map((p) => (
            <Link key={p} href={p === 'All' ? '/draft/crystal-ball?view=fa' : `/draft/crystal-ball?view=fa&pos=${p}`} role="tab" aria-selected={p === filt}
              style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none', background: p === filt ? '#fff' : 'transparent', color: p === filt ? C.ink : C.muted }}>{p}</Link>
          ))}
        </div>
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
          <h2 className="h2">Draft targets</h2>
          <span className="muted" style={{ fontSize: 12 }}>Undervalued on their 2026 average · sorted by 2027 outlook</span>
        </div>
        {targets.length === 0 ? <p className="muted" style={{ margin: 0 }}>None at this position yet.</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
            {targets.map((p) => (
              <div key={p.name} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="row-between" style={{ alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <span className="eyebrow">{p.pos} · {p.club}{p.age ? ` · ${Math.floor(p.age)}` : ''}</span>
                    <div><FAName p={p} /></div>
                    <FAProfile p={p} />
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <div className="mono" style={{ fontWeight: 700, fontSize: 20, lineHeight: 1 }}>{fmt(p.proj)}</div>
                    <span className="muted" style={{ fontSize: 10 }}>2027 outlook</span>
                  </div>
                </div>
                <FATags p={p} />
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.45 }}>{p.why.map((w) => <li key={w}>{w}</li>)}</ul>
                <span className="muted mono" style={{ fontSize: 11 }}>’26 {fmt(p.avg)} ({p.gp}g){p.a25 != null ? ` · ’25 ${fmt(p.a25)}` : ''}{FA_STATUS[p.status] ? ` · ${FA_STATUS[p.status]}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <SecondsPanel pos={filt} targets={new Set(targets.map((t) => t.name + '|' + t.club))} />

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
          <h2 className="h2">All free agents by 2026 average</h2>
          <TableSearch scope="fa-all" placeholder="Search free agents" />
        </div>
        <span className="muted" style={{ fontSize: 12, marginTop: -6 }}>Last 5 leaves out games he was injured in</span>
        <div className="table-box" style={{ maxHeight: '75vh', overflow: 'auto' }}>
          <table className="squad fa-all">
            <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#fff' }}>
              <tr><th style={{ width: 36 }}>#</th><th>Player</th><th style={{ textAlign: 'right' }}>GP</th><th style={{ textAlign: 'right' }}>’26 avg</th><th style={{ textAlign: 'right' }}>Last 5</th><th style={{ textAlign: 'right' }}>’25 avg</th><th style={{ textAlign: 'right' }}>2027</th><th>Tag</th></tr>
            </thead>
            <tbody>
              {[...ranked, ...unplayed].map((p, i) => (
                <tr key={p.name} data-n={`${p.full} ${p.name}`.toLowerCase()} style={{ background: p.tags.length ? '#f4f9f1' : undefined }}>
                  <td className="mono muted">{p.avg != null ? i + 1 : ''}</td>
                  <td style={{ minWidth: 150 }}>
                    <FAName p={p} size={14} /> <FAProfile p={p} />
                    <div className="muted" style={{ fontSize: 11 }}>{p.pos} · {p.club}{p.age ? ` · ${Math.floor(p.age)}` : ''}{FA_STATUS[p.status] ? ` · ${FA_STATUS[p.status]}` : ''}</div>
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>{p.gp}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(p.avg)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{fmt(p.l5)}</td>
                  <td className="mono muted" style={{ textAlign: 'right' }}>{fmt(p.a25)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{fmt(p.proj)}</td>
                  <td><span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}><FATags p={p} />{SEC_BY.get(p.name + '|' + p.club) && <span className="pill" title="Seconds average (VFL / SANFL / WAFL)" style={{ background: S2.bg, color: S2.fg, fontSize: 11 }}>{SEC_BY.get(p.name + '|' + p.club)!.league} {Math.round(SEC_BY.get(p.name + '|' + p.club)!.avg)}</span>}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: 0, maxWidth: '80ch' }}>
          The 2027 outlook blends his 2026 average, his last five and his 2025 season, then adjusts for age: up for players 23 and under, down from 30.
          A tag means the outlook beats what the 2026 average says, for a reason you can see: a missed or interrupted year, a strong finish, a young player on the way up, more centre bounces, or a recent season well above this one.
        </p>
      </section>
    </div>
  );
}
