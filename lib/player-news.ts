// Short stories on G-Train-rostered players with big recent news. Newest first.
// Updated by a daily scheduled news run: new stories go on top with a `date` (YYYY-MM-DD), the list is capped at 18.
// `player` matches players.name; the photo and G-Train owner are looked up from it.
export interface PlayerStory { player: string; tag: 'Trade' | 'Off-field' | 'Injury' | 'Retired' | 'Role'; title: string; body: string; date?: string }

export const PLAYER_NEWS: PlayerStory[] = [
  {
    player: 'S. Draper', tag: 'Injury', date: '2026-11-26', title: 'Sid Draper’s pre-season delayed by surgery',
    body: 'Adelaide’s young on-baller has had surgery to decompress the arteries behind his knees after soreness while running, and won’t be back running until the end of January. It’s another interrupted summer for the 2024 pick four, who didn’t play a senior game in 2026. Pato’s Fantasy Team shouldn’t bank on much from him early in 2027.',
  },
  {
    player: 'L. Duggan', tag: 'Injury', date: '2026-11-25', title: 'Duggan sidelined after knee scope',
    body: 'West Coast’s co-captain had an arthroscope on his knee over the off-season and will spend some time on the sidelines, with the Eagles still working through his timeline. Released by Bito’s Boys after averaging 75 in 2026, he’s a draft option to treat with caution until there’s a return date.',
  },
  {
    player: 'C. Nash', tag: 'Injury', date: '2026-11-25', title: 'Nash nearly cleared after neck surgery',
    body: 'Nash is back training with the Hawks and doing everything bar full contact after the neck surgery that ended his 2026 in August. He’s on track to be cleared for full training before Christmas. A Brayshaw Thing let him go, so a clean summer makes him a handy late midfield pick.',
  },
  {
    player: 'J. Waterman', tag: 'Injury', date: '2026-11-25', title: 'Waterman eased in on load management',
    body: 'The Eagles have Waterman on a managed load as he works back into the program, with full training hoped for later this week. Nothing alarming yet for a forward who played all 23 games in 2026 at a 72 average.',
  },
  {
    player: 'N. Wanganeen-Milera', tag: 'Injury', date: '2026-11-24', title: 'Nasiah back in full training early',
    body: 'Wanganeen-Milera is already doing full pre-season work at St Kilda after the hamstring strain that finished his 2026 in round 22. A clean summer is exactly what Pato’s Fantasy Team want from a keeper who averaged 105 last year.',
  },
  {
    player: 'J. Sinclair', tag: 'Injury', date: '2026-11-24', title: 'Sinclair over his calf tear',
    body: 'Sinclair has rejoined full training this week after a torn calf cost him the last eight games of 2026. He was still averaging 99 before it went, so Such Is Fyfe’s keeper looks set for a normal run at round 1.',
  },
  {
    player: 'T. De Koning', tag: 'Injury', date: '2026-11-24', title: 'De Koning modified after shoulder surgery',
    body: 'The Saints have De Koning on a modified program while he rehabs off-season shoulder surgery, with the club expecting him to be training properly after Christmas. His average slid from 85 to 64 in 2026, so NSW-ACT Academy will want a full January out of him.',
  },
  {
    player: 'D. Wilson', tag: 'Role', date: '2026-11-24', title: 'Wilson wins fourth straight Saints time trial',
    body: 'Wilson took out St Kilda’s time trial at Moorabbin again on Tuesday, making it four from four since he was drafted. Fresh off an 83 average in 2026, his tank is in great shape heading into a big summer for the Bodega Boys keeper.',
  },
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
];
