// Holo profile pictures: players who get the shiny treatment, with their artwork background and cut-out photo.
// Geelong's artwork is placeholder dot-style patterning in club colours; swap in licensed Indigenous artwork before rolling out widely.
export type HoloPalette = 'geelong' | 'gws' | 'wce' | 'ade' | 'gcs' | 'col' | 'brl' | 'stk';
export interface Holo { art: string; photo: string; palette: HoloPalette }
export const HOLO: Record<string, Holo> = {
  'L. Humphries': { art: '/holo/geelong-swans.svg', photo: '/players/lawson-humphries.png', palette: 'geelong' },
  'L. Ash': { art: '/holo/gws-g.svg', photo: '/players/lachie-ash.png', palette: 'gws' },
  'H. Reid': { art: '/holo/wce-wings.svg', photo: '/players/harley-reid.png', palette: 'wce' },
  'I. Rankine': { art: '/holo/ade-feathers.svg', photo: '/players/izak-rankine.png', palette: 'ade' },
  'N. Anderson': { art: '/holo/gcs-sunrise.svg', photo: '/players/noah-anderson.png', palette: 'gcs' },
  'J. Daicos': { art: '/holo/col-magpie.jpg', photo: '/players/josh-daicos.png', palette: 'col' },
  'D. Wilmot': { art: '/holo/brl-kickin.svg', photo: 'https://s.afl.com.au/staticfile/AFL%20Tenant/AFL/Players/ChampIDImages/AFL/2026014/1017067.png', palette: 'brl' },
  'D. Wilson': { art: '/holo/stk-breakout.svg', photo: 'https://s.afl.com.au/staticfile/AFL%20Tenant/AFL/Players/ChampIDImages/AFL/2026014/1027875.png', palette: 'stk' },
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
  brl: {
    frame: 'linear-gradient(135deg, #fff6dc 0%, #f7c04a 16%, #6d0f2b 36%, #ffe6a3 50%, #0a4ea3 66%, #cfe0ff 80%, #f7c04a 100%)',
    edge: 'linear-gradient(115deg, transparent 25%, rgb(255 255 255 / .95) 40%, rgb(247 192 74 / .9) 50%, rgb(255 255 255 / .95) 60%, transparent 75%)',
    sweep: 'linear-gradient(120deg, transparent 18%, #0a4ea3 28%, #ffffff 36%, #f7c04a 44%, #ffe6a3 50%, #b23a5a 58%, #ffffff 66%, transparent 80%)',
    foil: 'linear-gradient(60deg, transparent 20%, #f7c04a 32%, #ffffff 40%, #8fb4ff 48%, #ffffff 56%, #6d0f2b 66%, transparent 80%)',
    lines: 'repeating-linear-gradient(55deg, rgb(255 255 255 / 0) 0 6px, rgb(255 255 255 / .4) 6px 7px, rgb(255 255 255 / 0) 7px 10px, rgb(247 192 74 / .45) 10px 11px)',
    glint: ['rgb(255 255 255 / .95)', 'rgb(255 214 120 / .95)'],
    glare: 'rgb(247 192 74 / .22)', sheen: 'rgb(247 192 74 / .5)', base: '#1c040c', shadow: 'rgb(58 10 28 / .45)', dim: 0.5,
  },
  stk: {
    frame: 'linear-gradient(135deg, #ffffff 0%, #ff2a33 16%, #111111 34%, #ffffff 48%, #ff2a33 62%, #0b0b0c 78%, #ffd6d8 100%)',
    edge: 'linear-gradient(115deg, transparent 25%, rgb(255 255 255 / .95) 42%, rgb(255 42 51 / .9) 50%, rgb(255 255 255 / .95) 58%, transparent 75%)',
    sweep: 'linear-gradient(120deg, transparent 20%, #a5000b 30%, #ffffff 38%, #ff2a33 46%, #ffd6d8 52%, #ff2a33 60%, #ffffff 68%, transparent 80%)',
    foil: 'linear-gradient(60deg, transparent 22%, #ff2a33 34%, #ffffff 42%, #c0c0c8 48%, #ff2a33 56%, #222 66%, transparent 80%)',
    lines: 'repeating-linear-gradient(-35deg, rgb(255 255 255 / 0) 0 5px, rgb(255 255 255 / .4) 5px 6px, rgb(255 255 255 / 0) 6px 9px, rgb(255 42 51 / .45) 9px 10px)',
    glint: ['rgb(255 255 255 / .95)', 'rgb(255 120 128 / .95)'],
    glare: 'rgb(255 42 51 / .22)', sheen: 'rgb(255 42 51 / .5)', base: '#0b0b0c', shadow: 'rgb(0 0 0 / .5)', dim: 0.75,
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
  gcs: {
    frame: 'linear-gradient(135deg, #7c0a0e 0%, #ffc72c 18%, #ffe7a0 32%, #d7261e 50%, #ffc72c 66%, #fff3d0 80%, #7c0a0e 100%)',
    edge: 'linear-gradient(115deg, transparent 25%, rgb(255 255 255 / .9) 42%, rgb(255 199 44 / .9) 50%, rgb(255 255 255 / .9) 58%, transparent 75%)',
    sweep: 'linear-gradient(120deg, transparent 22%, #7c0a0e 30%, #ffffff 38%, #ffc72c 46%, #ffe7a0 52%, #f26a1b 58%, #ffffff 66%, transparent 78%)',
    foil: 'linear-gradient(60deg, transparent 22%, #f26a1b 34%, #ffffff 42%, #ffc72c 48%, #ffe7a0 56%, #7c0a0e 66%, transparent 80%)',
    lines: 'repeating-linear-gradient(55deg, rgb(255 255 255 / 0) 0 6px, rgb(255 255 255 / .4) 6px 7px, rgb(255 255 255 / 0) 7px 10px, rgb(255 199 44 / .4) 10px 11px)',
    glint: ['rgb(255 255 255 / .95)', 'rgb(255 222 120 / .95)'],
    glare: 'rgb(255 199 44 / .2)', sheen: 'rgb(255 199 44 / .45)', base: '#4a0508', shadow: 'rgb(74 5 8 / .4)', dim: 0.6,
  },
  col: {
    frame: 'linear-gradient(135deg, #0a0a0b 0%, #c9cbd0 18%, #ffffff 32%, #17171a 50%, #e6e7ea 66%, #8a8b91 80%, #0a0a0b 100%)',
    edge: 'linear-gradient(115deg, transparent 25%, rgb(255 255 255 / .95) 42%, rgb(201 203 208 / .9) 50%, rgb(255 255 255 / .95) 58%, transparent 75%)',
    sweep: 'linear-gradient(120deg, transparent 22%, #3a3a40 30%, #ffffff 38%, #c9cbd0 46%, #ffffff 52%, #8a8b91 58%, #ffffff 66%, transparent 78%)',
    foil: 'linear-gradient(60deg, transparent 22%, #8a8b91 34%, #ffffff 42%, #c9cbd0 48%, #ffffff 56%, #2c2c31 66%, transparent 80%)',
    lines: 'repeating-linear-gradient(55deg, rgb(255 255 255 / 0) 0 6px, rgb(255 255 255 / .38) 6px 7px, rgb(255 255 255 / 0) 7px 10px, rgb(201 203 208 / .35) 10px 11px)',
    glint: ['rgb(255 255 255 / .95)', 'rgb(220 224 232 / .95)'],
    glare: 'rgb(201 203 208 / .2)', sheen: 'rgb(230 232 236 / .5)', base: '#0a0a0b', shadow: 'rgb(0 0 0 / .45)', dim: 0.55,
  },
};
