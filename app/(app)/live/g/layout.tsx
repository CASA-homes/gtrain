import { ProGate } from '@/components/ProLock';

// Pro feature (0085): Free leagues see the lock card instead.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProGate feature="Mini games" blurb="Quick head-to-head draft games between coaches.">{children}</ProGate>;
}
