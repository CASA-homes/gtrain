import Link from 'next/link';
import { redirect } from 'next/navigation';
import { KcHeader } from '@/components/contracts/KcHeader';
import { FaDeadlineControl, GrantControl, RunButton, SettingsForm, WindowControl } from '@/components/contracts/client';
import { getContracts, kt, moneyK } from '@/lib/contracts';

export const dynamic = 'force-dynamic';

export default async function ContractsAdmin() {
  const d = await getContracts();
  if (!d.me?.is_commish) redirect('/contracts');
  const s = d.settings;
  const taxable = [...d.clubs.values()].filter((c) => c.taxKt > 0);
  return (
    <div className="kc-page">
      <KcHeader settings={s} tab="admin" myTeamId={d.me.team_id} isCommish crumb="Keeper HQ / Contracts" title="Commish controls"
        sub="Set up the season, run the windows, and tune the numbers. Every change is logged in Deals." />
      <div className="kc-wrap">
        {!d.ready || !s ? (
          <section className="kc-card brass">
            <h2>1. Set up the shadow season</h2>
            <p className="kc-sub" style={{ color: '#6e5220' }}>Creates a contract for every kept player and a 10,000 KT starting bank for every club. If any club would start over the keeper cap, the caps rise until everyone fits.</p>
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
            <section className="kc-card" aria-labelledby="dr-h">
              <h2 id="dr-h">Draft day</h2>
              <p className="kc-sub">After the draft, put every uncontracted squad player on a one-season deal: R1 $32k, R2 $24k, R3 $18k, R4+ $12k, rookies (10 or fewer games) half. Round comes from the draft room; anyone not found is priced as R4+.</p>
              <div style={{ marginTop: 12 }}><RunButton run="draftees" label="Sign draftees" kind="dark" confirmText="Put every uncontracted squad player on a one-season draft deal?" /></div>
            </section>
            <section className="kc-card" aria-labelledby="ms-h">
              <h2 id="ms-h">Mid-season week</h2>
              <p className="kc-sub">{s.midseason_at ? `Started ${new Date(s.midseason_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}. ${d.freeAgents.filter((f) => f.kind === 'pending').length} pending free agents.` : 'Starting it turns every un-extended final-year player (draftees too) into a pending free agent. Extensions for them close. Then open the window for release clauses and auctions.'}</p>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {!s.midseason_at && <RunButton run="midseason" label="Start mid-season week" kind="dark" confirmText="Start mid-season week? Every un-extended final-year player becomes a pending free agent. This can't be undone this season." />}
                <WindowControl settings={s} />
              </div>
            </section>
            <section className="kc-card" aria-labelledby="fa-h">
              <h2 id="fa-h">Free agency</h2>
              <p className="kc-sub">Give every open free agent a closing time. After it passes anyone can close a player’s offers; you can close any time from the <Link href="/contracts/market">market</Link>.</p>
              <div style={{ marginTop: 12 }}><FaDeadlineControl /></div>
            </section>
            <section className="kc-card" aria-labelledby="tax-h">
              <h2 id="tax-h">Luxury tax · {s.season}</h2>
              <p className="kc-sub">{taxable.length ? taxable.map((c) => `${c.team.name} ${kt(c.taxKt)} (${moneyK(c.overTax)} over)`).join(' · ') : `No club is over the ${moneyK(s.tax_line_k)} tax line right now.`} Charge once per season, after the draft.</p>
              <div style={{ marginTop: 12 }}><RunButton run="tax" label="Charge luxury tax" kind="plain" confirmText="Charge this season's luxury tax now? It can only be charged once." /></div>
            </section>
            <section className="kc-card" aria-labelledby="g-h">
              <h2 id="g-h">Give or take tokens</h2>
              <p className="kc-sub">Paper tokens only, for prizes, fines or corrections.</p>
              <div style={{ marginTop: 12 }}><GrantControl teams={d.teams.map((t) => ({ id: t.id, name: t.name }))} /></div>
            </section>
            <section className="kc-card" aria-labelledby="set-h">
              <h2 id="set-h">League numbers</h2>
              <p className="kc-sub">Caps in $1,000s. Changes apply straight away.</p>
              <div style={{ marginTop: 12 }}><SettingsForm settings={s} /></div>
            </section>
            <section className="kc-card warn" aria-labelledby="ro-h">
              <h2 id="ro-h">End of season: roll over to {s.season + 1}</h2>
              <p className="kc-sub">Every club must be within its keeper cap (or the allowed deficit) and 17 + 1 keepers. Contracts ending in {s.season} expire; anyone not re-signed becomes an open free agent; everyone agreed to move joins their new club; every club gets its new starting bank. Close the window first. This can’t be undone.</p>
              <div style={{ marginTop: 12 }}><RunButton run="rollover" label={`Start ${s.season + 1}`} kind="plain" confirmText={`Roll over to ${s.season + 1}? This can't be undone.`} /></div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
