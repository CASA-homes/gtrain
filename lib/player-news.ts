// Short stories on G-Train-rostered players with big recent news. Newest first.
// Updated by a daily scheduled news run: new stories go on top with a `date` (YYYY-MM-DD), the list is capped at 18.
// `player` matches players.name; the photo and G-Train owner are looked up from it.
export interface PlayerStory { player: string; tag: 'Trade' | 'Off-field' | 'Injury' | 'Retired' | 'Role'; title: string; body: string; date?: string }

export const PLAYER_NEWS: PlayerStory[] = [
  {
    player: 'T. Greene', tag: 'Role', date: '2026-11-14', title: 'Greene settles in at Geelong',
    body: 'Fresh off his free agency move from GWS, Greene says he expects a similar role at the Cats: mostly forward with a bit of midfield, and high half-forward an option. He’s 33 but still averaged 86 in 2026. If he gets those midfield minutes under Chris Scott, Serong So’Right have a handy forward-line keeper.',
  },
  {
    player: 'I. Heeney', tag: 'Off-field', date: '2026-11-14', title: 'Police drop Pullman matter, civil claims loom',
    body: 'Victoria Police confirmed no criminal charges will be laid over the Pullman Hotel incident, citing insufficient evidence, though civil claims are still being prepared. The AFL says it could revisit things if new information surfaces. No 2027 sanction has been announced, so Heeney, last season’s Swans best and fairest, looks set for round 1.',
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
    player: 'S. Pendlebury', tag: 'Trade', date: '2026-11-12', title: 'Pendlebury flags the No.7 at the Suns',
    body: 'The games record holder, traded to Gold Coast on a two-year deal after Collingwood moved on, has added a 7 to his Instagram bio, a strong hint he’ll wear the Suns’ No.7 in 2027. He’s 39 in January but still averaged 79 this year. Released by his G-Train side, so he’s a cheap draft option if the Suns give him real midfield minutes.',
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
  {
    player: 'P. Gothard', tag: 'Injury', date: '2026-11-08', title: 'Gothard back from shoulder surgery in January',
    body: 'The Giants confirmed Gothard had shoulder surgery and is tracking towards full training in January. Missing the first chunk of pre-season puts his early-round spot in a strong forward line at some risk, so don’t bank on him from round 1.',
  },
  {
    player: 'T. Green', tag: 'Injury', date: '2026-11-07', title: 'Green re-signs, eyes round 1',
    body: 'Green has signed a two-year extension at GWS after knocking back rival interest, and says his ACL rehab is going really well. The Giants have him pencilled in for full training around January, with round 1 against Adelaide the target. If that holds, a Sheedy Medal-calibre mid is a big keeper win for NSW-ACT Academy.',
  },
  {
    player: 'F. Callaghan', tag: 'Injury', date: '2026-11-07', title: 'Callaghan had late-season ankle surgery',
    body: 'GWS have confirmed Callaghan went under the knife on his ankle late in 2026, and he’s aiming to be back in full training around January. That’s a chunk of pre-season on the side, so temper expectations for his early-round scoring.',
  },
  {
    player: 'L. Pedlar', tag: 'Role', date: '2026-11-06', title: 'Pedlar wants midfield minutes at Port',
    body: 'Fresh from crossing from the Crows, Pedlar says he’s keen to train more as a midfielder under Josh Carr while still growing his forward game. Injuries have limited him to 49 games in six years, so a full pre-season is the priority. More midfield time would lift his ceiling, but he’s a speculative pick until his body holds up.',
  },
  {
    player: 'J. Gunston', tag: 'Role', date: '2026-11-05', title: 'Gunston faces a crowded Hawks forward line',
    body: 'Ben King’s arrival from Gold Coast means more competition up forward at Hawthorn, and the 35-year-old Gunston says it’s healthy and the coaches will sort the structure. He’s kicked 73 and 66 goals the last two years, but sharing the marking load with King could trim his scoring ceiling.',
  },
  {
    player: 'J. Worrell', tag: 'Off-field', date: '2026-11-04', title: 'Worrell fined after court appearance',
    body: 'Adelaide’s Worrell pleaded guilty to driving without due care over hitting a pedestrian in July, and was convicted and fined $2,400 with no licence disqualification. He’s said he accepts full responsibility. No club or AFL ban has been reported, so as it stands his 2027 availability isn’t affected.',
  },
];
