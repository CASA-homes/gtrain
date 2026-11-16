'use client';
// Cancel a tabled free-agent offer (Trademarket › Your free-agent offers).
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { withdrawOffer } from '@/app/(app)/contracts/actions';

export function WithdrawOffer({ offerId, name, sweet }: { offerId: number; name: string; sweet: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (msg) return <span className="muted" style={{ fontSize: 13 }}>{msg}</span>;
  if (!ask) return <button type="button" className="btn" onClick={() => setAsk(true)}>Cancel offer</button>;
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13 }}>Cancel your offer for {name}?{sweet ? ` Your ${sweet} KT comes back.` : ''}</span>
      <button type="button" className="btn" disabled={pending} onClick={() => setAsk(false)}>Keep it</button>
      <button type="button" className="btn" disabled={pending} style={{ background: '#b5462a', color: '#fff', borderColor: '#b5462a' }}
        onClick={() => start(async () => { const r = await withdrawOffer(offerId); setMsg(r.message); if (r.ok) router.refresh(); else setAsk(false); })}>
        {pending ? 'Cancelling…' : 'Yes, cancel'}
      </button>
    </span>
  );
}
