'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/data';
import { CRYSTAL_COOKIE, passwordOk, unlockToken } from '@/lib/crystal-access';

export async function unlockCrystal(form: FormData) {
  const me = await getMe();
  if (!me) redirect('/');
  if (!passwordOk(String(form.get('password') ?? ''))) redirect('/draft/crystal-ball?wrong=1');
  (await cookies()).set(CRYSTAL_COOKIE, unlockToken(me.user_id), { httpOnly: true, secure: true, sameSite: 'lax', path: '/draft/crystal-ball', maxAge: 60 * 60 * 24 * 30 });
  redirect('/draft/crystal-ball');
}

export async function lockCrystal() {
  (await cookies()).delete({ name: CRYSTAL_COOKIE, path: '/draft/crystal-ball' });
  redirect('/draft/history');
}
