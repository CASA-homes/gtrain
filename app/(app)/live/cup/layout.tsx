import { ProGate } from '@/components/ProLock';

// Pro feature (0085): Free leagues see the lock card instead.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProGate feature="The Knockout Cup" blurb="Run a cup alongside the season: groups, knockouts and a final.">{children}</ProGate>;
}
