// Club colours for the club circles. a and b are the main colours; m (optional) is a thinner middle stripe
// for three-colour clubs. Codes match the stats feed.
export const CLUBS: Record<string, { name: string; a: string; b: string; m?: string }> = {
  ADE: { name: 'Adelaide', a: '#002b5c', m: '#e21937', b: '#ffd200' },
  BRL: { name: 'Brisbane', a: '#7a003c', m: '#fdbe57', b: '#0055a3' },
  CAR: { name: 'Carlton', a: '#0e1e2d', b: '#ffffff' },
  COL: { name: 'Collingwood', a: '#111111', b: '#ffffff' },
  ESS: { name: 'Essendon', a: '#111111', b: '#cc2031' },
  FRE: { name: 'Fremantle', a: '#2a0d54', b: '#ffffff' },
  GEE: { name: 'Geelong', a: '#1c3c63', b: '#ffffff' },
  GCS: { name: 'Gold Coast', a: '#d93e39', m: '#ffffff', b: '#f6bd00' },
  GWS: { name: 'GWS', a: '#f15c22', b: '#333a3f' },
  HAW: { name: 'Hawthorn', a: '#4d2004', b: '#fbbf15' },
  MEL: { name: 'Melbourne', a: '#0f1131', b: '#cc2031' },
  NTH: { name: 'North Melbourne', a: '#1a3b8e', b: '#ffffff' },
  PTA: { name: 'Port Adelaide', a: '#111111', m: '#ffffff', b: '#008aab' },
  RIC: { name: 'Richmond', a: '#111111', b: '#fed102' },
  STK: { name: 'St Kilda', a: '#ed0f05', m: '#ffffff', b: '#111111' },
  SYD: { name: 'Sydney', a: '#e1251b', b: '#ffffff' },
  WCE: { name: 'West Coast', a: '#003087', b: '#f2a900' },
  WBD: { name: 'Western Bulldogs', a: '#014896', m: '#ffffff', b: '#e21937' },
};
