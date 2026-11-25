import { ProGate } from '@/components/ProLock';

// Pro feature (0085): Free leagues see the lock card instead.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProGate feature="Mock drafts" blurb="Run practice drafts against the league’s likely picks.">{children}</ProGate>;
}
