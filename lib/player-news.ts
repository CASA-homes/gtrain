// Short stories on G-Train-rostered players with big recent news. Newest first.
// Updated by a daily scheduled news run: new stories go on top with a `date` (YYYY-MM-DD), the list is capped at 18.
// `player` matches players.name; the photo and G-Train owner are looked up from it.
export interface PlayerStory { player: string; tag: 'Trade' | 'Off-field' | 'Injury' | 'Retired' | 'Role'; title: string; body: string; date?: string }

export const PLAYER_NEWS: PlayerStory[] = [
  {
    player: 'C. Rozee', tag: 'Injury', date: '2026-11-10', title: 'Port confident Rozee is right for round 1',
    body: 'After a hamstring injury and nerve damage wiped out his 2026 from round 2, Rozee has started a running program on day one of Port’s pre-season. Club CEO Mathew Richardson says he’s very confident Rozee will be there for round 1. If that holds, Serong So’Right get back a mid who averaged over 100 in 2025.',
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
    player: 'L. Whitfield', tag: 'Trade', title: 'Whitfield crosses to Carlton',
    body: 'GWS’s long-time kick-in and half-back playmaker joins the Blues. Carlton need exactly that kind of ball user off half-back, so his role and kick-ins should carry over. Keep an eye on whether they push him into the midfield.',
  },
];
