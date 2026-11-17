'use client';
import { useState } from 'react';
import { adminContract, adminRelease, adminUnlock } from '@/app/(app)/contracts/actions';
import { useRun } from '@/components/contracts/client';

/** Commish actions on one contract: void, restore, release, or edit salary and end season. */
export function ContractOverrideRow({ id, status, salary, end, canRelease, canUnlock }: { id: number; status: string; salary: number; end: number; canRelease?: boolean; canUnlock?: boolean }) {
  const { pending, go, note } = useRun();
  const [edit, setEdit] = useState(false);
  const [sal, setSal] = useState(String(salary));
  const [yr, setYr] = useState(String(end));
  return (
    <span className="co-acts">
      <span className="co-btns">
        {(status === 'active' || status === 'pending') && <button type="button" className="kc-btn small" disabled={pending} onClick={() => go(() => adminContract(id, 'void'), 'Void this contract? He goes back to having no contract.')}>Void</button>}
        {(status === 'released' || status === 'voided') && <button type="button" className="kc-btn small" disabled={pending} onClick={() => go(() => adminContract(id, 'restore'), 'Restore this contract as active (dead money cleared)?')}>Restore</button>}
        {canUnlock && <button type="button" className="kc-btn small" disabled={pending} onClick={() => go(() => adminUnlock(id, null), 'Unlock this contract? The club can undo or change it again until deadline day.')}>Unlock</button>}
        {canRelease && status === 'active' && <button type="button" className="kc-btn small" disabled={pending} onClick={() => go(() => adminRelease(id), 'Release him for the club? Dead money applies.')}>Release</button>}
        <button type="button" className="kc-btn small" onClick={() => setEdit(!edit)} aria-expanded={edit}>Edit</button>
      </span>
      {edit && (
        <span className="co-edit">
          <label>$k<input type="number" min={1} max={6000} value={sal} onChange={(e) => setSal(e.target.value)} /></label>
          <label>to<input type="number" min={2026} max={2040} value={yr} onChange={(e) => setYr(e.target.value)} /></label>
          <button type="button" className="kc-btn dark small" disabled={pending} onClick={() => go(() => adminContract(id, 'edit', Number(sal), Number(yr)))}>Save</button>
        </span>
      )}
      {note}
    </span>
  );
}
