// Holo profile pictures: players who get the shiny treatment, with their artwork background and cut-out photo.
// The artwork is placeholder dot-style patterning in club colours; swap in licensed Indigenous artwork before rolling out widely.
export interface Holo { art: string; photo: string; palette: 'geelong' }
export const HOLO: Record<string, Holo> = {
  'L. Humphries': { art: '/holo/geelong-swans.svg', photo: '/players/lawson-humphries.png', palette: 'geelong' },
};
