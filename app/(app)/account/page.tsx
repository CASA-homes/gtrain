import { getMe } from '@/lib/data';
import { SetPassword } from '@/components/SetPassword';

export const metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const me = await getMe();
  return (
    <div className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <div>
        <span className="eyebrow">Account</span>
        <h1 style={{ font: '600 30px var(--font)', letterSpacing: '-.02em', margin: '4px 0 0' }}>Password</h1>
      </div>
      <section className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Set a password to sign in without waiting for an email. Email links keep working too.{me?.email ? <> You sign in as <b>{me.email}</b>.</> : null}
        </p>
        <SetPassword />
      </section>
    </div>
  );
}
