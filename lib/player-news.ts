// Short stories on G-Train-rostered players with big recent news. Newest first.
// Updated by a daily scheduled news run: new stories go on top with a `date` (YYYY-MM-DD), the list is capped at 18.
// `player` matches players.name; the photo and G-Train owner are looked up from it.
export interface PlayerStory { player: string; tag: 'Trade' | 'Off-field' | 'Injury' | 'Retired' | 'Role'; title: string; body: string; date?: string }

export const PLAYER_NEWS: PlayerStory[] = [
  {
    player: 'C. Warner', tag: 'Trade', date: '2026-11-21', title: 'Eagles bank extra first for Warner tilt',
    body: 'West Coast swapped pick 23 for North’s 2027 first-rounder, giving them two firsts next year, and it’s being read as ammo for a bid on Warner, who is a restricted free agent at the end of 2027. The Eagles wouldn’t talk specifics and no offer has been reported, with Tasmania also keen. Nothing changes for 2027 scoring, but keepers holding him should watch where he lands for 2028.',
  },
  {
    player: 'S. Robey', tag: 'Injury', date: '2026-11-19', title: 'Robey to rejoin main group after Christmas',
    body: 'Mark McVeigh says Robey’s knee surgery for the partial medial ligament tear he copped in round 20 went really well, and he should be running in the next few weeks. The plan is to integrate him with the main group after Christmas. A bit of pre-season lost, but Bito’s Boys’ young keeper looks on track for an early-season start.',
  },
  {
    player: 'S. Darcy', tag: 'Injury', date: '2026-11-19', title: 'Darcy rehabbing in the US',
    body: 'Darcy has headed to the United States to keep working on the ACL he ruptured in round 6. Bontempelli says he looks really good and the Dogs are optimistic about an early-season return, though no date has been set. Only six games in 2026, so NSW-ACT Academy will be watching his summer closely before banking on round 1 tons.',
  },
  {
    player: 'S. Pendlebury', tag: 'Role', date: '2026-11-18', title: 'Pendlebury expects midfield minutes at Gold Coast',
    body: 'Pendlebury says Collingwood wanted him to stay in 2027 and move into coaching, but he picked the Suns’ deal of two playing years then two coaching under Damien Hardwick. Roles haven’t been locked in yet, though he expects to spend most of his time in the middle. Not kept by his G-Train side, so he’s a cheap draft punt if that midfield time is real.',
  },
  {
    player: 'N. Martin', tag: 'Role', date: '2026-11-18', title: 'Nic Martin takes the Bombers’ No.5',
    body: 'Essendon have handed Martin the No.5 for 2027, the number worn by Terry Daniher and James Hird. He switches from No.37 after further knee surgery wiped out his whole 2026. No fresh word on the knee, but if he gets a clean summer he’s a high-upside draft target since he wasn’t kept.',
  },
  {
    player: 'E. Tsatas', tag: 'Injury', date: '2026-11-17', title: 'Tsatas close to training at North',
    body: 'The former Bomber, delisted by Essendon and now at North Melbourne, is reportedly on the verge of training again after an ACL rupture wiped out his 2026. He’s played 83 games. Released by Ram Dawgs, so he’s a cheap late flier if he gets midfield time at Arden Street.',
  },
  {
    player: 'I. Heeney', tag: 'Off-field', date: '2026-11-16', title: 'Heeney back training with the Swans',
    body: 'Three days after police ruled out charges over the Pullman Hotel incident, Heeney trained with Swans teammates at Centennial Park on Monday. His club suspension only covered the rest of 2026 and no 2027 sanction has been announced. The reigning Swans best and fairest looks on track for a full summer, great news for Muzza’s Murabito’s.',
  },
  {
    player: 'C. Warner', tag: 'Off-field', date: '2026-11-16', title: 'Warner rejoins Swans teammates',
    body: 'Warner was also at Monday’s session after police confirmed he won’t be charged, and says he’s just planning to get back into footy. His club ban was for the rest of 2026 only, so nothing is stopping a normal pre-season. Such Is Fyfe can pencil in a mid who averaged 92 last year for round 1.',
  },
  {
    player: 'T. Greene', tag: 'Role', date: '2026-11-14', title: 'Greene settles in at Geelong',
    body: 'Fresh off his free agency move from GWS, Greene says he expects a similar role at the Cats: mostly forward with a bit of midfield, and high half-forward an option. He’s 33 but still averaged 86 in 2026. If he gets those midfield minutes under Chris Scott, Serong So’Right have a handy forward-line keeper.',
  },
  {
    player: 'G. Wardlaw', tag: 'Injury', date: '2026-11-13', title: 'Wardlaw nursing a minor MCL sprain',
    body: 'North say Wardlaw picked up a low-grade MCL sprain over the break and should rejoin the main group within a fortnight. It’s a small one, but after his run of hamstring dramas any missed pre-season is worth noting. Ram Dawgs will want him banking a full summer before trusting him as a keeper.',
  },
  {
    player: 'N. Blakey', tag: 'Injury', date: '2026-11-13', title: 'Blakey back to group skills in December',
    body: 'Blakey had an off-season procedure on his AC joint and the Roos expect him to move into group skills in December. That leaves plenty of time before round 1, so there’s no real alarm for a defender who averaged 86 in 2026.',
  },
  {
    player: 'T. Powell', tag: 'Injury', date: '2026-11-13', title: 'Powell stays on a modified program',
    body: 'Powell has joined some team skills but North have him on a modified program for roughly another six weeks. He only managed eight games in 2026, so a clean run into January matters if he’s going to push for regular midfield minutes.',
  },
  {
    player: 'C. Rozee', tag: 'Injury', date: '2026-11-11', title: 'Rozee in drills, Port bullish on round 1',
    body: 'Port high-performance boss Tim Parham says Rozee is now training in drills after a minor UK procedure to clear scar tissue around the nerve in his torn hamstring, though he’s not quite at full speed. Parham is bullish about round 1 against North Melbourne, roughly four and a half months off. If he gets there, Serong So’Right get back a mid who averaged over 100 in 2025.',
  },
  {
    player: 'J. Viney', tag: 'Role', date: '2026-11-10', title: 'Viney hits the ground running at West Coast',
    body: 'The 32-year-old ex-Demon was the last off the track on the Eagles’ first day back, doing a heavy running and skills session alongside young mid Bo Allan. West Coast recruited him for his midfield craft, so expect plenty of centre time in a rebuilding side. A fit Viney in a big midfield role is a handy bounce-back option after he managed just one game in 2026.',
  },
  {
    player: 'H. Reid', tag: 'Injury', date: '2026-11-10', title: 'Reid modified on day one, banned rounds 1–2',
    body: 'Reid did a modified session on the Eagles’ first day back, running and agility work but no footy drills, after his end-of-season shoulder clean-up. No return date has been given. He still carries a two-match ban for a dangerous tackle into 2027, so he misses the first two rounds regardless.',
  },
  {
    player: 'Z. Williams', tag: 'Retired', date: '2026-11-09', title: 'Zac Williams calls it a day',
    body: 'Delisted by Carlton at the end of 2026 and not picked up elsewhere, Williams has announced his retirement after 183 games across GWS and Carlton. He won’t be on an AFL list in 2027, so he’s no use to anyone’s fantasy side.',
  },
  {
    player: 'D. Prestia', tag: 'Retired', date: '2026-11-09', title: 'Prestia retired, now a Hawks coach',
    body: 'Prestia retired at the end of 2026 and has been unveiled as a development coach at Hawthorn. Separately, he and Steven May are reportedly facing a civil lawsuit over a 2024 pub incident, after the criminal charges were dropped in May. Either way, he’s done as a player, so scratch him from fantasy plans.',
  },
  {
    player: 'B. Daniels', tag: 'Injury', date: '2026-11-08', title: 'Daniels on track before Christmas',
    body: 'GWS say Daniels is managing a soft-tissue issue but should be in full pre-season training before Christmas, with his load modified early. Not a long-term worry, so he looks a safe keeper for Serong So’Right if he stays on the park.',
  },
];
