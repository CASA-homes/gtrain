// Club jumper patterns as CSS backgrounds, for the small club discs on Matchday cards and lists.
export const JUMPER: Record<string, string> = {
  ADE: 'repeating-linear-gradient(180deg, #002b5c 0 5px, #ffd200 5px 7px, #e21937 7px 12px, #ffd200 12px 14px)', // navy, gold, red hoops
  BRL: 'linear-gradient(180deg, #7a0019 0 46%, #fdbe57 46% 56%, #0055a3 56%)',
  CAR: '#0e1a3a',
  COL: 'repeating-linear-gradient(90deg, #111 0 4px, #fff 4px 8px)',                                     // black and white stripes
  ESS: 'linear-gradient(45deg, #111 0 38%, #cc2031 38% 62%, #111 62%)',                                  // red sash
  FRE: 'linear-gradient(180deg, #2a0d54 0 34%, #fff 34% 44%, #2a0d54 44%)',
  GEE: 'repeating-linear-gradient(180deg, #0b2a5b 0 4px, #fff 4px 8px)',                                 // navy and white hoops
  GCS: 'linear-gradient(180deg, #d93e39 0 56%, #f6bd16 56%)',
  GWS: 'linear-gradient(135deg, #f15c22 0 50%, #4a4f55 50%)',
  HAW: 'repeating-linear-gradient(90deg, #4d2004 0 4px, #f9b716 4px 8px)',                               // brown and gold stripes
  MEL: 'linear-gradient(180deg, #cc2031 0 34%, #0f1131 34%)',
  NTH: 'repeating-linear-gradient(90deg, #1a3b8f 0 4px, #fff 4px 8px)',                                  // blue and white stripes
  PTA: 'linear-gradient(180deg, #111 0 32%, #fff 32% 40%, #008aab 40%)',
  RIC: 'linear-gradient(135deg, #111 0 38%, #f9d71c 38% 62%, #111 62%)',                                 // yellow sash
  STK: 'linear-gradient(90deg, #d21f2c 0 34%, #fff 34% 66%, #111 66%)',
  SYD: 'linear-gradient(180deg, #e1251b 0 50%, #fff 50%)',
  WCE: 'linear-gradient(180deg, #002b79 0 62%, #f2a900 62%)',
  WBD: 'linear-gradient(180deg, #20539d 0 38%, #fff 38% 46%, #e21937 46% 56%, #fff 56% 64%, #20539d 64%)',
};
export const jumper = (club: string | null | undefined) => (club && JUMPER[club]) || '#9aa19c';
