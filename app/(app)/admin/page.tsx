import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isSiteAdmin } from '@/lib/plan';
import { setLeaguePlan } from './plans/actions';
import './admin.css';

export const metadata = { title: 'Site admin' };
export const dynamic = 'force-dynamic';

// Site admin control room: every league, every user and the site's health in one place. Site admins only (everyone
// else gets a 404). Data comes from admin_overview() (migration 0102).

type Coach = { team: string; guest: boolean; email: string | null; commish: boolean; last_sign_in: string | null };
type League = {
  id: number; name: string; created_at: string; season: number | null; setup_mode: string | null; squads_locked_at: string | null;
  plan: 'free' | 'pro'; founding: boolean; pro_until: string | null; is_pro: boolean;
  clubs: number; claimed: number; members: number; pending: number; lineups: number; trades: number; share_trades: number;
  last_sign_in: string | null; last_activity: string; dates: Record<string, string> | null; draft_day: string | null; coaches: Coach[];
};
type User = { email: string; created_at: string; last_sign_in: string | null; confirmed: boolean; admin: boolean; leagues: { league: string; team: string | null; commish: boolean }[] };
type Act = { at: string; kind: string; text: string; league?: string; who?: string };
type Overview = {
  now: string;
  metrics: { users: number; users_7d: number; active_7d: number; active_1d: number; no_league: number; leagues: number; clubs: number; claimed: number };
  leagues: League[]; users: User[]; activity: Act[];
  health: { stats: { source: string; last: string; lines: number; season: number }[]; score_log_last: string | null; pending_joins: number; unconfirmed: number };
};

const TZ = 'Australia/Perth';
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: TZ }) : '–');
const stamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: TZ }) : '–');
const ymd = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600e3).toISOString().slice(0, 10);
const ago = (iso: string | null, now: number) => {
  if (!iso) return 'never';
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60e3));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); return d < 60 ? `${d}d ago` : day(iso);
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

type Flag = { tone: 'warn' | 'bad' | 'info'; text: string };
/** What needs doing in a league, worst first. */
function flagsFor(l: League, now: number): Flag[] {
  const f: Flag[] = [];
  const idle = (now - Date.parse(l.last_activity)) / 864e5;
  if (l.pending) f.push({ tone: 'bad', text: `${plural(l.pending, 'join request')} waiting` });
  if (l.setup_mode === 'picks' && !l.squads_locked_at) f.push({ tone: 'warn', text: 'Squads not locked yet' });
  if (l.claimed < l.clubs) f.push({ tone: 'warn', text: `${plural(l.clubs - l.claimed, 'club')} without a coach` });
  if (!l.dates) f.push({ tone: 'warn', text: 'Milestone dates not set' });
  if (idle >= 3) f.push({ tone: 'info', text: `No activity for ${Math.floor(idle)} days` });
  return f;
}
const score = (fs: Flag[]) => fs.reduce((t, x) => t + (x.tone === 'bad' ? 100 : x.tone === 'warn' ? 10 : 1), 0);

function stage(l: League) {
  if (l.setup_mode === 'picks' && !l.squads_locked_at) return 'Squad setup';
  return l.draft_day ? `Pre-season · draft ${day(l.draft_day)}` : 'Pre-season';
}

const TABS = [['overview', 'Overview'], ['leagues', 'Leagues'], ['users', 'Users'], ['health', 'Health']] as const;

export default async function SiteAdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; league?: string }> }) {
  if (!(await isSiteAdmin())) notFound();
  const sp = await searchParams;
  const tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? 'overview') as (typeof TABS)[number][0];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_overview');
  if (error || !data) {
    return <div className="wrap"><p className="card" style={{ padding: 14, color: '#a23d27' }}>Couldn’t load the admin overview: {error?.message ?? 'no data'}</p></div>;
  }
  const o = data as Overview;
  const now = Date.parse(o.now);
  const leagues = o.leagues.map((l) => ({ l, flags: flagsFor(l, now) })).sort((a, b) => score(b.flags) - score(a.flags) || a.l.id - b.l.id);
  const m = o.metrics;
  const deploy = process.env.VERCEL_GIT_COMMIT_SHA ? { sha: process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7), msg: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split('\n')[0] ?? '', env: process.env.VERCEL_ENV ?? '' } : null;
  const healthRows = health(o, now, deploy);

  return (
    <div className="wrap adm">
      <header className="adm-head">
        <div>
          <span className="eyebrow">Site admin</span>
          <h1 className="h1" style={{ margin: 0 }}>Keeper HQ control room</h1>
        </div>
        <nav className="adm-tabs" aria-label="Admin sections">
          {TABS.map(([k, label]) => <Link key={k} href={`/admin?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{label}</Link>)}
        </nav>
      </header>

      {tab === 'overview' && <>
        <div className="adm-metrics">
          <Metric label="Leagues" value={m.leagues} sub={`${o.leagues.filter((l) => l.is_pro).length} on Pro`} />
          <Metric label="Users" value={m.users} sub={m.users_7d ? `+${m.users_7d} this week` : 'none new this week'} tone={m.users_7d ? 'good' : undefined} />
          <Metric label="Active 7 days" value={m.active_7d} sub={`${m.active_1d} today`} />
          <Metric label="Clubs with a coach" value={`${m.claimed} / ${m.clubs}`} sub={m.clubs > m.claimed ? `${m.clubs - m.claimed} unclaimed` : 'all claimed'} tone={m.clubs > m.claimed ? 'warn' : 'good'} />
        </div>
        <LeagueTable rows={leagues} now={now} />
        <div className="adm-two">
          <section className="card adm-card">
            <div className="adm-ch"><h2 className="h2">System health</h2><Link href="/admin?tab=health">All checks →</Link></div>
            <HealthList rows={healthRows.slice(0, 5)} />
          </section>
          <section className="card adm-card">
            <div className="adm-ch"><h2 className="h2">Recent activity</h2></div>
            <Activity rows={o.activity.slice(0, 8)} now={now} />
          </section>
        </div>
      </>}

      {tab === 'leagues' && <>
        <p className="muted adm-note">Sorted by what needs attention. Open a league for its clubs, coaches, setup checklist and plan.</p>
        {leagues.map(({ l, flags }) => (
          <details key={l.id} className="card adm-lg" open={sp.league === String(l.id) || leagues.length === 1}>
            <summary>
              <span className="adm-lg-n"><b>{l.name}</b><small>#{l.id} · created {day(l.created_at)}</small></span>
              <PlanPill l={l} />
              <span className="mono">{l.claimed} / {l.clubs} coaches</span>
              <span>{stage(l)}</span>
              <Flags flags={flags} />
            </summary>
            <div className="adm-lg-body">
              <div className="adm-lg-col">
                <h3>Clubs and coaches</h3>
                <table className="adm-t">
                  <thead><tr><th>Club</th><th>Coach</th><th>Last sign-in</th></tr></thead>
                  <tbody>{l.coaches.map((c, i) => (
                    <tr key={i} className={c.email ? '' : 'none'}>
                      <td>{c.team}{c.guest && <em className="adm-tag">guest</em>}{c.commish && <em className="adm-tag on">commish</em>}</td>
                      <td>{c.email ?? 'No coach yet'}</td>
                      <td className="mono">{c.email ? ago(c.last_sign_in, now) : '–'}</td>
                    </tr>))}</tbody>
                </table>
              </div>
              <div className="adm-lg-col">
                <h3>Setup checklist</h3>
                <ul className="adm-check">
                  <Check ok={l.claimed >= l.clubs} text={`Coaches signed up (${l.claimed} of ${l.clubs})`} />
                  <Check ok={l.setup_mode !== 'picks' || !!l.squads_locked_at} text={l.setup_mode === 'picks' ? 'Squads picked and locked' : 'Squads loaded'} />
                  <Check ok={!!l.dates} text="Milestone dates set" />
                  <Check ok={!!l.draft_day && !!l.dates} text={l.draft_day && l.dates ? `Draft day ${day(l.draft_day)}` : 'Draft day set'} />
                  <Check ok={!l.pending} text={l.pending ? `${plural(l.pending, 'join request')} to approve` : 'No join requests waiting'} />
                </ul>
                <h3>Activity</h3>
                <dl className="adm-dl">
                  <div><dt>Last activity</dt><dd>{ago(l.last_activity, now)}</dd></div>
                  <div><dt>Last coach sign-in</dt><dd>{ago(l.last_sign_in, now)}</dd></div>
                  <div><dt>Lineups saved</dt><dd>{l.lineups}</dd></div>
                  <div><dt>Trades</dt><dd>{l.trades}</dd></div>
                  <div><dt>Share trades</dt><dd>{l.share_trades}</dd></div>
                </dl>
                <h3>Plan</h3>
                <form action={setLeaguePlan} className="adm-plan">
                  <input type="hidden" name="league" value={l.id} />
                  <select name="plan" defaultValue={l.plan} className="input" aria-label={`Plan for ${l.name}`}>
                    <option value="free">Free</option><option value="pro">Pro</option>
                  </select>
                  <label>Pro until <input type="date" name="until" defaultValue={l.pro_until ? ymd(l.pro_until) : ''} className="input" /></label>
                  <input name="note" placeholder="Note (optional)" className="input" aria-label="Note" />
                  <button type="submit" className="btn dark">Save plan</button>
                </form>
              </div>
            </div>
          </details>
        ))}
      </>}

      {tab === 'users' && <>
        <p className="muted adm-note">{plural(o.users.length, 'account')} · {plural(m.no_league, 'user')} with no league (signed up but never got set up){o.health.unconfirmed ? ` · ${o.health.unconfirmed} unconfirmed email${o.health.unconfirmed === 1 ? '' : 's'}` : ''}.</p>
        <div className="card table-box" style={{ padding: 0 }}>
          <table className="adm-t adm-users">
            <thead><tr><th>Email</th><th>Leagues and clubs</th><th>Signed up</th><th>Last sign-in</th></tr></thead>
            <tbody>{o.users.map((u) => (
              <tr key={u.email} className={u.leagues.length ? '' : 'flag'}>
                <td>{u.email}{u.admin && <em className="adm-tag on">admin</em>}{!u.confirmed && <em className="adm-tag warn">unconfirmed</em>}</td>
                <td>{u.leagues.length ? u.leagues.map((x, i) => <span key={i} className="adm-ul">{x.league}{x.team ? ` · ${x.team}` : ''}{x.commish ? ' (commish)' : ''}</span>) : <span className="adm-none">No league</span>}</td>
                <td className="mono">{day(u.created_at)}</td>
                <td className="mono">{ago(u.last_sign_in, now)}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </>}

      {tab === 'health' && <>
        <section className="card adm-card">
          <div className="adm-ch"><h2 className="h2">System health</h2><span className="muted">Checked {stamp(o.now)}</span></div>
          <HealthList rows={healthRows} />
        </section>
        <section className="card adm-card">
          <div className="adm-ch"><h2 className="h2">Activity log</h2><span className="muted">Latest {o.activity.length}</span></div>
          <Activity rows={o.activity} now={now} />
        </section>
      </>}
    </div>
  );
}

type HRow = { ok: 'good' | 'warn' | 'bad' | 'info'; label: string; value: string };
function health(o: Overview, now: number, deploy: { sha: string; msg: string; env: string } | null): HRow[] {
  const rows: HRow[] = [];
  rows.push(deploy ? { ok: 'good', label: 'Deploy', value: `${deploy.env || 'live'} · ${deploy.sha}${deploy.msg ? ` · ${deploy.msg.slice(0, 48)}` : ''}` } : { ok: 'info', label: 'Deploy', value: 'Not running on Vercel' });
  for (const src of ['afltables', 'footywire']) {
    const s = o.health.stats.find((x) => x.source === src);
    const name = src === 'afltables' ? 'AFL Tables sync' : 'Footywire sync';
    rows.push(s ? { ok: now - Date.parse(s.last) > 8 * 864e5 ? 'warn' : 'good', label: name, value: `${ago(s.last, now)} · ${s.lines.toLocaleString()} lines (${s.season})` } : { ok: 'warn', label: name, value: 'Never run' });
  }
  rows.push({ ok: o.health.pending_joins ? 'bad' : 'good', label: 'Join requests waiting', value: String(o.health.pending_joins) });
  rows.push({ ok: o.health.unconfirmed ? 'warn' : 'good', label: 'Unconfirmed emails', value: String(o.health.unconfirmed) });
  rows.push({ ok: o.metrics.no_league ? 'warn' : 'good', label: 'Users with no league', value: String(o.metrics.no_league) });
  rows.push({ ok: 'info', label: 'Last score correction', value: o.health.score_log_last ? ago(o.health.score_log_last, now) : 'None yet' });
  return rows;
}

function Metric({ label, value, sub, tone }: { label: string; value: string | number; sub: string; tone?: 'good' | 'warn' }) {
  return <div className="adm-m"><span>{label}</span><b>{value}</b><small className={tone ?? ''}>{sub}</small></div>;
}
function PlanPill({ l }: { l: League }) {
  return <span className={`plan-pill ${l.is_pro ? '' : l.plan === 'pro' ? 'lapsed' : 'free'}`}>{l.is_pro ? `Pro${l.founding ? ' · founding' : ''}` : l.plan === 'pro' ? 'Pro · lapsed' : 'Free'}</span>;
}
function Flags({ flags }: { flags: Flag[] }) {
  if (!flags.length) return <span className="adm-flag good">All good</span>;
  return <span className="adm-flags">{flags.slice(0, 2).map((f) => <span key={f.text} className={`adm-flag ${f.tone}`}>{f.text}</span>)}{flags.length > 2 && <span className="adm-flag info">+{flags.length - 2} more</span>}</span>;
}
function Check({ ok, text }: { ok: boolean; text: string }) {
  return <li className={ok ? 'ok' : ''}><i aria-hidden="true">{ok ? '✓' : '!'}</i>{text}</li>;
}
function LeagueTable({ rows, now }: { rows: { l: League; flags: Flag[] }[]; now: number }) {
  return (
    <section className="card adm-card" style={{ padding: 0 }}>
      <div className="adm-ch" style={{ padding: '12px 16px 4px' }}><h2 className="h2">Leagues</h2><span className="muted">Sorted by what needs attention</span></div>
      <table className="adm-t adm-lgs">
        <thead><tr><th>League</th><th>Plan</th><th>Coaches</th><th>Stage</th><th>Last activity</th><th>Flags</th></tr></thead>
        <tbody>{rows.map(({ l, flags }) => (
          <tr key={l.id}>
            <td><Link href={`/admin?tab=leagues&league=${l.id}`}><b>{l.name}</b></Link><small>#{l.id} · created {day(l.created_at)}</small></td>
            <td><PlanPill l={l} /></td>
            <td className="mono">{l.claimed} / {l.clubs}</td>
            <td>{stage(l)}</td>
            <td className="mono">{ago(l.last_activity, now)}</td>
            <td><Flags flags={flags} /></td>
          </tr>))}</tbody>
      </table>
    </section>
  );
}
function HealthList({ rows }: { rows: HRow[] }) {
  return <ul className="adm-health">{rows.map((r) => <li key={r.label}><i className={r.ok} aria-hidden="true" /><span>{r.label}</span><b>{r.value}</b></li>)}</ul>;
}
function Activity({ rows, now }: { rows: Act[]; now: number }) {
  if (!rows.length) return <p className="muted" style={{ margin: 0 }}>Nothing yet.</p>;
  return (
    <ul className="adm-act">{rows.map((a, i) => (
      <li key={i}><span className={`adm-k ${a.kind}`}>{a.kind}</span><span className="adm-at">{a.text}{a.league ? <> · <em>{a.league}</em></> : null}{a.who ? <small>{a.who}</small> : null}</span><time dateTime={a.at}>{ago(a.at, now)}</time></li>
    ))}</ul>
  );
}
