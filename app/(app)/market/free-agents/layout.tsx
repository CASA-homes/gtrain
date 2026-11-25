import { ProGate } from '@/components/ProLock';

// Pro feature (0085): Free leagues see the lock card instead.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProGate feature="Free agency" blurb="Bid KT on free agents and run the one-week offer period on the Trademarket.">{children}</ProGate>;
}
