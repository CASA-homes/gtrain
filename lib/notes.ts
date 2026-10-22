// Hand-written context for players whose numbers don't tell the whole story:
// role changes, 2026 trades, injuries, off-field. Keyed by "Name|current AFL club".
// verdict overrides the auto label; outlook is shown in the Outlook section of the report.

export type Verdict =
  | 'Possible fantasy star' | 'Possible great fantasy player' | 'Locked-in premium' | 'Reliable starter'
  | 'Unknown quantity' | 'Role-dependent' | 'Win-now asset' | 'Sell window' | 'Depth only' | 'Bench stash';

export interface Note { outlook: string; verdict?: Verdict }

export const NOTES: Record<string, Note> = {
  // ---------------------------------------------------------------- the ones you asked about
  'D. Wilson|STK': {
    verdict: 'Possible fantasy star',
    outlook: 'The jump from 64 to 83 came from St Kilda trusting him with midfield minutes in patches (16% of centre bounces, up from almost none). That’s the whole story with Wilson: he’s a half-back-flanker scorer who turns into a ball magnet when he goes on-ball. If the Saints make the move permanent, this is a 95–100 player within two years. If they don’t, he’s a high-80s keeper. Either way the arrow is pointing up.',
  },
  'K. Coleman|ESS': {
    verdict: 'Role-dependent',
    outlook: 'Keidean Coleman swaps Brisbane for Essendon, and that should mean more of the ball. The Bombers’ back half needs a kicker, and he’ll likely take the kick-ins and run the rebound chain rather than share it with a stacked Lions defence. That’s a 10–15 point bump on paper. The catch is the body: he managed one game in each of 2024 and 2025. Buy the upside, but keep a backup.',
  },
  'L. Ash|GWS': {
    verdict: 'Locked-in premium',
    outlook: 'Ash went from 76 to 100 to 103 over the last three years, and the main man he shared the GWS back half with, Lachie Whitfield, has just been traded to Carlton. That leaves Ash as the undisputed kick-in taker and the first look out of defence. He should keep dominating, and there’s a case he goes up again in 2027.',
  },
  'B. Hill|STK': {
    verdict: 'Sell window',
    outlook: 'A career year. Hill averaged 100 after three straight seasons around 74–76, and a lot of that was the ball finding the outside runner while Flanders and Wanganeen-Milera were in and out. With both back and fit, the Saints’ outside ball gets shared three ways again. Expect him back in the 80s. If anyone in the league is paying for the 100, take the money.',
  },
  'S. Cumming|RIC': {
    verdict: 'Possible great fantasy player',
    outlook: 'Pick 7 in 2025, straight into a rebuilding Richmond side. Fourteen games at 59, with 43% of centre bounces in his first year, is a better start than it looks: the typical first-year average sits around 55, and he got there on a young, rebuilding team that spent plenty of time without the ball. With a bigger tank and a better side around him, he’s a possible great fantasy player.',
  },
  'D. Robertson|WCE': {
    verdict: 'Unknown quantity',
    outlook: 'An unknown quantity who could score well in the right role. Injuries and a lack of opportunity have limited him to 10 games in three years. But in his four games in 2026 he went to 52% of centre bounces and averaged 74, which hints at what he can do as an inside mid. A cheap flyer who could be a 90 player if West Coast hand him a midfield spot and he stays on the park.',
  },

  // ---------------------------------------------------------------- off-field
  'L. Cowan|CAR': {
    verdict: 'Bench stash',
    outlook: 'Starts 2027 serving a two-match AFL ban (a strike under the illicit drugs policy), so pencil him in from Round 3. On the field he’s a steady low-60s half-back with 24 games last year, which makes him a bench option rather than a starter. Off the field, maybe don’t make him the designated driver for the end-of-season trip.',
  },
  'N. Blakey|NTH': {
    verdict: 'Possible great fantasy player',
    outlook: 'He was one of five Swans stood down by the club for the rest of 2026 after a team-hotel standards breach, and the fallout ended with a trade to North Melbourne. Footy-wise it could be the best thing for his scoring: at Sydney he was one of several rebounders, but at North he’ll be the main man off half-back. He’s been mid-80s for two years already. A fresh start and more of the ball make 90+ realistic.',
  },
  'I. Heeney|SYD': {
    verdict: 'Locked-in premium',
    outlook: 'One of the five Swans the club stood down for the rest of 2026 after the team-hotel breach, so he missed Sydney’s finals. That shouldn’t touch his value. He averaged 106 with 74% of centre bounces before the suspension, and he stays at Sydney. Expect a quiet off-season and a premium midfielder again in 2027.',
  },
  'C. Warner|SYD': {
    verdict: 'Reliable starter',
    outlook: 'Caught up in the Swans’ team-hotel suspension along with four teammates, so his 2026 ended before the finals. On-field he’s been remarkably steady: 88 to 93 four years running with around 60% of centre bounces. A safe low-90s mid who won’t win you a week but won’t lose you one either.',
  },
  'R. Bice|SYD': {
    verdict: 'Role-dependent',
    outlook: 'He jumped from 57 to 76 in his second season before he was one of the five Swans stood down after the team-hotel breach. With Blakey now gone to North, the half-back role Bice has been covering should get bigger. There’s upside if Sydney hand him Blakey’s rebound minutes.',
  },

  // ---------------------------------------------------------------- 2026 trades
  'Z. Butters|WBD': {
    verdict: 'Locked-in premium',
    outlook: 'Four straight seasons at 100+, now in red, white and blue. The one worry is crowding: the Dogs already have Bontempelli, Sanders and Liberatore fighting for centre bounces, and Butters lived on 81% at Port. He’s too good to drop below 95, but his ceiling might be tighter in 2027 than it was at Alberton.',
  },
  'L. Whitfield|CAR': {
    verdict: 'Win-now asset',
    outlook: 'He’s 32, and he’s just moved from GWS to Carlton for one more crack. He’s been 96–110 for four years as the kick-in king, and Carlton will use him the same way. Expect another 95-ish year, but the drop is coming, so treat him as a 2027 asset rather than a long-term keeper.',
  },
  'Z. Merrett|HAW': {
    verdict: 'Win-now asset',
    outlook: 'Ten years an Essendon ball magnet (100+ for four straight seasons), now traded to Hawthorn. He’ll be a big part of the Hawks’ midfield, though he’ll share it more than he did at Essendon, where he was often a one-man band. Expect a small dip to the mid-90s and hold for the next two seasons.',
  },
  'S. Pendlebury|GCS': {
    verdict: 'Depth only',
    outlook: 'He’s 38 and has left Collingwood for one last lap on the Gold Coast. The footy IQ is still there, but he averaged 79 last year on 68% time on ground. He’s a sentimental keeper at best.',
  },
  'L. Neale|COL': {
    verdict: 'Win-now asset',
    outlook: 'He’s heading to Collingwood, which makes him effectively a straight swap for Pendlebury in the Pies’ midfield. He’s 33 but still averaged 99 with 78% of centre bounces and 6.7 clearances last year. Neale is good for one or two more 90+ seasons, and the decline at his age tends to be sudden.',
  },
  'T. Rivers|WCE': {
    verdict: 'Role-dependent',
    outlook: 'He’s moved from Melbourne to West Coast. At the Dees he was a half-back without many centre bounces (8%). The Eagles want more midfield class, and if he gets it he’s a mid-80s player with room to grow. If he stays a defender, he’s a 77–82 keeper.',
  },
  'J. Viney|WCE': {
    verdict: 'Depth only',
    outlook: 'He played one game in 2026 and has now moved to West Coast in the twilight of his career. He was an 87–98 player when fit, but at 32 and coming off a lost year, he’s a bench stash until he proves otherwise.',
  },
  'S. Marshall|STK': {
    verdict: 'Unknown quantity',
    outlook: 'He’s gone from Brisbane to St Kilda after only 13 games in two years. He’ll get a much clearer path at the Saints. At 20 he’s a genuine unknown, but the move suggests the Saints see a role for him.',
  },
  'R. Marshall|GEE': {
    verdict: 'Win-now asset',
    outlook: 'He’s a 201cm ruck, not a forward: a three-time Silk–Miller medallist who started on St Kilda’s rookie list and built himself into one of the most mobile big men in the game. He averaged 106–117 from 2023 to 2025 when he was St Kilda’s No.1 ruck. That ended when the Saints brought in Tom De Koning. Marshall’s ruck-contest share fell to 50% and his average to 83, and he asked to be traded. Geelong gave up their first-round pick (No.14) to get him, but he’ll share the ruck with 21-year-old Mitchell Edwards rather than own it outright. If he gets back above 65–70% of ruck contests he’s a 95+ ruck again. Split it evenly and he’s mid-80s. He turns 31 next month, so it’s a two-year window.',
  },
  'J. Ridley|GEE': {
    verdict: 'Bench stash',
    outlook: 'Seven games in 2026 at 57, and he’s now gone from Essendon to Geelong. He was an 81–88 rebounder at his best, but the body has been the issue for three years. A cheap punt for the bench.',
  },
  'J. Bowes|ESS': {
    verdict: 'Bench stash',
    outlook: 'He’s gone from Geelong to Essendon. Nine games at 70 last year, and he’s been hard to rely on for years. Bench cover only.',
  },
  'N. O\'Driscoll|RIC': {
    verdict: 'Role-dependent',
    outlook: 'He’s moved from Fremantle to Richmond, where midfield minutes are there for the taking. He’s been a low-60s half-back for four years. The move is his best chance yet at a bigger role.',
  },
  'K. Briggs|RIC': {
    verdict: 'Possible great fantasy player',
    outlook: 'He’s leaving GWS for Richmond, and that’s a big deal for his fantasy value. He was a 92-average ruck in 2023–24, then fell to 72 over the last two seasons. At the Tigers he should be the No.1 ruck, so a return to the 90s is realistic. Note this hurts Nankervis.',
  },
  'T. Nankervis|RIC': {
    verdict: 'Sell window',
    outlook: 'Richmond just traded for Kieren Briggs, and that’s a direct threat to Nankervis’ ruck minutes. At 32 and likely to be splitting the ruck load, a sharp drop is the likely outcome. Move him on if anyone still rates him.',
  },
  'T. Greene|GEE': {
    verdict: 'Win-now asset',
    outlook: 'He’s 33 and has moved from GWS to Geelong. He’s a forward who scored 86 in 2026, mostly from goals and pressure, and that kind of scoring is up and down by nature. At the Cats he’ll be one of several forward targets. Keep him for 2027 and plan around him after that.',
  },
  'L. Pedlar|PTA': {
    verdict: 'Bench stash',
    outlook: 'He’s back home at Port Adelaide after leaving Adelaide. He averaged 45–47 in two seasons of limited minutes. The move may free him up, but he’s bench depth until he shows otherwise.',
  },

  // ---------------------------------------------------------------- notable keepers
  'N. Daicos|COL': {
    verdict: 'Locked-in premium',
    outlook: 'The best player in the competition for fantasy, and he’s only 23. He averaged 117 with 34.7 disposals and 79% of centre bounces, and he has topped 100 four years running. With Pendlebury gone, the Collingwood midfield is even more his. There’s no reason his potential isn’t still 5 stars.',
  },
  'H. Sheezel|NTH': {
    verdict: 'Locked-in premium',
    outlook: 'He’s 22, averaged 116 with 30.5 disposals, and has gone to 61% of centre bounces. He’s already a top-three fantasy player. North keep adding talent around him, which only helps. A long-term cornerstone.',
  },
  'M. Gawn|MEL': {
    verdict: 'Win-now asset',
    outlook: 'Still elite at 34, averaging 110 for the third straight year. But rucks fall off fast, and he’s on borrowed time. Keep him for the 2027 flag push and don’t pay for 2028.',
  },
  'M. Bontempelli|WBD': {
    verdict: 'Win-now asset',
    outlook: 'He averaged 102 at 30, a slight dip from his 106–117 prime. Butters’ arrival means the Dogs’ centre bounces get shared, so he could drift into the mid-90s. Still a premium for another season, but his best years are behind him.',
  },
  'H. Reid|WCE': {
    verdict: 'Possible fantasy star',
    outlook: 'The No.1 pick in 2023 finally made the jump from 67 to 78 in 2026, with 80% of centre bounces, 13.4 contested possessions and 6.6 clearances. Those are elite inside-mid numbers for a 21-year-old. His kicking efficiency is what holds the score back. If it tidies up, he’s a 100+ player, and he’s a possible fantasy star.',
  },
  'W. Duursma|WCE': {
    verdict: 'Possible fantasy star',
    outlook: 'The No.1 pick in 2025 averaged 72 in his first season, well above the roughly 55 a typical first-year averages, and he already attended 30% of centre bounces. With Reid beside him, the Eagles’ midfield is being rebuilt around the two of them. He’s a possible fantasy star.',
  },
  'D. Annable|BRL': {
    verdict: 'Unknown quantity',
    outlook: 'Pick 6 in 2025, but he only played 3 games in a strong, settled Brisbane side. The pedigree is real, but there’s no scoring history to back it yet. Give him two years: if he’s still on the fringe in 2028, the draft shine fades fast.',
  },
  'H. Dean|CAR': {
    verdict: 'Role-dependent',
    outlook: 'Pick 3 in 2025, and he played all 22 games in his first year, but as a key defender who averaged 50. Tall defenders rarely become fantasy scorers. He’s a much better real-life player than a fantasy one.',
  },
  'S. Lalor|RIC': {
    verdict: 'Possible great fantasy player',
    outlook: 'The No.1 pick in 2024 had his second year interrupted, playing 12 games at 63, up from 54. He went to 48% of centre bounces, which is the role you want. With Cumming growing alongside him and a better team coming, he’s a possible great fantasy player. He just has to string 20 games together.',
  },
  'J. Smillie|RIC': {
    verdict: 'Unknown quantity',
    outlook: 'Pick 7 in 2024 and still waiting on his AFL debut. He’s an unknown quantity: the talent got him drafted early, but two years without a senior game is a worry. He could score well in a midfield role if Richmond give him one.',
  },
  'J. Smith|CAR': {
    verdict: 'Possible fantasy star',
    outlook: 'Pick 3 in 2024 and an immediate hit. He averaged 82 across 25 games in his first full season, with 56% of centre bounces and 24.8 disposals. That’s 27 points above a typical first-year average. He’s a possible fantasy star and should be locked in as a keeper.',
  },
  'F. O\'Sullivan|NTH': {
    verdict: 'Possible great fantasy player',
    outlook: 'Pick 2 in 2024. He jumped from 54 to 72 in his second year and got 68% of centre bounces. North’s midfield runs through Sheezel, but O’Sullivan is the clear No.2. Another 10-point jump makes him a genuine starter.',
  },
  'L. Ashcroft|BRL': {
    verdict: 'Possible great fantasy player',
    outlook: 'Pick 5 in 2024. He’s played all 54 games of his career and gone from 72 to 77, mostly on a wing and half-back. Like his brother Will, he could take off once the Lions move him on-ball.',
  },
  'L. Humphries|GEE': {
    verdict: 'Possible great fantasy player',
    outlook: 'A late pick who has outscored most of his draft class. He went from 70 to 81 in 2026 off half-back at 23, which is well above where defenders his age usually sit. Geelong use him as a ball-user off the back flank, and that role suits fantasy scoring. Trending towards 90.',
  },
  'J. Fonti|GWS': {
    verdict: 'Possible great fantasy player',
    outlook: 'Averaged 38, then 50, then 73 across his first three seasons, which is as steep a curve as anyone on a list. He’s a 21-year-old defender who’s only now getting full games (82% time on ground). With Whitfield gone from the GWS back half, there are more kicks out of defence going begging. A 3-star player today with 4.5-star upside.',
  },
  'M. Herbert|WCE': {
    verdict: 'Unknown quantity',
    outlook: 'A mature-age rookie who arrived at 23 and averaged 76 over 10 games, including 104 and 118 in his last two. That’s an eye-catching start, but it’s a small sample. Rookie keeper slot material: cheap to hold and could be a genuine find.',
  },
  'G. Hewett|CAR': {
    verdict: 'Win-now asset',
    outlook: 'Back-to-back years in the 90s (99, then 90) as Carlton’s stoppage worker. He turns 31 in December, though, and midfielders his age tend to fade fast. His current value is a 4-star season, but he’s a 3-star keep from here.',
  },
  'J. Dunkley|BRL': {
    verdict: 'Win-now asset',
    outlook: 'A 103–108 player for three years before dipping to 94 in 2026. He’s 29 and Brisbane’s midfield is deep, so the 2026 drop might be the start of a gentle slide rather than a blip. Still a 4-star keeper for the next season or two.',
  },
  'O. Wines|PTA': {
    verdict: 'Sell window',
    outlook: 'He’s 32 and averaged 78 in 2026, down from 90. His time on ground dropped to 65%, which is the giveaway. 2027 might be his last season. Keep him only if your mid-bench is empty.',
  },
  'E. Tsatas|ESS': {
    verdict: 'Unknown quantity',
    outlook: 'Pick 5 in 2022 with only 22 games in four years. But when he played in 2026 he averaged 79 with 24 disposals and 59% of centre bounces. The talent is obvious and the body hasn’t held up. If he gets a clean run, he’s a 90+ player.',
  },
  'A. Cadman|GWS': {
    verdict: 'Depth only',
    outlook: 'The No.1 pick in 2022, but he’s a key forward, and in fantasy terms that shows: 61 average with almost no midfield time. He’s a better real-life player than a fantasy one. Don’t let the draft number fool you.',
  },
  'G. Wardlaw|NTH': {
    verdict: 'Role-dependent',
    outlook: 'Pick 4 in 2022. When fit, he’s a tackling-heavy inside mid (5.4 tackles a game). But at 61% time on ground and 72 average, North are still managing his minutes. With a full load, he’s an 85+ player.',
  },
  'C. McKercher|NTH': {
    verdict: 'Reliable starter',
    outlook: 'Pick 2 in 2023. He started hot at 82 but has drifted to 78, then 76, as a half-back. He’s a steady 76–82 defender rather than the star the draft number suggested, unless North move him into the midfield.',
  },
  'Z. Uwland|GCS': {
    verdict: 'Role-dependent',
    outlook: 'Pick 2 in 2025. He averaged 58 as a first-year defender, about what you’d expect. Bodhi Uwland’s 12.2 rating points a game off the same Suns half-back line show what that role can become. Give it two years.',
  },
  'J. Farrow|ESS': {
    verdict: 'Possible great fantasy player',
    outlook: 'Pick 10 in 2025. He averaged 72 as a first-year, 17 points above the norm, and played all 21 games. He’s a ball-user off the half-back, a role that scores well. One to hold.',
  },
  'S. Robey|ESS': {
    verdict: 'Possible great fantasy player',
    outlook: 'Pick 9 in 2025. He averaged 62 in his first year, but the underlying numbers are better: 33% of centre bounces, 7.3 contested possessions and 3.7 clearances in limited time. He’s an inside-mid prospect at an Essendon side that’s rebuilding its midfield.',
  },
  'T. Travaglia|STK': {
    verdict: 'Unknown quantity',
    outlook: 'Pick 8 in 2024, but he’s managed only 18 games across two years at 46–47. St Kilda’s midfield is crowded with Flanders, Wanganeen-Milera and now Wilson pushing in. He needs a role first.',
  },
  'S. Flanders|STK': {
    verdict: 'Reliable starter',
    outlook: 'He averaged 108 in 2024, then 67 in an injury-hit 2025, then 92 in 2026. His back-to-health status is exactly why Brad Hill’s numbers are likely to come back. He should settle around 95 with a full year.',
  },
  'N. Wanganeen-Milera|STK': {
    verdict: 'Locked-in premium',
    outlook: 'He’s gone from 92 to 98 to 111 to 105 since turning 20, and has moved into the midfield (55% of centre bounces). He’s 23 with elite ball use. One of the best long-term keepers in the league.',
  },
};

/** Keyed note for a player, if any. */
export const noteFor = (name: string, club: string | null) => (club ? NOTES[`${name}|${club}`] : undefined);
