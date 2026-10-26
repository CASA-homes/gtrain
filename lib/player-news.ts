// Short stories on G-Train-rostered players with big recent news. Newest first. Update as news breaks.
// `player` matches players.name; the photo and G-Train owner are looked up from it.
export interface PlayerStory { player: string; tag: 'Trade' | 'Off-field' | 'Injury' | 'Retired' | 'Role'; title: string; body: string }

export const PLAYER_NEWS: PlayerStory[] = [
  {
    player: 'J. Short', tag: 'Role', title: 'Short’s Collingwood move falls over',
    body: 'Short tried to get to Collingwood in the trade period, but the clubs couldn’t agree on the final day and he’s back at Richmond for the last year of his contract. Fantasy-wise that’s good news: he keeps his spot as the Tigers’ main half-back ball user and kick-in taker, with a new deal to play for.',
  },
  {
    player: 'H. Reid', tag: 'Injury', title: 'Reid: shoulder fixed, but banned for rounds 1–2',
    body: 'West Coast’s best and fairest winner had a shoulder clean-up after the season and will be ready for pre-season in November. The catch for fantasy: he carries a two-match ban for a dangerous tackle into 2027, so he misses the first two rounds.',
  },
  {
    player: 'L. Whitfield', tag: 'Trade', title: 'Whitfield crosses to Carlton',
    body: 'GWS’s long-time kick-in and half-back playmaker joins the Blues. Carlton need exactly that kind of ball user off half-back, so his role and kick-ins should carry over. Keep an eye on whether they push him into the midfield.',
  },
  {
    player: 'J. Ridley', tag: 'Trade', title: 'Ridley gets a fresh start at Geelong',
    body: 'After two injury-hit years at Essendon, Ridley moves to the Cats. At his best he’s an intercepting half-back who scores in the 80s; Geelong’s system has been kind to that type. A cheap bounce-back option if his body holds up.',
  },
  {
    player: 'T. Rivers', tag: 'Trade', title: 'Rivers heads west to the Eagles',
    body: 'Rivers leaves Melbourne for West Coast, where he should get a bigger midfield share than he did behind the Demons’ stars. More centre bounces would lift him back toward his 2025 scoring.',
  },
  {
    player: 'J. Viney', tag: 'Trade', title: 'Viney joins him at West Coast',
    body: 'The ex-Demons skipper also lands at the Eagles after barely playing in 2026. Still an elite contested ball winner when fit, but at 32 and coming off a lost year, treat him as a depth piece rather than a starter.',
  },
  {
    player: 'Z. Butters', tag: 'Trade', title: 'Butters lands at the Bulldogs',
    body: 'The biggest fantasy move of the trade period. Butters leaves Port for the Western Bulldogs and walks into one of the best midfields in the comp. Expect plenty of the ball, but less of the centre-bounce monopoly he had at Alberton. He also had a minor ankle clean-up in October and says he’ll be right for round 1.',
  },
  {
    player: 'I. Heeney', tag: 'Off-field', title: 'Pullman Hotel fallout, then a best and fairest',
    body: 'Sydney banned Heeney, Blakey, Warner, Bice and Jordon for the rest of 2026 amid a police investigation into an incident at the Pullman Hotel. Heeney still won the Swans best and fairest off what he’d banked before it. Watch for any further sanctions before round 1.',
  },
  {
    player: 'R. Marshall', tag: 'Trade', title: 'Marshall heads to Geelong',
    body: 'After years sharing the ruck at St Kilda, Marshall moves to the Cats. If he wins the No.1 job outright, his around-the-ground game makes him a genuine premium ruck option again.',
  },
  {
    player: 'N. Blakey', tag: 'Trade', title: 'Blakey starts fresh at North',
    body: 'Out of Sydney after the Pullman ban and into North Melbourne. A rebuilding club should give him a big half-back role, which is where his best scores have come from.',
  },
  {
    player: 'Z. Merrett', tag: 'Trade', title: 'Merrett joins Hawthorn at 31',
    body: 'Leaves Essendon after a decade as their ball magnet. At Hawthorn he’s one of several on-ballers, so expect a drop in raw possessions.',
  },
  {
    player: 'L. Neale', tag: 'Trade', title: 'Neale to the Pies',
    body: 'The Brownlow medallist swaps Brisbane for Collingwood at 33. Still a high-floor midfielder, but the age curve is the risk.',
  },
  {
    player: 'S. Pendlebury', tag: 'Trade', title: 'Pendlebury goes north',
    body: 'One more chapter, this time at Gold Coast. Elite skills, and he could play a quarterback role off half-back. Low ceiling, high floor.',
  },
  {
    player: 'K. Briggs', tag: 'Role', title: 'Briggs gets his own ruck at Richmond',
    body: 'Moves from GWS to Richmond, where he should be the No.1 ruck from day one. A full-time ruck role could push his scoring up.',
  },
  {
    player: 'K. Coleman', tag: 'Trade', title: 'Coleman crosses to Essendon',
    body: 'Leaves the Lions for a bigger role at the Bombers. A clean run at half-back should lift his scoring.',
  },
  {
    player: 'C. Mills', tag: 'Injury', title: 'Mills out with an ACL',
    body: 'A ruptured ACL likely rules him out for all of 2027. A huge blow for A Brayshaw Thing, who gave up Max Holmes to get him.',
  },
  {
    player: 'T. Liberatore', tag: 'Retired', title: 'Libba calls it a day',
    body: 'One of the great tacklers retires. Serong lose a reliable midfield scorer from their keeper list.',
  },
];
