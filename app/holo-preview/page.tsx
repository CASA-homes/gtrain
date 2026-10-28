import { HoloAvatar } from '@/components/HoloAvatar';
import { HOLO, type Holo } from '@/lib/holo';

// Temporary mock-up page for new holo profile photos. Remove once approved.
const AFL = (id: number) => `https://s.afl.com.au/staticfile/AFL%20Tenant/AFL/Players/ChampIDImages/AFL/2026014/${id}.png`;
const MOCKS: { name: string; tag: string; holo: Holo }[] = [
  { name: 'Darcy Wilmot', tag: 'Brisbane · “Kick-in King”: gold kick-in arcs out of the goal square, Gabba hex seating, 106 watermark', holo: { art: '/holo/brl-kickin.svg', photo: AFL(1017067), palette: 'brl' } },
  { name: 'Darcy Wilson', tag: 'St Kilda · “The Breakout”: tri-colour bands cracked open, shards flying, his 65 → 64 → 83 jump', holo: { art: '/holo/stk-breakout.svg', photo: AFL(1027875), palette: 'stk' } },
];

export default function Page() {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f2ea', padding: '32px 20px', fontFamily: 'var(--font, Inter, sans-serif)' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 26, letterSpacing: '-.02em' }}>Holo profile photos · mock-up</h1>
      <p style={{ margin: '0 0 24px', color: '#6b7068', fontSize: 14 }}>Hover a card to tilt it. Lawson Humphries is the existing one, for reference.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 36, alignItems: 'flex-start' }}>
        {[{ name: 'Lawson Humphries', tag: 'Existing · Geelong', holo: HOLO['L. Humphries'] }, ...MOCKS].map((m) => (
          <div key={m.name} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 240 }}>
            <HoloAvatar holo={m.holo} alt={m.name} size={240} />
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <HoloAvatar holo={m.holo} alt={m.name} size={104} />
              <span style={{ fontSize: 12, color: '#6b7068' }}>Size on the player page</span>
            </div>
            <b style={{ fontSize: 16 }}>{m.name}</b>
            <span style={{ fontSize: 12.5, color: '#6b7068', lineHeight: 1.45 }}>{m.tag}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
