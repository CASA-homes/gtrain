import { HoloAvatar } from '@/components/HoloAvatar';
import { HOLO } from '@/lib/holo';
// Temporary preview. Remove after checking.
export default function Page() {
  return <div style={{ minHeight: '100vh', background: '#f4f2ea', padding: 32, display: 'flex', gap: 30, alignItems: 'flex-end' }}>
    <HoloAvatar holo={HOLO['B. Smith']} alt="Bailey Smith" size={320} /><HoloAvatar holo={HOLO['B. Smith']} alt="Bailey Smith" size={104} /></div>;
}
