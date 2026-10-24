// Holo profile pictures: players who get the shiny treatment, with their artwork background and cut-out photo.
// Geelong's artwork is placeholder dot-style patterning in club colours; swap in licensed Indigenous artwork before rolling out widely.
export type HoloPalette = 'geelong' | 'gws' | 'wce' | 'ade';
export interface Holo { art: string; photo: string; palette: HoloPalette }
export const HOLO: Record<string, Holo> = {
  'L. Humphries': { art: '/holo/geelong-swans.svg', photo: '/players/lawson-humphries.png', palette: 'geelong' },
  'L. Ash': { art: '/holo/gws-g.svg', photo: '/players/lachie-ash.png', palette: 'gws' },
  'H. Reid': { art: '/holo/wce-wings.svg', photo: '/players/harley-reid.png', palette: 'wce' },
  'I. Rankine': { art: '/holo/ade-feathers.svg', photo: '/players/izak-rankine.png', palette: 'ade' },
};

/** Foil colours per palette: the frame, the always-on sweep, the mouse-following foil, the glints and the glare. */
export const HOLO_FOIL: Record<HoloPalette, { frame: string; sweep: string; edge: string; foil: string; lines: string; glint: [string, string]; glare: string; sheen: string; base: string; shadow: string; dim?: number }> = {
  geelong: {
    frame: 'linear-gradient(135deg, #ffffff 0%, #a9bdd8 18%, #f3f6fb 34%, #0c2347 50%, #d4a62a 64%, #fff3c4 76%, #a9bdd8 100%)',
    edge: 'linear-gradient(115deg, transparent 25%, rgb(255 255 255 / .95) 40%, rgb(212 166 42 / .8) 50%, rgb(255 255 255 / .95) 60%, transparent 75%)',
    sweep: 'linear-gradient(120deg, transparent 18%, #6f8fbf 28%, #ffffff 36%, #a9bdd8 42%, #d4a62a 50%, #fff3c4 56%, #6f8fbf 64%, #ffffff 70%, transparent 82%)',
    foil: 'linear-gradient(60deg, transparent 20%, #a9bdd8 32%, #ffffff 40%, #d4a62a 48%, #ffffff 56%, #1f4479 66%, transparent 80%)',
    lines: 'repeating-linear-gradient(55deg, rgb(255 255 255 / 0) 0 6px, rgb(255 255 255 / .45) 6px 7px, rgb(255 255 255 / 0) 7px 10px, rgb(212 166 42 / .35) 10px 11px)',
    glint: ['rgb(255 255 255 / .95)', 'rgb(255 243 196 / .9)'],
    glare: 'rgb(169 189 216 / .25)', sheen: 'rgb(212 166 42 / .5)', base: '#0c2347', shadow: 'rgb(12 35 71 / .35)',
  },
  gws: {
    frame: 'linear-gradient(135deg, #1a1a1a 0%, #ff6a13 22%, #ffd3b0 36%, #0a0a0a 52%, #ff6a13 70%, #ffffff 82%, #1a1a1a 100%)',
    edge: 'linear-gradient(115deg, transparent 25%, rgb(255 255 255 / .9) 42%, rgb(255 106 19 / .85) 50%, rgb(255 255 255 / .9) 58%, transparent 75%)',
    sweep: 'linear-gradient(120deg, transparent 20%, #c2500f 30%, #ffffff 38%, #ff6a13 46%, #ffd3b0 52%, #ff6a13 60%, #ffffff 68%, transparent 80%)',
    foil: 'linear-gradient(60deg, transparent 22%, #ff6a13 34%, #ffffff 42%, #ffd3b0 48%, #ff6a13 56%, #3a3a3a 66%, transparent 80%)',
    lines: 'repeating-linear-gradient(55deg, rgb(255 255 255 / 0) 0 5px, rgb(255 255 255 / .4) 5px 6px, rgb(255 255 255 / 0) 6px 9px, rgb(255 106 19 / .4) 9px 10px)',
    glint: ['rgb(255 255 255 / .95)', 'rgb(255 160 90 / .95)'],
    glare: 'rgb(255 106 19 / .25)', sheen: 'rgb(255 106 19 / .5)', base: '#090909', shadow: 'rgb(0 0 0 / .45)',
  },
  wce: {
    frame: 'linear-gradient(135deg, #f5f8ff 0%, #f2a900 18%, #fff1c2 32%, #00204d 50%, #1f5fc4 64%, #f5f8ff 78%, #f2a900 100%)',
    edge: 'linear-gradient(115deg, transparent 25%, rgb(255 255 255 / .95) 40%, rgb(242 169 0 / .85) 50%, rgb(255 255 255 / .95) 60%, transparent 75%)',
    sweep: 'linear-gradient(120deg, transparent 18%, #1f5fc4 28%, #ffffff 36%, #7fa8e8 42%, #f2a900 50%, #fff1c2 56%, #1f5fc4 64%, #ffffff 70%, transparent 82%)',
    foil: 'linear-gradient(60deg, transparent 20%, #7fa8e8 32%, #ffffff 40%, #f2a900 48%, #ffffff 56%, #0a3d91 66%, transparent 80%)',
    lines: 'repeating-linear-gradient(55deg, rgb(255 255 255 / 0) 0 6px, rgb(255 255 255 / .45) 6px 7px, rgb(255 255 255 / 0) 7px 10px, rgb(242 169 0 / .4) 10px 11px)',
    glint: ['rgb(255 255 255 / .95)', 'rgb(255 222 120 / .95)'],
    glare: 'rgb(127 168 232 / .25)', sheen: 'rgb(242 169 0 / .5)', base: '#00204d', shadow: 'rgb(0 32 77 / .38)',
  },
  ade: {
    frame: 'linear-gradient(135deg, #1a1a1a 0%, #e21937 18%, #ffc72c 34%, #0b0b0c 50%, #ffe9a6 64%, #c8102e 80%, #1a1a1a 100%)',
    edge: 'linear-gradient(115deg, transparent 25%, rgb(255 255 255 / .9) 42%, rgb(255 199 44 / .85) 50%, rgb(255 255 255 / .9) 58%, transparent 75%)',
    sweep: 'linear-gradient(120deg, transparent 22%, #5a0a16 30%, #ffffff 38%, #ffc72c 46%, #ffe9a6 52%, #e21937 58%, #ffffff 66%, transparent 78%)',
    foil: 'linear-gradient(60deg, transparent 22%, #e21937 34%, #ffffff 42%, #ffc72c 48%, #ffe9a6 56%, #2a2a2e 66%, transparent 80%)',
    lines: 'repeating-linear-gradient(55deg, rgb(255 255 255 / 0) 0 6px, rgb(255 255 255 / .4) 6px 7px, rgb(255 255 255 / 0) 7px 10px, rgb(255 199 44 / .4) 10px 11px)',
    glint: ['rgb(255 255 255 / .95)', 'rgb(255 214 110 / .95)'],
    glare: 'rgb(255 199 44 / .15)', sheen: 'rgb(255 199 44 / .45)', base: '#0b0b0c', shadow: 'rgb(0 0 0 / .45)', dim: 0.5,
  },
};
