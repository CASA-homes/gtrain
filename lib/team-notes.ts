// The verdict on each club, judged on what they'll actually carry into 2027: the likely 17 keepers + rookie,
// the 2027 picks, and where the core is in its life cycle. Background from the Keeper trade log and 2026 finals.
// Update after each trade period and once keepers are locked.

export const TEAM_NOTES: Record<string, { headline: string; body: string }> = {
  'Bodega Boys': {
    headline: 'Premiers with a strong, stable core',
    body: 'Won the 2026 flag from third: beat NSW-ACT, put 2006 on Such Is Fyfe in the prelim, then beat Serong by 61 in the decider. The keeper list is the best balance of quality and age in the league. Bailey Smith, Anderson, Rankine, Max Hall and Sparrow are prime-age premiums, and behind them is a deep layer of 21-to-24-year-olds already scoring: Garcia (90), Darcy Wilson (83 and rising), Humphries, Fonti, Harry Thomas, and Herbert in the rookie slot. The real call for the keeper deadline is the last few spots. Do you hold experienced scorers like Zorko and Parker for one more season, or lock in promising youth like Cooper Lord and Darcy Wilmot for the long run? It’s a nice problem to have, because either way the core stays strong. The one soft spot is draft capital, with no pick inside 14 in 2027, and Rankine’s forward status is worth watching. A contender for 2027 and the years after.',
  },

  'Serong So’Right': {
    headline: 'Four straight runner-ups and a keeper list that’s ageing out',
    body: 'Runners-up in 2023, 2024, 2025 and 2026, which is the most painful run in this league. They went all-in at the 2026 deadline, knocked minor premiers Muzza’s out in the prelim, then lost the grand final by 61. Judge them on keepers and it gets worse. Gawn is 34, Impey, Steele, Short and Miller are all 30 or older, and Hill’s career year is unlikely to repeat. Dawson (113) and Caleb Serong are the only genuine prime-age premiums. The youth behind them (Retschko, Lindsay, Hall-Kahan, Dempsey) is a long way from scoring. With no pick before 39 in 2027 and much of their future draft capital traded away, there’s no quick fix. One more window at most, then a hard reset.',
  },
  'Such Is Fyfe': {
    headline: 'The dynasty retools rather than rebuilds',
    body: 'Three straight flags from 2023 to 2025 and the best all-time record in the league (76–33). They went 17–4 again in 2026, then ran into Bodega’s 2006 in the prelim. The keeper list is the most complete in the comp: Rowell, Walsh, Josh Daicos, Warner and Sam Berry are all in their mid-twenties and scoring 92 to 100, with Bontempelli and Sinclair still premium for another year. They sold Hill, Kelly and Drew to Serong at peak value, and that leaves them with picks 7, 9 and 17 in 2027, the best early picks of any contender. Rowan Marshall at Geelong could be a bonus if he wins the No.1 ruck job. Strong contender again.',
  },
  'Muzza\'s Murabito\'s': {
    headline: 'A Daicos window with an ageing support cast',
    body: 'Minor premiers at 17–4, then bundled out in straight sets: they had the bye, then lost the prelim to Serong 1824–1595. The keeper list is top-heavy. Nick Daicos is the best fantasy player in the competition, Archie Roberts (95 at 21) is a future star, and Pickett, Bailey and Newcombe are prime-age. But a lot of the scoring comes from players on the way out: Heeney and Wilkie are 30, Grundy 32, Laird 33, and Merrett has moved to Hawthorn at 31. Picks 8 and 10 in 2027 are the chance to replace that ageing middle with youth. A top-four side in 2027, but the next two drafts decide whether the window stays open past Daicos’s prime.',
  },
  'Pato\'s Fantasy Team': {
    headline: 'The best-built list in the league',
    body: 'Wooden spoon in 2025, finals in 2026: fifth, then a 22-point elimination-final loss to Serong. On keepers, nobody is better set up. Gulden (113), Wanganeen-Milera (105) and Ash (103) are elite and 25 or under, and Ash now has the GWS kick-ins to himself. Flanders, McCarthy, McAndrew and Josh Ward are prime-age depth. Willem Duursma, taken after moving up to pick 5, is a possible fantasy star, and Ben Wilson and Curtin are coming. Oliver, Dale and Cameron give them win-now punch for a season or two. With picks 6, 19, 26 and 27 in 2027, they project second for next year and have the youngest elite core of the contenders. A team on the way up.',
  },
  'NSW-ACT Academy': {
    headline: 'Right core, wrong timeline',
    body: 'Made the 2026 finals on percentage at 9–12, then got rolled by Bodega 1847–1600 in the elimination final. The squad assessment is simple: the best part of this list is young. Will Ashcroft (107) is already a premium, Jagga Smith averaged 82 in his first full season, and Levi Ashcroft, Burgoyne and Windhager are on the way. The misstep was trying to win now anyway. Through the year they stacked up veterans (Macrae, Wines, Acres, Sicily, McStay) around a core that wasn’t ready to contend, then ended up moving several of them on as the season slipped. Tom Green is a sensible play for 2027 once he’s fit, and Blakey gets a fresh start at North. Pick 5 in 2027 adds another top talent. If they let the kids drive it, this is a top-four side within two years.',
  },
  'A Brayshaw Thing': {
    headline: 'Freefall',
    body: '9–12 and seventh in 2026, and the keeper list has got thinner since. Mills (ACL) is likely out for all of 2027, and Treloar has retired. The Mills trade cost them Max Holmes, who averaged 102 for the Ram Dawgs. What’s left is three good players and a lot of 72 to 80 depth. Jackson, Horne-Francis and Brayshaw are the keepers worth having, and Horne-Francis being reclassified as a midfielder takes away a positional edge. Max Reid (80 at 20) and Bruhn are the only young players scoring. Houston, Ryan, Bailey Williams and Graham are 28 to 30 and won’t improve. Picks 11, 18 and 21 in 2027 are the lifeline. They project last for 2027. This is a rebuild, whether they call it one or not.',
  },
  'Fo’ Sheezel my Neezel': {
    headline: 'Youngest keeper list in the league, sitting on gold',
    body: 'Only 7–14 and eighth in 2026, but the keeper list averages just 23 and the draft capital is the best in the league: picks 3, 4 and 13 in 2027. Sheezel is already a top-three fantasy player at 22, and Callaghan (96 at 23) is close behind. Ed Richards and Taranto give the midfield real ballast. The rest is a crop of 19-to-23-year-olds: Mackenzie, Fitzgerald, Farrow (72 as a first-year), Rachele, Phillipou and Langford. Briggs becoming Richmond’s No.1 ruck should give them a ruck again. The next two drafts turn this into a top-four side.',
  },
  'Bito’s Boys': {
    headline: 'Elite kids, and veterans he won’t let go',
    body: 'They finished 5–16 and ninth in 2026, but the young end of this list is as good as anyone’s. Ryley Sanders (81 at 21) is a genuine midfield talent. Sam Lalor was a No.1 pick, and Sullivan Robey and Dyson Sharp were first-rounders, and Logan Morris, Lachie Evans and Sam Swadling add depth. Pick 2 in 2027 adds another blue-chipper, with 12 and 22 behind it. The problem is the other end. Neale is 33 and now at Collingwood, Cripps is 31, de Goey 30, and Noble and Milera 29. They’re still scoring, and that’s exactly why they should have been moved for picks by now. Holding them only keeps Bito’s stuck in the middle. Rankine left for McCluggage, who started awfully but has since recovered (115 in his last game). Cash in the veterans and this is a top-four side by the time the kids peak.',
  },

  'Ram Dawgs': {
    headline: 'Spoon now, scary later',
    body: 'Won two games all year (2–19) and took the 2026 wooden spoon. The keeper list averages 23, and the best part of it is already scoring. Butters (105) and Max Holmes (102) are prime-age premiums, and Holmes came from A Brayshaw Thing in the Mills deal. Bodhi Uwland (87 at 23) is a top defender in the making. Behind them is the deepest crop of young talent in the league: Harley Reid, Finn O’Sullivan, Francou, Freijah, Wardlaw, Nick Watson, Weddle and Sam Cumming. Add pick 1 and pick 16 in 2027. They won’t win much in 2027, but they rank near the top on the Future build. Give it two years.',
  },
};
