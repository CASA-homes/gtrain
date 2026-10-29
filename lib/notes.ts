// Hand-written context for players whose numbers don't tell the whole story:
// role changes, 2026 trades, injuries, off-field. Keyed by "Name|current AFL club".
// The verdict label is rule-based (see verdictFor in scouting.ts); outlook is shown in the Outlook section of the report.

export type Verdict =
  | 'Fantasy star' | 'Fantasy gun' | 'Great fantasy player' | 'Reliable starter' | 'Depth piece' | 'Role dependent'
  | 'Win-now asset' | 'Sell now' | 'Bounce-back candidate' | 'Too early to tell' | 'Unknown quantity'
  | 'Potential fantasy star' | 'Potential great fantasy player' | 'Potential good fantasy player';

/**
 * outlook: shown in the player's report.
 * delta: points added to his projected 2027 average for things the numbers can't see (role change, trade, ruck share).
 */
export interface Note { outlook: string; delta?: number }

export const NOTES: Record<string, Note> = {
  // ---------------------------------------------------------------- the ones you asked about
  'D. Wilson|STK': {
    delta: 6,
    outlook: 'The jump from 64 to 83 came from St Kilda trusting him with midfield minutes in patches (16% of centre bounces, up from almost none). That’s the whole story with Wilson: he’s a half-back-flanker scorer who turns into a ball magnet when he goes on-ball. If the Saints make the move permanent, this is a 95–100 player within two years. If they don’t, he’s a high-80s keeper. Either way the arrow is pointing up.',
  },
  'K. Coleman|ESS': {
    delta: 10,
    outlook: 'Keidean Coleman swaps Brisbane for Essendon, and he’ll play off half-back, where he’s always scored best. The Bombers’ back half needs a kicker, so he should take the kick-ins and run the rebound chain rather than share it with a stacked Lions defence. That’s a low-80s player when he’s on the park. The catch is the body: he managed one game in each of 2024 and 2025. Buy the upside, but keep a backup.',
  },
  'L. Ash|GWS': {
    delta: 6,
    outlook: 'Ash went from 76 to 100 to 103 over the last three years, and the main man he shared the GWS back half with, Lachie Whitfield, has just been traded to Carlton. That leaves Ash as the undisputed kick-in taker and the first look out of defence. He should keep dominating, and there’s a case he goes up again in 2027.',
  },
  'B. Hill|STK': {
    delta: -14,
    outlook: 'A career year. Hill averaged 100 after three straight seasons around 74–76, and a lot of that was the ball finding the outside runner while Flanders and Wanganeen-Milera were in and out. With both back and fit, the Saints’ outside ball gets shared three ways again. Expect him back in the 80s. If anyone in the league is paying for the 100, take the money.',
  },
  'S. Cumming|RIC': {
    outlook: 'Pick 7 in 2025, straight into a rebuilding Richmond side. Fourteen games at 59, with 43% of centre bounces in his first year, is a better start than it looks: the typical first-year average sits around 55, and he got there on a young, rebuilding team that spent plenty of time without the ball. With a bigger tank and a better side around him, he’s a potential great fantasy player.',
  },
  'D. Robertson|WCE': {
    outlook: 'An unknown quantity who could score well in the right role. Injuries and a lack of opportunity have limited him to 10 games in three years. But in his four games in 2026 he went to 52% of centre bounces and averaged 74, which hints at what he can do as an inside mid. A cheap flyer who could be a 90 player if West Coast hand him a midfield spot and he stays on the park.',
  },

  // ---------------------------------------------------------------- off-field
  'L. Cowan|CAR': {
    delta: -2,
    outlook: 'Starts 2027 serving a two-match AFL ban (a strike under the illicit drugs policy), so pencil him in from Round 3. On the field he’s a steady low-60s half-back with 24 games last year, which makes him a bench option rather than a starter. Off the field, maybe don’t make him the designated driver for the end-of-season trip. Lachie Whitfield’s arrival also means less of the Carlton half-back ball comes his way.',
  },
  'N. Blakey|NTH': {
    delta: 4,
    outlook: 'He was one of five Swans stood down by the club for the rest of 2026 after a team-hotel standards breach, and the fallout ended with a trade to North Melbourne. Footy-wise it could be the best thing for his scoring: at Sydney he was one of several rebounders, but at North he’ll be the main man off half-back. He’s been mid-80s for two years already. A fresh start and more of the ball make 90+ realistic.',
  },
  'I. Heeney|SYD': {
    outlook: 'One of the five Swans the club stood down for the rest of 2026 after the team-hotel breach, so he missed Sydney’s finals. That shouldn’t touch his value. He averaged 106 with 74% of centre bounces before the suspension, and he stays at Sydney. Expect a quiet off-season and a premium midfielder again in 2027.',
  },
  'C. Warner|SYD': {
    outlook: 'Caught up in the Swans’ team-hotel suspension along with four teammates, so his 2026 ended before the finals. On-field he’s been remarkably steady: 88 to 93 four years running with around 60% of centre bounces. A safe low-90s mid who won’t win you a week but won’t lose you one either.',
  },
  'R. Bice|SYD': {
    delta: 4,
    outlook: 'He jumped from 57 to 76 in his second season before he was one of the five Swans stood down after the team-hotel breach. With Blakey now gone to North, the half-back role Bice has been covering should get bigger. There’s upside if Sydney hand him Blakey’s rebound minutes.',
  },

  // ---------------------------------------------------------------- 2026 trades
  'Z. Butters|WBD': {
    delta: -3,
    outlook: 'Four straight seasons at 100+, now in red, white and blue. The one worry is crowding: the Dogs already have Bontempelli and Sanders at the centre bounces (Liberatore has retired, which helps), and Butters lived on 81% at Port. He’s too good to drop below 95, but his ceiling might be tighter in 2027 than it was at Alberton.',
  },
  'L. Whitfield|CAR': {
    delta: 12,
    outlook: 'He’s 32, and he’s just moved from GWS to Carlton for one more crack. He’s been 96–110 for four years as the kick-in king, and Carlton will make him their No.1 man off half-back, so the commish’s call is the same output: another high-90s year. The drop is coming eventually, so treat him as a 2027–28 asset rather than a long-term keeper.',
  },
  'Z. Merrett|HAW': {
    delta: -4,
    outlook: 'Ten years an Essendon ball magnet (100+ for four straight seasons), now traded to Hawthorn. He’ll be a big part of the Hawks’ midfield, though he’ll share it more than he did at Essendon, where he was often a one-man band. Expect a small dip to the mid-90s and hold for the next two seasons.',
  },
  'S. Pendlebury|GCS': {
    delta: -6,
    outlook: 'He’s 38 and has left Collingwood for one last lap on the Gold Coast. The footy IQ is still there, but he averaged 79 last year on 68% time on ground. He’s a sentimental keeper at best.',
  },
  'L. Neale|COL': {
    outlook: 'He’s heading to Collingwood, which makes him effectively a straight swap for Pendlebury in the Pies’ midfield. He’s 33 but still averaged 99 with 78% of centre bounces and 6.7 clearances last year. Neale is good for one or two more 90+ seasons, and the decline at his age tends to be sudden.',
  },
  'T. Rivers|WCE': {
    outlook: 'He’s moved from Melbourne to West Coast. At the Dees he was a half-back without many centre bounces (8%). The Eagles want more midfield class, and if he gets it he’s a mid-80s player with room to grow. If he stays a defender, he’s a 77–82 keeper.',
  },
  'J. Viney|WCE': {
    outlook: 'He played one game in 2026 and has now moved to West Coast in the twilight of his career. He was an 87–98 player when fit, but at 32 and coming off a lost year, he’s a bench stash until he proves otherwise.',
  },
  'S. Marshall|STK': {
    outlook: 'He’s gone from Brisbane to St Kilda after only 13 games in two years. He’ll get a much clearer path at the Saints. At 20 he’s a genuine unknown, but the move suggests the Saints see a role for him.',
  },
  'R. Marshall|GEE': {
    delta: 24,
    outlook: 'He’s a 201cm ruck, not a forward: a three-time Silk–Miller medallist who averaged 106–117 from 2023 to 2025 as St Kilda’s No.1 ruck. His 2026 dip to 83 came from sharing the ruck with Tom De Koning (about 50% of contests), not from losing it. Geelong paid pick 14 for him to be their main man, and the commish’s call is that he’ll be the dominant ruck there, so expect him back in the high 90s to 100. He turns 31 next month, so it’s a two-to-three-year window.',
  },
  'J. Ridley|GEE': {
    outlook: 'Seven games in 2026 at 57, and he’s now gone from Essendon to Geelong. He was an 81–88 rebounder at his best, but the body has been the issue for three years. A cheap punt for the bench.',
  },
  'J. Bowes|ESS': {
    outlook: 'He’s gone from Geelong to Essendon. Nine games at 70 last year, and he’s been hard to rely on for years. Bench cover only.',
  },
  'N. O\'Driscoll|RIC': {
    delta: 4,
    outlook: 'He’s moved from Fremantle to Richmond, where midfield minutes are there for the taking. He’s been a low-60s half-back for four years. The move is his best chance yet at a bigger role.',
  },
  'K. Briggs|RIC': {
    delta: 10,
    outlook: 'He’s leaving GWS for Richmond, and that’s a big deal for his fantasy value. He was a 92-average ruck in 2023–24, then fell to 72 over the last two seasons. At the Tigers he should be the No.1 ruck, so a return to the 90s is realistic. Note this hurts Nankervis.',
  },
  'T. Nankervis|RIC': {
    delta: -15,
    outlook: 'Richmond just traded for Kieren Briggs, and that’s a direct threat to Nankervis’ ruck minutes. At 32 and likely to be splitting the ruck load, a sharp drop is the likely outcome. Move him on if anyone still rates him.',
  },
  'T. Greene|GEE': {
    outlook: 'He’s 33 and has moved from GWS to Geelong. He’s a forward who scored 86 in 2026, mostly from goals and pressure, and that kind of scoring is up and down by nature. At the Cats he’ll be one of several forward targets. Keep him for 2027 and plan around him after that.',
  },
  'L. Pedlar|PTA': {
    outlook: 'He’s back home at Port Adelaide after leaving Adelaide. He averaged 45–47 in two seasons of limited minutes. The move may free him up, but he’s bench depth until he shows otherwise.',
  },

  // ---------------------------------------------------------------- notable keepers
  'N. Daicos|COL': {
    outlook: 'The best player in the competition for fantasy, and he’s only 23. He averaged 117 with 34.7 disposals and 79% of centre bounces, and he has topped 100 four years running. With Pendlebury gone, the Collingwood midfield is even more his. There’s no reason his potential isn’t still 5 stars.',
  },
  'H. Sheezel|NTH': {
    outlook: 'He’s 22, averaged 116 with 30.5 disposals, and has gone to 61% of centre bounces. He’s already a top-three fantasy player. North keep adding talent around him, which only helps. A long-term cornerstone.',
  },
  'M. Gawn|MEL': {
    outlook: 'Still elite at 34, averaging 110 for the third straight year. But rucks fall off fast, and he’s on borrowed time. Keep him for the 2027 flag push and don’t pay for 2028.',
  },
  'M. Bontempelli|WBD': {
    delta: -3,
    outlook: 'He averaged 102 at 30, a slight dip from his 106–117 prime. Butters’ arrival means the Dogs’ centre bounces get shared, so he could drift into the mid-90s. Still a premium for another season, but his best years are behind him.',
  },
  'H. Reid|WCE': {
    outlook: 'The No.1 pick in 2023 finally made the jump from 67 to 78 in 2026, with 80% of centre bounces, 13.4 contested possessions and 6.6 clearances. Those are elite inside-mid numbers for a 21-year-old. His kicking efficiency is what holds the score back. If it tidies up, he’s a 100+ player, and he’s a potential fantasy star.',
  },
  'W. Duursma|WCE': {
    outlook: 'The No.1 pick in 2025 averaged 72 in his first season, well above the roughly 55 a typical first-year averages, and he already attended 30% of centre bounces. With Reid beside him, the Eagles’ midfield is being rebuilt around the two of them. He’s a potential fantasy star.',
  },
  'D. Annable|BRL': {
    outlook: 'Pick 6 in 2025, but he only played 3 games in a strong, settled Brisbane side. The pedigree is real, but there’s no scoring history to back it yet. Give him two years: if he’s still on the fringe in 2028, the draft shine fades fast.',
  },
  'H. Dean|CAR': {
    outlook: 'Pick 3 in 2025, and he played all 22 games in his first year, but as a key defender who averaged 50. Tall defenders rarely become fantasy scorers. He’s a much better real-life player than a fantasy one.',
  },
  'S. Lalor|RIC': {
    outlook: 'The No.1 pick in 2024 had his second year interrupted, playing 12 games at 63, up from 54. He went to 48% of centre bounces, which is the role you want. With Cumming growing alongside him and a better team coming, he’s a potential great fantasy player. He just has to string 20 games together.',
  },
  'J. Smillie|RIC': {
    outlook: 'Pick 7 in 2024 and still waiting on his AFL debut. He’s an unknown quantity: the talent got him drafted early, but two years without a senior game is a worry. He could score well in a midfield role if Richmond give him one.',
  },
  'J. Smith|CAR': {
    outlook: 'Pick 3 in 2024 and an immediate hit. He averaged 82 across 25 games in his first full season, with 56% of centre bounces and 24.8 disposals. That’s 27 points above a typical first-year average. He’s a potential fantasy star and should be locked in as a keeper.',
  },
  'F. O\'Sullivan|NTH': {
    outlook: 'Pick 2 in 2024. He jumped from 54 to 72 in his second year and got 68% of centre bounces. North’s midfield runs through Sheezel, but O’Sullivan is the clear No.2. Another 10-point jump makes him a genuine starter.',
  },
  'L. Ashcroft|BRL': {
    delta: 4,
    outlook: 'Pick 5 in 2024. He’s played all 54 games of his career and gone from 72 to 77, mostly on a wing and half-back. Like his brother Will, he could take off once the Lions move him on-ball. Lachie Neale’s move to Collingwood also frees up midfield minutes at Brisbane, which helps his case.',
  },
  'L. Humphries|GEE': {
    delta: -2,
    outlook: 'A late pick who has outscored most of his draft class. He went from 70 to 81 in 2026 off half-back at 23, which is well above where defenders his age usually sit. Geelong use him as a ball-user off the back flank, and that role suits fantasy scoring. Trending towards 90. Jordan Ridley’s arrival from Essendon adds competition for the Geelong half-back ball, so expect a small dip.',
  },
  'J. Fonti|GWS': {
    delta: 4,
    outlook: 'Averaged 38, then 50, then 73 across his first three seasons, which is as steep a curve as anyone on a list. He’s a 21-year-old defender who’s only now getting full games (82% time on ground). With Whitfield gone from the GWS back half, there are more kicks out of defence going begging. A 3-star player today with 4.5-star upside.',
  },
  'M. Herbert|WCE': {
    delta: -2,
    outlook: 'A mature-age rookie who arrived at 23 and averaged 76 over 10 games, including 104 and 118 in his last two. That’s an eye-catching start, but it’s a small sample. Rookie keeper slot material: cheap to hold and could be a genuine find. Rivers and Viney arriving from Melbourne adds midfield bodies at West Coast, which makes his path to minutes a bit harder.',
  },
  'G. Hewett|CAR': {
    outlook: 'Back-to-back years in the 90s (99, then 90) as Carlton’s stoppage worker. He turns 31 in December, though, and midfielders his age tend to fade fast. His current value is a 4-star season, but he’s a 3-star keep from here.',
  },
  'J. Dunkley|BRL': {
    delta: 3,
    outlook: 'A 103–108 player for three years before dipping to 94 in 2026. He’s 29 and Brisbane’s midfield is deep, so the 2026 drop might be the start of a gentle slide rather than a blip. Still a 4-star keeper for the next season or two. With Neale now gone to Collingwood, though, there’s more midfield ball to go around, which should slow that slide.',
  },
  'O. Wines|PTA': {
    delta: 2,
    outlook: 'He’s 32 and averaged 78 in 2026, down from 90. His time on ground dropped to 65%, which is the giveaway. 2027 might be his last season. Keep him only if your mid-bench is empty. Butters’ exit does free up some Port midfield minutes, which should soften the drop.',
  },
  'E. Tsatas|ESS': {
    outlook: 'Delisted by Essendon after the 2026 season. That’s a brutal end for pick 5 in 2022. When he played in 2026 he averaged 79 with 59% of centre bounces, so the talent was never the question; the body was. He has no AFL club right now, so he’s worth nothing for 2027 unless someone picks him up. Keep an eye on the rookie lists.',
  },

  'A. Cadman|GWS': {
    delta: 4,
    outlook: 'The No.1 pick in 2022, but he’s a key forward, and in fantasy terms that shows: 61 average with almost no midfield time. He’s a better real-life player than a fantasy one. Don’t let the draft number fool you. With Toby Greene (Geelong) and Jesse Hogan (Collingwood) both gone, though, he becomes the Giants’ main target up forward, which should lift him a few points.',
  },
  'G. Wardlaw|NTH': {
    outlook: 'Pick 4 in 2022. When fit, he’s a tackling-heavy inside mid (5.4 tackles a game). But at 61% time on ground and 72 average, North are still managing his minutes. With a full load, he’s an 85+ player.',
  },
  'C. McKercher|NTH': {
    delta: -3,
    outlook: 'Pick 2 in 2023. He started hot at 82 but has drifted to 78, then 76, as a half-back. He’s a steady 76–82 defender rather than the star the draft number suggested, unless North move him into the midfield. Nick Blakey’s arrival from Sydney makes that harder: Blakey will take a lot of North’s half-back ball.',
  },
  'Z. Uwland|GCS': {
    outlook: 'Pick 2 in 2025. He averaged 58 as a first-year defender, about what you’d expect. Bodhi Uwland’s 12.2 rating points a game off the same Suns half-back line show what that role can become. Give it two years.',
  },
  'J. Farrow|ESS': {
    delta: -2,
    outlook: 'Pick 10 in 2025. He averaged 72 as a first-year, 17 points above the norm, and played all 21 games. He’s a ball-user off the half-back, a role that scores well. One to hold. Keidean Coleman’s arrival from Brisbane means he’ll share the kick-ins and rebound, so expect a small dip.',
  },
  'S. Robey|ESS': {
    delta: 3,
    outlook: 'Pick 9 in 2025. He averaged 62 in his first year, but the underlying numbers are better: 33% of centre bounces, 7.3 contested possessions and 3.7 clearances in limited time. He’s an inside-mid prospect at an Essendon side that’s rebuilding its midfield. Zach Merrett’s move to Hawthorn opens up even more Essendon midfield time for him.',
  },
  'T. Travaglia|STK': {
    outlook: 'Pick 8 in 2024, but he’s managed only 18 games across two years at 46–47. St Kilda’s midfield is crowded with Flanders, Wanganeen-Milera and now Wilson pushing in. He needs a role first.',
  },
  'S. Flanders|STK': {
    outlook: 'He averaged 108 in 2024, then 67 in an injury-hit 2025, then 92 in 2026. His back-to-health status is exactly why Brad Hill’s numbers are likely to come back. He should settle around 95 with a full year.',
  },
  'N. Wanganeen-Milera|STK': {
    outlook: 'He’s gone from 92 to 98 to 111 to 105 since turning 20, and has moved into the midfield (55% of centre bounces). He’s 23 with elite ball use. One of the best long-term keepers in the league.',
  },
  // ---------------------------------------------------------------- out for 2027
  'D. Prestia|RIC': {
    outlook: 'Retired at the end of 2026. He went out with 17 games and showed he could still win his own ball, but he scores nothing from here. Free up the list spot.',
  },
  'T. Liberatore|WBD': {
    outlook: 'Retired after the 2026 season. One of the great tacklers of his era and a fantasy stalwart for a decade, but he won’t score a point in 2027. His retirement does open up centre bounces for Butters and Sanders at the Dogs.',
  },
  'A. Treloar|WBD': {
    outlook: 'Retired after the Bulldogs chose not to offer him another contract. That ends a 16-season career across three clubs. He had a lot of 100-point seasons, but he’s now a list spot to clear.',
  },
  'C. Mills|SYD': {
    outlook: 'Tore his ACL in the 2026 qualifying final. Sydney have flagged he could miss the whole of 2027, and he turns 30 next April. Only keep him if you’ve got the list space to wait a year.',
  },
  'Z. Williams|CAR': {
    outlook: 'Delisted by Carlton after nine games in 2026. Injuries have dogged him for years. Unless another club picks him up, he has no 2027 value.',
  },
  'T. Sonsie|RIC': {
    outlook: 'Delisted by Richmond. He showed flashes as a ball-winning forward, but he has no AFL club for 2027 right now. Watch the rookie and pre-season supplemental lists.',
  },
  'C. Idun|GWS': {
    delta: 2,
    outlook: 'Lachie Whitfield’s move to Carlton opens up kicks out of the GWS back half. Idun is more stopper than rebounder, but he should see a few more of them. A small bump.',
  },
  'B. Daniels|GWS': {
    delta: 3,
    outlook: 'Greene’s exit leaves a spot in the GWS forward-half rotation, and Daniels is one of the obvious players to fill it once he’s back from injury.',
  },
  'P. Gothard|GWS': {
    delta: 2,
    outlook: 'Greene and Hogan leaving GWS frees up forward-line minutes, and Gothard is in line for some of them after his injury.',
  },
  'N. Madden|GWS': {
    delta: 8,
    outlook: 'Kieren Briggs has left for Richmond, so the GWS ruck job is Madden’s to lose. More hit-outs and more time on ground should push him well past last year’s numbers if he holds the spot.',
  },
  'J. Riccardi|GWS': {
    delta: 3,
    outlook: 'With Briggs, Greene and Hogan gone, Riccardi’s ruck-forward role gets a bigger share at GWS. Still a depth piece, but a busier one.',
  },
  'W. Ashcroft|BRL': {
    delta: 3,
    outlook: 'Lachie Neale has gone to Collingwood, so the Brisbane midfield is now Ashcroft’s to run. Expect even more centre bounces and a bit more ball.',
  },
  'H. McCluggage|BRL': {
    delta: 3,
    outlook: 'Neale’s move to Collingwood frees up a Brisbane midfield spot, and McCluggage should spend more time on-ball as a result.',
  },
  'J. Berry|BRL': {
    delta: 3,
    outlook: 'With Neale gone to Collingwood, Berry is one of the Brisbane mids who should pick up extra centre-bounce minutes.',
  },
  'D. Wilmot|BRL': {
    delta: 2,
    outlook: 'Keidean Coleman’s exit to Essendon leaves more of the Brisbane rebound and kick-ins for Wilmot. A small bump on top of his normal output.',
  },
  'J. Fletcher|BRL': {
    delta: 2,
    outlook: 'Coleman’s move to Essendon frees up a half-back spot at Brisbane, and Fletcher is in line to take it.',
  },
  'J. Horne-Francis|PTA': {
    delta: 4,
    outlook: 'Zak Butters has left for the Western Bulldogs, so Horne-Francis becomes Port’s No.1 midfielder. More centre bounces and more of the ball once he’s back from injury.',
  },
  'W. Drew|PTA': {
    delta: 3,
    outlook: 'Butters’ exit opens up midfield minutes at Port, and Drew is one of the main players in line for them.',
  },
  'J. Burgoyne|PTA': {
    delta: 2,
    outlook: 'With Butters gone to the Bulldogs, Burgoyne is likely to spend more time through the midfield as well as off half-back.',
  },
  'C. Rozee|PTA': {
    delta: 2,
    outlook: 'Butters’ exit leaves Port short of midfield class, so Rozee should get more on-ball time once he’s back from injury.',
  },
  'W. Setterfield|ESS': {
    delta: 3,
    outlook: 'Zach Merrett has gone to Hawthorn, leaving a big hole in the Essendon midfield. Setterfield should pick up a lot of those touches.',
  },
  'J. Caldwell|ESS': {
    delta: 3,
    outlook: 'Merrett’s move to Hawthorn frees up midfield minutes at Essendon, and Caldwell is one of the inside mids who should benefit.',
  },
  'S. Durham|ESS': {
    delta: 2,
    outlook: 'With Merrett gone, Essendon need more midfield ball-winning, and Durham should spend more time on-ball once he’s back from injury.',
  },
  'X. Duursma|ESS': {
    delta: 2,
    outlook: 'Merrett’s exit opens up midfield minutes at Essendon that Duursma could step into.',
  },
  'D. Sharp|ESS': {
    delta: 2,
    outlook: 'With Merrett gone to Hawthorn, Sharp should get more midfield time at Essendon.',
  },
  'A. Roberts|ESS': {
    delta: -2,
    outlook: 'Keidean Coleman’s arrival from Brisbane means another kick-in and rebound option in the Essendon back half. Roberts stays a big scorer, but he’ll share a bit more of the ball.',
  },
  'J. Bowey|MEL': {
    delta: 2,
    outlook: 'Trent Rivers has gone to West Coast, which leaves more of the Melbourne half-back ball for Bowey.',
  },
  'C. Windsor|MEL': {
    delta: 2,
    outlook: 'Rivers and Viney have both left Melbourne, which opens up half-back and midfield minutes for Windsor.',
  },
  'J. Fitzgerald|MEL': {
    delta: 2,
    outlook: 'Viney and Rivers leaving Melbourne frees up midfield time, and Fitzgerald is one of the mids in line for it.',
  },
  'H. Langford|MEL': {
    delta: 2,
    outlook: 'With Viney and Rivers gone to West Coast, Langford should see more midfield minutes at Melbourne.',
  },
  'T. Sparrow|MEL': {
    delta: 2,
    outlook: 'With Viney and Rivers gone to West Coast, Sparrow’s spot in the Melbourne midfield rotation gets more secure.',
  },
  'M. Roberts|SYD': {
    delta: 3,
    outlook: 'Nick Blakey has gone to North Melbourne, which leaves a big gap in the Sydney rebound game. Roberts is in line to fill it.',
  },
  'J. Serong|SYD': {
    delta: 2,
    outlook: 'Blakey’s move to North opens up half-back ball at Sydney, and Serong should pick up some of it.',
  },
  'T. De Koning|STK': {
    delta: 12,
    outlook: 'Rowan Marshall has gone to Geelong, so De Koning should be St Kilda’s No.1 ruck after sharing the job for a year. On full ruck minutes, expect a big jump on last year’s split-role numbers.',
  },
  'J. Newcombe|HAW': {
    delta: -3,
    outlook: 'Zach Merrett’s arrival from Essendon means more competition for the ball in the Hawthorn midfield. Newcombe is still a key part of it, but expect a small dip.',
  },
  'W. Day|HAW': {
    delta: -2,
    outlook: 'Merrett’s arrival at Hawthorn crowds the midfield, so Day’s centre-bounce share could shrink.',
  },
  'J. Ward|HAW': {
    delta: -2,
    outlook: 'With Merrett now at Hawthorn, Ward’s path to more midfield time gets tougher.',
  },
  'C. Mackenzie|HAW': {
    delta: -2,
    outlook: 'Merrett joining Hawthorn adds another proven ball-winner ahead of Mackenzie in the midfield rotation.',
  },
  'E. Richards|WBD': {
    delta: -2,
    outlook: 'Zak Butters’ arrival from Port means the Bulldogs’ centre bounces get shared more. Richards should still score well, just a touch less.',
  },
  'M. Kennedy|WBD': {
    delta: -2,
    outlook: 'Butters joining the Bulldogs adds another star mid, which squeezes Kennedy’s share of the inside work.',
  },
  'R. Sanders|WBD': {
    delta: -2,
    outlook: 'Butters’ arrival makes the Bulldogs midfield even more crowded, which may slow Sanders’ move into a bigger on-ball role.',
  },
  'J. Freijah|WBD': {
    delta: -2,
    outlook: 'With Butters now at the Bulldogs, Freijah’s midfield minutes are likely to shrink.',
  },
  'O. Florent|CAR': {
    delta: -2,
    outlook: 'Lachie Whitfield’s arrival gives Carlton a new No.1 kick-in taker, so Florent shares more of the half-back ball.',
  },
  'B. Wilson|CAR': {
    delta: -2,
    outlook: 'Whitfield joining Carlton means less of the rebound work going Wilson’s way.',
  },
  'H. Davis|WCE': {
    delta: -1,
    outlook: 'Rivers and Viney arriving at West Coast adds midfield bodies ahead of Davis.',
  },
  'M. Blicavs|GEE': {
    delta: -4,
    outlook: 'Rowan Marshall’s arrival as Geelong’s main ruck means Blicavs’ ruck minutes all but dry up.',
  },
  'T. Bruhn|GEE': {
    delta: -1,
    outlook: 'Jordan Ridley’s arrival adds another half-back option at Geelong, so Bruhn shares a little more of the ball.',
  },
  'S. Mannagh|GEE': {
    delta: -2,
    outlook: 'Toby Greene joining Geelong adds a star forward ahead of Mannagh in the pecking order.',
  },
  'G. Miers|GEE': {
    delta: -2,
    outlook: 'Greene’s arrival at Geelong means more competition for the forward-line ball Miers lives on.',
  },
  'D. McStay|COL': {
    delta: -2,
    outlook: 'Jesse Hogan’s arrival from GWS adds a key forward at Collingwood, so McStay’s share of the marks drops.',
  },
};

/** Keyed note for a player, if any. */
export const noteFor = (name: string, club: string | null) => (club ? NOTES[`${name}|${club}`] : undefined);
