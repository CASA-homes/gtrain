import { ProGate } from '@/components/ProLock';

// Pro feature (0085): Free leagues see the lock card instead.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProGate feature="Mini comps" blurb="Opt-in season-long comps like Survivor and the Rookie Shield.">{children}</ProGate>;
}
