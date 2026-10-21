import { redirect } from 'next/navigation';
import { getMe } from '@/lib/data';

export default async function MyClubhouse() {
  const me = await getMe();
  redirect(me ? `/clubhouse/${me.team_id}` : '/');
}
