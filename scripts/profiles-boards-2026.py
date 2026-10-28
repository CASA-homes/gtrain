"""Combine the 2026 boards into lib/draft-profiles-2026.json.
- Cal Twomey's October Phantom Form Guide (AFL.com.au, 20 Oct 2026): rank + our own short read of his note.
- Rookie Me's August Power Rankings (top 50): rank only (their profile text is already the main summary).
- Zero Hanger's big board (already in p['zh']).
Consensus: weighted rank, Twomey 40% / Rookie Me 35% / Zero Hanger 25%. Unranked on a board = just outside it.
Run after scripts/profiles-zh-2026.py. Notes are our own words, not the source text."""
import json
TW_URL = 'https://www.afl.com.au/news/1633149/cal-twomeys-phantom-form-guide-top-draft-prospects-october-ranking'
RM_URL = 'https://central.rookieme.com/afl/power-rankings/afl-draft-power-rankings-august-2026-top-50/'
TW = [
 ('Dougie Cochrane', 'Tall utility who can play either key post, midfield or wing. Spent the year inside Port’s program, so he’s ready to go full-time; Essendon have flagged a pick-1 bid. Skipped Combine testing.'),
 ('Cody Walker', 'Carlton father-son midfielder who is ready-made: big ball-winner with an explosive step. Starred in Echuca’s senior premiership and ran third in the 2km (6:04) before sitting out the rest of testing.'),
 ('Arki Butler', 'Best highlights reel in the pool: game-changer near goal who marks, creates at ground level and finishes. Only two games in four months after a broken collarbone, then missed testing with a hamstring.'),
 ('Ethan Drever', 'As safe as anyone in the pool. Run-and-carry midfielder with real pace (2.905 sec 20m, 6:30 2km, top-10 vertical leap); clubs rate his character as future-leader material.'),
 ('Heath Mellody', 'Larke Medallist who finished the year playing WAFL League finals for Claremont, with some dominant senior games. Lovely kick who plays half-back or midfield and grew during the year.'),
 ('Gus Teixeira', 'High-impact forward-half player with a possible Josh Rachele-type move into the centre given his power. Came back from illness for the prelim; didn’t test (calf).'),
 ('Harry Van Hattum', 'Clearly the best ruck in the pool and a chance to go very early. Athletic (95cm running leap), works as an extra mid at ground level and kicks well for his size.'),
 ('Ethan Matthews', 'Left-footed midfielder who wins his own ball and is also crafty on the outside. Foot injury ended his carnival and he didn’t test, but interviewed brilliantly. GWS hold first call on a bid.'),
 ('Mitch Harris', 'Riser who finished the year playing senior footy for the Eagles. Lock-down tall defender who can also leap and intercept; seen as ready for AFL footy next year. Didn’t test (ankle).'),
 ('Caylen Murray', 'Brisbane Academy prospect who broke out at the carnival: classy ball use, rebound and creativity off half-back or up the ground. Lions have room for a bid after Coleman left, but it may come early.'),
 ('Wil Malady', 'Five goals in Gippsland’s Talent League flag. Elite mark, one of the fastest in the pool (2.9 sec 20m, 2nd in agility) and versatile; a rangy game-changer.'),
 ('Leo Steed', 'Endurance midfielder who keeps running and competing (6:09 2km). Consistent at the carnival and held his own at WAFL League level with Swan Districts.'),
 ('Clancy Snell', 'Intercept-marking defender from Gippsland’s premiership side who reads the ball well and starts attacks calmly. Handled bigger bodies in VFL games with Collingwood.'),
 ('Sam Gayfer', 'Smashed the Combine vertical jump record (114cm). Combative, fearless key forward who flies for his marks.'),
 ('Lochie Burrows', 'Aggressive, versatile type who can play half-back, half-forward or midfield, with a strong tackling mindset. Interviews went down a treat with clubs.'),
 ('Tyson Bradley', 'Big riser this year: calm, lock-down key defender and Vic Metro’s carnival MVP. Tested well for agility, leap and speed.'),
 ('Toby Krasna', 'Ball-winning midfielder with an endurance and speed mix (6:10 2km, 3.0 sec 20m). Missed games with a hamstring late in the carnival.'),
 ('Jackson Phillips', 'Contest-to-contest midfielder with real running power, a good kick and goal sense. Not a huge ball-winner but versatile around the centre. Missed the 2km with a back issue.'),
 ('George Dimer', 'Quick, smart small forward/midfielder who jumps above his size, has clean hands and applies pressure. Third in the Combine agility test.'),
 ('Harvie Cooke', 'Morrish Medallist (Talent League best player) who then tested strongly. Competitive midfielder who uses the ball well and kicks goals.'),
 ('Khaled El Souki', 'Western Bulldogs NGA small forward with strong goal sense, defensive pressure and a left foot; kicked three on his VFL debut.'),
 ('Noah Williams', 'Hard-working inside midfielder and a captain at three levels. Interrupted year (hamstring, then groin/hip) meant he missed Combine testing.'),
 ('Jack Pickett', 'Mystery bolter: a knee reconstruction early in the season wiped out his year. Clubs will lean on his 2025 tape (31 goals in eight games); accurate key forward with natural craft.'),
 ('Jake Eime', 'Dashing half-back who ran a top-10 2km. Played SANFL League late in the year but can’t join Adelaide’s academy after a listing error.'),
 ('Albert MacGowan', 'Pure runner who won the 2km in a pool-best 5:59. Relentless two-way midfielder who was consistent for Vic Metro.'),
 ('George Gale', 'Tall midfielder (191cm) with a strong aerobic base who played WAFL League finals for Claremont.'),
 ('Billy Wigmore', 'One of the best overhead and intercept marks in the draft, though at 188cm that role won’t translate directly. Had huge games for the Western Jets.'),
 ('Archie Elliott', 'Forward flyer with marking strength and craft; once kicked seven in a game. Seen as a second-round chance.'),
 ('Kodah Edwards', 'SA captain and forward/midfielder who was dangerous deep in attack at U18 level. Five SANFL League games and tested quick at the state screening.'),
 ('Keenan Boi', 'Hawthorn NGA prospect who won Gippsland’s best and fairest in their flag year. Has pace and creates, but needs more endurance.'),
]
RM = ['Dougie Cochrane', 'Cody Walker', 'Arki Butler', 'Gus Teixeira', 'Heath Mellody', 'Ethan Matthews', 'Ethan Drever', 'Harry Van Hattum', 'Clancy Snell', 'Leo Steed',
      'Wil Malady', 'Caylen Murray', 'Mitch Harris', 'Sam Gayfer', 'Tyson Bradley', 'Jackson Phillips', 'Toby Krasna', 'Khaled El Souki', 'George Dimer', 'Kodah Edwards',
      'Noah Williams', 'Jack Pickett', 'Jake Eime', 'Lochie Burrows', 'George Gale', 'Marlon Neocleous', 'Harrison Chapman', 'Ethan Herbert', 'Gabriel Patterson', 'Archie Elliott',
      'Koby LeCras', 'Xavier Ladbrook', 'Jack Slattery', 'Zac Antonellos', 'Harvie Cooke', 'Gus Kennedy', 'Archie Van Dyk', 'Albert MacGowan', 'Blake Justice', 'Wil Antrobus',
      'Sam Devers', 'Oliver Bartal', 'Hugh McCallum', 'Archie Spencer', 'Billy Wigmore', 'Darcy Szerszyn', 'Jordan Knapp', 'Cody Templeton', 'Harper Banfield']
W = {'tw': 0.40, 'rm': 0.35, 'zh': 0.25}

prof = json.load(open('lib/draft-profiles-2026.json'))
by = {p['name']: p for p in prof}
assert all(n in by for n, _ in TW), [n for n, _ in TW if n not in by]
ZH_MAX = max((p.get('zh') or {}).get('rank') or 0 for p in prof)
score = {}
for i, (n, note) in enumerate(TW, 1):
    p = by[n]
    rm = RM.index(n) + 1 if n in RM else None
    zh = (p.get('zh') or {}).get('rank')
    ranks = {'tw': i, 'rm': rm or len(RM) + 1, 'zh': zh or ZH_MAX + 1}
    score[n] = sum(W[k] * v for k, v in ranks.items())
    p['boards'] = {'twomey': {'rank': i, 'note': note, 'url': TW_URL, 'date': '20 Oct 2026'},
                   'rookieme': {'rank': rm, 'url': RM_URL, 'date': 'Aug 2026', 'of': 50}, 'zh': zh}
for c, n in enumerate(sorted(score, key=lambda n: (score[n], [x for x, _ in TW].index(n))), 1):
    by[n]['boards']['consensus'] = c
    by[n]['boards']['score'] = round(score[n], 1)
json.dump(prof, open('lib/draft-profiles-2026.json', 'w'), indent=1, ensure_ascii=False)
for n, _ in TW:
    b = by[n]['boards']; print(f"{b['consensus']:2d} {n:18s} TW {b['twomey']['rank']:2d}  RM {str(b['rookieme']['rank'] or '-'):>2}  ZH {str(b['zh'] or '-'):>2}  ({b['score']})")
