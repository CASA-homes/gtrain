import { ProGate } from '@/components/ProLock';

// Pro feature (0085): Free leagues see the lock card instead.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProGate feature="Player auctions" blurb="Auction players for KT on the Trademarket.">{children}</ProGate>;
}
