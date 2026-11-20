import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StartWizard } from './StartWizard';

export const metadata = { title: 'Start your league · Keeper HQ' };
export const dynamic = 'force-dynamic';

export default async function StartPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect('/?start=1');
  const meta = (claims.claims.user_metadata ?? {}) as { full_name?: string };
  return <StartWizard defaultCoach={meta.full_name?.split(' ')[0] ?? ''} />;
}
