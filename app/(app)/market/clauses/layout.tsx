import { ProGate } from '@/components/ProLock';

// Pro feature (0085): Free leagues see the lock card instead.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProGate feature="Release clauses" blurb="Pay a rival player’s release clause and offer him a new deal.">{children}</ProGate>;
}
