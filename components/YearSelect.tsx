'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Dropdown that swaps the ?year= param and keeps any other filters. */
export function YearSelect({ years, value, label = 'Draft year' }: { years: { value: string; label: string }[]; value: string; label?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="eyebrow">{label}</span>
      <select className="input" value={value} onChange={(e) => {
        const q = new URLSearchParams(sp.toString());
        q.set('year', e.target.value);
        router.push(`${path}?${q.toString()}`);
      }}>
        {years.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
      </select>
    </label>
  );
}
