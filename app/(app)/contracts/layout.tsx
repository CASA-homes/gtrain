import { ProGate } from '@/components/ProLock';

// Pro feature (0085): Free leagues see the lock card instead.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProGate feature="Contracts and the salary cap" blurb="Sign players to contracts, manage the cap, pay release clauses and bid on free agents.">{children}</ProGate>;
}
