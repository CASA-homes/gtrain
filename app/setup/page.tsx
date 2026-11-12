import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SetupWizard } from '@/components/setup/SetupWizard';

export const metadata = { title: 'Set up your league' };
export const dynamic = 'force-dynamic';

// League setup (mockup signed off 12 Nov 2026): import a league or start from scratch. Signed-in only; you don't
// need to be in a league yet, so this sits outside the app shell.
export default async function SetupPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect('/');
  const email = String(auth.claims.email ?? '');
  const { data: mine } = await supabase.rpc('my_leagues');
  return <SetupWizard email={email} hasLeague={((mine ?? []) as unknown[]).length > 0} />;
}
