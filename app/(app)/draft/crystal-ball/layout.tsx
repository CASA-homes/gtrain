import { ProGate } from '@/components/ProLock';

// Pro feature (0085): Free leagues see the lock card instead.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProGate feature="The crystal ball" blurb="Projected draft boards, prospect rankings and where each pick is likely to land.">{children}</ProGate>;
}
