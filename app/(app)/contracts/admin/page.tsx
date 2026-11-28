import Link from 'next/link';
import { redirect } from 'next/navigation';
import { KcHeader } from '@/components/contracts/KcHeader';
import { DeadlineControl, FaDeadlineControl, RunButton, SettingsForm, WindowControl } from '@/components/contracts/client';
import { CommishFinances, type CfClub } from '@/components/contracts/CommishFinances';
import { createClient } from '@/lib/supabase/server';
import { getContracts, kt, moneyK } from '@/lib/contracts';
import { keeperLabel } from '@/lib/keepers';

export const dynamic = 'force-dynamic';

export default async function ContractsAdmin() {
  const d = await getContracts();
  if (!d.me?.is_commish) redirect('/contracts');
  const s = d.settings;
  const supabase = await createClient();
  const cfClubs = ((await supabase.rpc('kc_commish_finances')).data ?? []) as CfClub[];
  const draftAt = s ? ((await supabase.from('draft_room').select('starts_at').eq('year', s.season).maybeSingle()).data?.starts_at as string | null) ?? null : null;
  return (
    <div className="kc-page">
      <KcHeader settings={s} tab="admin" myTeamId={d.me.team_id} isCommish crumb="Keeper HQ / Contracts" title="Commish controls"
        sub="Set up the season, run the windows, and tune the numbers. Every change is logged in Deals." />
      <div className="kc-wrap">
        {!d.ready || !s ? (
          <section className="kc-card brass">
            <h2>1. Set up the shadow season</h2>
            <p className="kc-sub" style={{ color: '#6e5220' }}>Creates a contract for every kept player and a 1,000 KT starting bank for every club. If any club would start over the keeper cap, the caps rise until everyone fits.</p>
            <div style={{ marginTop: 12 }}><RunButton run="seed" label="Set up contracts" confirmText="Set up contracts for every club now?" /></div>
          </section>
        ) : (
          <>
            <div className="kc-grid">
              <section className="kc-card"><div className="kc-stat"><span>Contracts</span><b>{d.active.length}</b><em>{d.pending.length} signed for next season</em></div></section>
              <section className="kc-card"><div className="kc-stat"><span>Open auctions</span><b>{d.auctions.length}</b><em>{d.auctions.filter((a) => new Date(a.ends_at) <= new Date()).length} ready to settle</em></div></section>
              <section className="kc-card"><div className="kc-stat"><span>Free agents</span><b>{d.freeAgents.length}</b><em>{d.freeAgents.reduce((a, f) => a + f.offers, 0)} offers tabled</em></div></section>
              <section className="kc-card"><div className="kc-stat"><span>Tokens in the league</span><b>{kt(d.totalKt)}</b><em>{s.start_kt.toLocaleString('en-AU')} KT a club to start</em></div></section>
            </div>
            <section className="kc-card" aria-labelledby="kd-h">
              <h2 id="kd-h">Key dates</h2>
              <p className="kc-sub">The contract deadline is the last day to sign or delist. At the deadline, anyone unsigned goes into the draft pool, and from then until the draft players only move by trade (player for player). It’s one month before the draft unless you pick another date.</p>
              <div style={{ marginTop: 12 }}>{s.unsigned_swept_at ? <p className="kc-sub">Passed. Unsigned players went to the draft pool on {new Date(s.unsigned_swept_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Perth' })}.</p> : <DeadlineControl current={s.setup_until} custom={!!s.deadline_custom} draftAt={draftAt} />}</div>
            </section>
            <section className="kc-card" aria-labelledby="dr-h">
              <h2 id="dr-h">Draft day</h2>
              <p className="kc-sub">After the draft, put every uncontracted squad player on a one-season deal: R1 $32k, R2 $24k, R3 $18k, R4+ $12k, rookies (10 or fewer games) half. Round comes from the draft room; anyone not found is priced as R4+.</p>
              <div style={{ marginTop: 12 }}><RunButton run="draftees" label="Sign draftees" kind="dark" confirmText="Put every uncontracted squad player on a one-season draft deal?" /></div>
            </section>
            <section className="kc-card" aria-labelledby="ms-h">
              <h2 id="ms-h">End of mid-season window</h2>
              <p className="kc-sub">{s.midseason_at ? `Started ${new Date(s.midseason_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}. ${d.freeAgents.filter((f) => f.kind === 'pending').length} pending free agents.` : 'Happens automatically when you close the mid-season window: every final-year player not re-signed (draftees too) becomes a free agent and loses his clause. Use this only if the window closed on its timer.'}</p>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {!s.midseason_at && <RunButton run="midseason" label="Make final-year players free agents" kind="dark" confirmText="Make every un-signed final-year player a free agent now? This can't be undone this season." />}
                <WindowControl settings={s} />
              </div>
            </section>
            <section className="kc-card" aria-labelledby="fa-h">
              <h2 id="fa-h">Free agency</h2>
              <p className="kc-sub">Give every open free agent a closing time. After it passes anyone can close a player’s offers; you can close any time from the <Link href="/market/free-agents">free agents page</Link>.</p>
              <div style={{ marginTop: 12 }}><FaDeadlineControl /></div>
            </section>
            <section className="kc-card" aria-labelledby="rf-h" id="rf-h-card">
              <h2 id="rf-h">Club finances (KT)</h2>
              <p className="kc-sub">Give or take KT, rewind a term deposit or a loan, or reset a club to the starting bank. Every change goes on that club’s token record as a “Commish:” entry.</p>
              <div style={{ marginTop: 12 }}><CommishFinances clubs={cfClubs} startKt={s.start_kt ?? 1000} /></div>
            </section>
            <section className="kc-card" aria-labelledby="set-h">
              <h2 id="set-h">League numbers</h2>
              <p className="kc-sub">Caps in $1,000s. Changes apply straight away.</p>
              <div style={{ marginTop: 12 }}><SettingsForm settings={s} /></div>
            </section>
            <section className="kc-card warn" aria-labelledby="ro-h">
              <h2 id="ro-h">End of season: roll over to {s.season + 1}</h2>
              <p className="kc-sub">Every club must be within its keeper cap (or the allowed deficit) and {keeperLabel(s)} keepers. Contracts ending in {s.season} expire; anyone not re-signed becomes an open free agent; everyone agreed to move joins their new club; every club gets its new starting bank. Close the window first. This can’t be undone.</p>
              <div style={{ marginTop: 12 }}><RunButton run="rollover" label={`Start ${s.season + 1}`} kind="plain" confirmText={`Roll over to ${s.season + 1}? This can't be undone.`} /></div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
