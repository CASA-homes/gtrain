// 2026 AFL national draft: Cal Twomey's October Phantom Form Guide ranking (AFL.com.au, 20 Oct 2026).
// It's a ranking, not a mock draft. Swap in the real order once the draft is run.
export const PHANTOM_2026_SOURCE = {
  title: 'Cal Twomey’s Phantom Form Guide: Top draft prospects’ October ranking',
  url: 'https://www.afl.com.au/news/1633149/cal-twomeys-phantom-form-guide-top-draft-prospects-october-ranking',
  date: '20 Oct 2026',
};

export interface Prospect { rank: number; name: string; from: string; position: string; club?: string }

/** Flip to true once the national draft is run: `rank` then means the actual pick and `club` the AFL club that took him. */
export const DRAFT_2026_DONE = false;

export const PHANTOM_2026: Prospect[] = [
  { rank: 1, name: 'Dougie Cochrane', from: 'Port Adelaide (SANFL)', position: 'Tall utility' },
  { rank: 2, name: 'Cody Walker', from: 'Echuca / Vic Country · Carlton father-son', position: 'Midfielder' },
  { rank: 3, name: 'Arki Butler', from: '', position: '' },
  { rank: 4, name: 'Ethan Drever', from: '', position: 'Midfielder' },
  { rank: 5, name: 'Heath Mellody', from: 'Claremont (WAFL) / Western Australia', position: 'Half-back / midfield' },
  { rank: 6, name: 'Gus Teixeira', from: 'Sandringham Dragons', position: 'Forward / centre' },
  { rank: 7, name: 'Harry Van Hattum', from: '', position: 'Ruck' },
  { rank: 8, name: 'Ethan Matthews', from: 'GWS Academy / Allies', position: 'Midfielder' },
  { rank: 9, name: 'Mitch Harris', from: 'West Coast (WAFL)', position: 'Tall defender' },
  { rank: 10, name: 'Caylen Murray', from: 'Brisbane Academy', position: 'Half-back / midfield' },
  { rank: 11, name: 'Wil Malady', from: 'Gippsland Power', position: 'Forward' },
  { rank: 12, name: 'Leo Steed', from: 'Swan Districts / Western Australia', position: 'Midfielder' },
  { rank: 13, name: 'Clancy Snell', from: 'Gippsland Power', position: 'Key defender' },
  { rank: 14, name: 'Sam Gayfer', from: 'Northern Knights', position: 'Key forward' },
  { rank: 15, name: 'Lochie Burrows', from: '', position: 'Midfield / half-back' },
  { rank: 16, name: 'Tyson Bradley', from: 'Sandringham Dragons / Vic Metro', position: 'Tall defender' },
  { rank: 17, name: 'Toby Krasna', from: 'Northern Knights', position: 'Midfielder' },
  { rank: 18, name: 'Jackson Phillips', from: '', position: 'Midfielder' },
  { rank: 19, name: 'George Dimer', from: 'Vic Metro', position: 'Small forward' },
  { rank: 20, name: 'Harvie Cooke', from: 'Northern Knights', position: 'Midfielder' },
  { rank: 21, name: 'Khaled El Souki', from: 'Western Jets · Bulldogs NGA', position: 'Small forward' },
  { rank: 22, name: 'Noah Williams', from: 'Geelong Falcons / Vic Country', position: 'Midfielder' },
  { rank: 23, name: 'Jack Pickett', from: 'Geelong Falcons', position: 'Tall forward' },
  { rank: 24, name: 'Jake Eime', from: 'Adelaide (SANFL) / South Australia', position: 'Half-back' },
  { rank: 25, name: 'Albert MacGowan', from: 'Sandringham Dragons / Vic Metro', position: 'Midfielder' },
  { rank: 26, name: 'George Gale', from: 'Claremont (WAFL)', position: 'Midfielder' },
  { rank: 27, name: 'Billy Wigmore', from: 'GWV Rebels', position: '' },
  { rank: 28, name: 'Archie Elliott', from: 'GWV Rebels', position: 'Forward' },
  { rank: 29, name: 'Kodah Edwards', from: 'South Adelaide (SANFL) / South Australia', position: 'Forward / midfield' },
  { rank: 30, name: 'Keenan Boi', from: 'Port Adelaide NGA', position: '' },
];
