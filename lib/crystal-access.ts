import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import type { Me } from '@/lib/data';

// Crystal ball is for the commish only: his login email, plus a password.
// Only a salted hash of the password lives in the code; the unlock cookie is tied to his user id.
export const CRYSTAL_OWNER = 'christianlopez91@outlook.com';
const SALT = 'gtrain-crystal-ball-v1';
const PASS_HASH = '4d22615afba05445d534cf186c8944d5b1fc75993e6a9b5e2899dba441605f6d';
export const CRYSTAL_COOKIE = 'gt_crystal';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export const isCrystalOwner = (me: Pick<Me, 'email'> | null | undefined) => (me?.email ?? '').trim().toLowerCase() === CRYSTAL_OWNER;
export const passwordOk = (pw: string) => sha(`${SALT}:${pw}`) === PASS_HASH;
export const unlockToken = (userId: string) => sha(`${SALT}:${PASS_HASH}:${userId}`);

export async function crystalUnlocked(me: Me | null): Promise<boolean> {
  if (!me || !isCrystalOwner(me)) return false;
  const c = (await cookies()).get(CRYSTAL_COOKIE)?.value;
  return c === unlockToken(me.user_id);
}
