// Club colours a coach can pick for their clubhouse highlight, score worm and matchup colours.
export const CLUB_COLOURS: { hex: string; name: string }[] = [
  { hex: '#2563c9', name: 'Royal blue' },
  { hex: '#0b2a5b', name: 'Navy' },
  { hex: '#0e9aa7', name: 'Teal' },
  { hex: '#1d8a3c', name: 'Green' },
  { hex: '#6b8e23', name: 'Olive' },
  { hex: '#d6a92a', name: 'Gold' },
  { hex: '#e0780f', name: 'Orange' },
  { hex: '#d23b2a', name: 'Red' },
  { hex: '#8b1e3f', name: 'Maroon' },
  { hex: '#d0457f', name: 'Pink' },
  { hex: '#6d3fc0', name: 'Purple' },
  { hex: '#3b3f45', name: 'Charcoal' },
];
export const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);

/** Clubhouse sections a coach can switch off on their club's page. */
export const CLUBHOUSE_SECTIONS = [
  { key: 'lines', name: 'Line strength' },
  { key: 'ages', name: 'Keeper age profile' },
  { key: 'outlook', name: 'Verdict and 2027 outlook' },
  { key: 'lastSeason', name: 'Last season' },
  { key: 'needs', name: 'Needs' },
  { key: 'trades', name: 'Trade list' },
  { key: 'cuts', name: 'Cut candidates' },
  { key: 'games', name: 'Club games' },
] as const;
