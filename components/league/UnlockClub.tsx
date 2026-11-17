'use client';
import { useRun } from '@/components/contracts/client';
import { adminUnlock } from '@/app/(app)/contracts/actions';

export function UnlockClub({ teamId, count, name }: { teamId: number; count: number; name: string }) {
  const { pending, go, note } = useRun();
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button type="button" className="kc-btn small" disabled={pending} onClick={() => go(() => adminUnlock(null, teamId), `Unlock all ${count} of ${name}'s locked contracts? They become provisional again until deadline day.`)}>Unlock all</button>
      {note}
    </span>
  );
}
