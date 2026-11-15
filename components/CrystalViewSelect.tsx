'use client';
import { useRouter } from 'next/navigation';

const VIEWS = [
  ['next', '2026 AFL Draft Prospects', '/draft/crystal-ball'],
  ['past', 'Previous drafts: how they’re tracking', '/draft/crystal-ball?view=past'],
  ['fa', '2027 free agents', '/draft/crystal-ball?view=fa'],
] as const;

/** The crystal ball's three views as one dropdown. */
export function CrystalViewSelect({ view }: { view: 'next' | 'past' | 'fa' }) {
  const router = useRouter();
  return (
    <select className="input cb-view" value={view} aria-label="Crystal ball view"
      onChange={(e) => router.push(VIEWS.find((v) => v[0] === e.target.value)![2])}>
      {VIEWS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
    </select>
  );
}
