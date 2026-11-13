// Club home guernseys, simplified for the small player circles: a base colour, a pattern and a contrast colour.
export type GPattern = 'hoops' | 'stripes' | 'sash' | 'yoke' | 'chevron' | 'split' | 'diag' | 'panels' | 'band' | 'plain' | 'hoops3';
export interface GSpec { a: string; b: string; c?: string; p: GPattern; collar?: string }
export const GUERNSEY: Record<string, GSpec> = {
  ADE: { a: '#002b5c', b: '#e21937', c: '#ffd200', p: 'hoops3' },
  BRL: { a: '#7a0019', b: '#0055a3', c: '#fdbe57', p: 'split' },
  CAR: { a: '#0e1a3a', b: '#ffffff', p: 'plain' },
  COL: { a: '#111111', b: '#ffffff', p: 'stripes' },
  ESS: { a: '#111111', b: '#cc2031', p: 'sash' },
  FRE: { a: '#2a0d54', b: '#ffffff', p: 'chevron' },
  GEE: { a: '#0b2a5b', b: '#ffffff', p: 'hoops' },
  GCS: { a: '#d93e39', b: '#f6bd16', p: 'split' },
  GWS: { a: '#f15c22', b: '#4a4f55', p: 'diag' },
  HAW: { a: '#4d2004', b: '#f9b716', p: 'stripes' },
  MEL: { a: '#0f1131', b: '#cc2031', p: 'yoke' },
  NTH: { a: '#1a3b8f', b: '#ffffff', p: 'stripes' },
  PTA: { a: '#008aab', b: '#111111', c: '#ffffff', p: 'yoke' },
  RIC: { a: '#111111', b: '#f9d71c', p: 'sash' },
  STK: { a: '#d21f2c', b: '#ffffff', c: '#111111', p: 'panels' },
  SYD: { a: '#ffffff', b: '#e1251b', p: 'yoke' },
  WCE: { a: '#002b79', b: '#f2a900', p: 'chevron' },
  WBD: { a: '#20539d', b: '#e21937', c: '#ffffff', p: 'band' },
};
