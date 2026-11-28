'use client';
// League bank: the commish sets the league account's starting balance.
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { saveBankStart } from '@/app/(app)/league/settings/actions';

export function BankStartForm({ value }: { value: number }) {
  const router = useRouter();
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <form className="lb-start" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveBankStart(v); setMsg(r); if (r.ok) router.refresh(); }); }}>
      <label><span>Starting balance</span><input type="number" min={0} max={100000} step={10} value={v} onChange={(e) => setV(Number(e.target.value))} /> KT</label>
      <button className="kc-btn small" disabled={pending || v === value}>{pending ? 'Saving…' : 'Save'}</button>
      {msg && <span className={msg.ok ? 'ok' : 'err'} role="status">{msg.message}</span>}
    </form>
  );
}
