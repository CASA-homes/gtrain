import Link from 'next/link';
import { getMe } from '@/lib/data';
import { getPlan, PRO_PER_COACH } from '@/lib/plan';

/** Shown in place of a Pro feature on a Free league. The commish gets the upgrade route; coaches are told who to ask. */
export async function ProLock({ feature, blurb }: { feature: string; blurb: string }) {
  const [me, plan] = await Promise.all([getMe(), getPlan()]);
  const lapsed = plan.plan === 'pro' && !plan.isPro;
  return (
    <section className="pro-lock" aria-labelledby="pro-lock-h">
      <div className="pro-lock-card">
        <span className="pro-lock-tag">Pro</span>
        <h2 id="pro-lock-h">{feature} {feature.endsWith('s') ? 'are' : 'is'} part of Pro</h2>
        <p>{blurb}</p>
        <p className="pro-lock-sub">{lapsed ? 'Your league’s Pro has lapsed. Nothing has been deleted: it’s all here again once the league is Pro.' : `Pro is $${PRO_PER_COACH} a coach a season, paid once by the commish for the whole league.`}</p>
        {me?.is_commish
          ? <Link href="/league/settings#plan" className="pro-lock-btn">See your league’s plan</Link>
          : <span className="pro-lock-btn alt">Ask your commish to upgrade</span>}
      </div>
    </section>
  );
}

/** Layout and page helper: the children on a Pro league, the lock on a Free one. */
export async function ProGate({ feature, blurb, children }: { feature: string; blurb: string; children: React.ReactNode }) {
  const plan = await getPlan();
  return plan.isPro ? <>{children}</> : <ProLock feature={feature} blurb={blurb} />;
}
