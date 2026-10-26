"""Meld Zero Hanger's 2026 draft coverage and per-game junior AF scores into lib/draft-profiles-2026.json.
Zero Hanger: big-board ranks and the first-edition mock (picks 1-18, 18 Oct 2026), plus their eight full profiles.
Notes are our own short read, not their text. Per-game scores: data/junior-games-2026.json (AFL match centre)."""
import json
MOCK = 'https://www.zerohanger.com/afl-mock-draft-picks-1-18-first-edition-183889/'
P = 'https://www.zerohanger.com/afl-draft-profile-{}-potential-landing-spots-draft-range-strengths-{}/'
ZH = {
 'Dougie Cochrane': dict(rank=1, range='Top 3', mock='1 · Port Adelaide (matched bid)', landing=['Port Adelaide (NGA)'], strengths=['Kicking', 'Aerial impact', 'Versatility', 'Ready-made'],
    note='Their pick 1 even after knee surgery cost him a second straight national carnival. Came back in August for four SANFL League games across all three lines; already had five senior games and 10 goals in 2025. Key-forward frame who can play through the middle.', url=P.format('dougie-cochrane', 183981)),
 'Heath Mellody': dict(rank=2, mock='5 · West Coast', note='Larke Medallist and the best local option for the Eagles. Likely to start at half-back with the inside game to move into the midfield.'),
 'Ethan Drever': dict(rank=3, mock='6 · Melbourne', note='Seen as one of the favourites to be the first open-pool pick; a big-bodied midfielder Melbourne would love to see slide.'),
 'Arki Butler': dict(rank=4, mock='3 · Essendon', note='Match-winning forward/midfield hybrid with real X-factor; ticks best-available and list need for the Bombers.'),
 'Cody Walker': dict(rank=5, mock='2 · Carlton (matched bid)', note='A bid could come as early as pick 2, earlier than Carlton can comfortably match for their father-son.'),
 'Harry Van Hattum': dict(rank=6, mock='4 · Richmond', note='205cm ruck heavily linked to Richmond as the long-term replacement for Nankervis.'),
 'Gus Teixeira': dict(rank=7, mock='9 · Sydney', note='Best talent left at nine in their mock; often compared to Chad Warner.'),
 'Ethan Matthews': dict(rank=8, mock='8 · GWS (matched bid)', note='Rated the best Giants Academy product since Tom Green: a transition midfielder with upside who wins his own ball.'),
 'Mitch Harris': dict(rank=9, range='Picks 5–10', mock='7 · Richmond', landing=['Melbourne', 'Richmond', 'Sydney', 'Gold Coast'], strengths=['Competitiveness', 'Intercepting', 'Athleticism'],
    note='Rated the best tall defender in the crop: an aerial interceptor who can also lock down an opponent and doesn’t need the ball to impact. Played SANFL League late in the year. A fantasy long shot as a key back.', url=P.format('mitch-harris', '2026-184116')),
 'Leo Steed': dict(rank=10, mock='14 · Melbourne', note='176cm WA midfielder (Swan Districts) taken as best available.'),
 'Caylen Murray': dict(rank=11, mock='10 · Brisbane (matched bid)', note='Brisbane Academy defender; Gold Coast bid to make the Lions pay.'),
 'Wil Malady': dict(rank=12, mock='12 · St Kilda', note='Heads the next tier of talent; 190cm forward.'),
 'Sam Gayfer': dict(rank=13, mock='11 · Gold Coast', note='194cm key forward, heavily linked to Collingwood.'),
 'Tyson Bradley': dict(rank=14, mock='13 · Collingwood', note='196cm defender who has risen sharply this year.'),
 'Jake Eime': dict(rank=15, mock='17 · Adelaide', note='Rebounding defender; Adelaide’s bid to add him to their Next Generation Academy was knocked back.'),
 'George Gale': dict(rank=16, range='Picks 18–30', landing=['Fremantle', 'West Coast', 'Essendon'], strengths=['Running power', 'Marking', 'Strength'],
    note='WA co-captain who played well at every level: top five in the Larke Medal and held his own in WAFL League. Added size this year; plays the wing with the tools to move inside.', url=P.format('george-gale', 186639)),
 'George Dimer': dict(rank=17, range='Picks 12–25', mock='18 · GWS', landing=['GWS', 'Essendon', 'Fremantle', 'West Coast'], strengths=['Clean hands', 'Speed', 'Composure', 'Ball use'],
    note='Consensus best small forward: crumbs well, has a front-and-centre game and is rated highly for character. Broke out despite a pre-season hit by stress fractures; projects as a high half-forward.', url=P.format('george-dimer', 184122)),
 'Toby Krasna': dict(rank=18, range='Picks 15–25', mock='16 · Essendon', landing=['Melbourne', 'Essendon', 'Adelaide'], strengths=['Ball use', 'Aerobic capacity', 'Decision making', 'Composure'],
    note='Winger who rose into first-round talk: precise in transition, quick and agile, seventh in the combine 2km. Some inside-mid craft but needs size for that role. A hamstring ended his year early.', url=P.format('toby-krasna', 184123)),
 'Kodah Edwards': dict(rank=19), 'Jack Pickett': dict(rank=20, mock='15 · St Kilda', note='Out-and-out key forward; his year was interrupted by an early-season knee injury.'),
 'Clancy Snell': dict(rank=21), 'Lochie Burrows': dict(rank=22), 'Khaled El Souki': dict(rank=23), 'Albert MacGowan': dict(rank=24),
 'Keenan Boi': dict(rank=29, range='Picks 25–45', landing=['Hawthorn (academy)'], strengths=['Power', 'Goal sense', 'Pressure'],
    note='Powerful small forward who can play through the midfield; his pressure lifted sharply this year and he starred in Gippsland’s finals run. Needs a bigger aerobic base.', url=P.format('keenan-boi', 184090)),
}
JG = json.load(open('data/junior-games-2026.json'))['players']
prof = json.load(open('lib/draft-profiles-2026.json'))
for p in prof:
    z = ZH.get(p['name'])
    if z:
        p['zh'] = {k: v for k, v in {**z, 'url': z.get('url', MOCK)}.items()}
        p['zh']['source'] = 'Zero Hanger draft profile' if 'url' in z else 'Zero Hanger mock draft (1st edition, Oct 2026)'
    else: p.pop('zh', None)
    g = JG.get(p['name'])
    if g:
        allg = [x for y in g.values() for c in y.values() for x in c]
        seasons = []
        for yr in sorted(g, reverse=True):
            for comp, xs in g[yr].items():
                seasons.append({'label': f'{yr} {comp}', 'n': len(xs), 'avg': round(sum(xs) / len(xs), 1), 'best': max(xs), 'scores': xs})
        p['games'] = {'max': max(allg), 'g120': sum(x >= 120 for x in allg), 'g150': sum(x >= 150 for x in allg), 'n': len(allg), 'seasons': seasons}
    else: p.pop('games', None)
json.dump(prof, open('lib/draft-profiles-2026.json', 'w'), indent=1, ensure_ascii=False)
print(sum('zh' in p for p in prof), 'with Zero Hanger;', sum('games' in p for p in prof), 'with per-game scores')
