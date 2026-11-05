// Short stories on G-Train-rostered players with big recent news. Newest first.
// Updated by a daily scheduled news run: new stories go on top with a `date` (YYYY-MM-DD), the list is capped at 18.
// `player` matches players.name; the photo and G-Train owner are looked up from it.
export interface PlayerStory { player: string; tag: 'Trade' | 'Off-field' | 'Injury' | 'Retired' | 'Role'; title: string; body: string; date?: string }

export const PLAYER_NEWS: PlayerStory[] = [
  {
    player: 'J. Gunston', tag: 'Role', date: '2026-11-05', title: 'Gunston faces a crowded Hawks forward line',
    body: 'Ben King’s arrival from Gold Coast means more competition up forward at Hawthorn, and the 35-year-old Gunston says it’s healthy and the coaches will sort the structure. He’s kicked 73 and 66 goals the last two years, but sharing the marking load with King could trim his scoring ceiling.',
  },
  {
    player: 'T. Green', tag: 'Injury', date: '2026-11-05', title: 'Green on track for round 1',
    body: 'Green says his ACL rehab is going really well and he’s expected back for round 1 against Adelaide, after knocking back Tasmania to stay at GWS. If that timeline holds, a Sheedy Medal-calibre mid is a big keeper win for NSW-ACT Academy.',
  },
  {
    player: 'J. Worrell', tag: 'Off-field', date: '2026-11-04', title: 'Worrell fined after court appearance',
    body: 'Adelaide’s Worrell pleaded guilty to driving without due care over hitting a pedestrian in July, and was convicted and fined $2,400 with no licence disqualification. He’s said he accepts full responsibility. No club or AFL ban has been reported, so as it stands his 2027 availability isn’t affected.',
  },
  {
    player: 'I. Heeney', tag: 'Off-field', date: '2026-11-04', title: 'Pullman saga takes a legal turn',
    body: 'Lawyers for two women involved in the Pullman Hotel incident have reportedly sent legal letters to Sydney and the five players stood down, Heeney included. Police laid no charges, and Heeney remains eligible for round 1 after winning the Swans best and fairest. Worth watching, but no new sanction has been announced.',
  },
  {
    player: 'J. Cameron', tag: 'Injury', date: '2026-10-29', title: 'Cameron’s arm still in a splint',
    body: 'Cameron had more surgery on the forearm he broke in last year’s grand final, and he admits he might have retired if he’d sat out 2026. The arm is in a splint until a 12-week review, so his pre-season will be interrupted. Hold off counting on a full-strength start.',
  },
  {
    player: 'T. Greene', tag: 'Trade', date: '2026-10-29', title: 'Greene joins Geelong as a free agent',
    body: 'Greene has left GWS and signed with Geelong as an unrestricted free agent, reuniting with Jeremy Cameron in the Cats’ forward line. Fantasy-wise expect a forward-first role in a deep side, so his midfield minutes and scoring ceiling may shrink.',
  },
  {
    player: 'B. Maynard', tag: 'Injury', date: '2026-10-29', title: 'Maynard: shoulder rebuilt, back in the new year',
    body: 'Collingwood’s Maynard had a shoulder reconstruction after the season and isn’t expected back in full training until the new year. A shortened pre-season makes him a slow-start risk for round 1.',
  },
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
    player: 'C. Mills', tag: 'Injury', title: 'Mills out with an ACL',
    body: 'A ruptured ACL likely rules him out for all of 2027. A huge blow for A Brayshaw Thing, who gave up Max Holmes to get him.',
  },
];
