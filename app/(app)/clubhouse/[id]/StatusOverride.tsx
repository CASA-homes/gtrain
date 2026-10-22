'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { STATUSES } from '@/lib/ratings';
import { setStatusOverride } from './lineup-actions';

/** Commish-only: pin a team's status when the model misses something. */
export function StatusOverride({ teamId, value }: { teamId: number; value: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }} className="muted">
      Commish override
      <select
        className="input" style={{ fontSize: 12, padding: '4px 8px' }} disabled={pending} value={value ?? ''}
        onChange={(e) => start(async () => { await setStatusOverride(teamId, e.target.value || null); router.refresh(); })}
      >
        <option value="">Use the model</option>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </label>
  );
}
