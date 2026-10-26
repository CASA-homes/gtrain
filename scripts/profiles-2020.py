"""Build lib/draft-profiles-2020.json: 2020 national draft profiles.
Facts, strengths, work-ons and junior numbers from Rookie Me's 2020 draft guide (data/rm-structured.json);
pre-draft scouting read from ESPN's final 2020 phantom draft (Chris Doerre). Summaries are our own short read, not their text."""
import sys, io, contextlib, json, re
sys.path.insert(0, 'scripts')
with contextlib.redirect_stdout(io.StringIO()):
    from crystal import H, junior, parse_rows
ESPN = {'title': 'ESPN 2020 final phantom draft', 'url': 'https://www.espn.com/afl/story/_/id/30478295/afl-draft-2020-phantom-draft-chris-doerre-espn-full-final-phantom-draft'}
SUM = {
 'Jamarra Ugle-Hagan': 'Consensus No.1: a high-leaping key forward who times his jumps perfectly and has more ways to beat a defender than any forward his age.',
 'Riley Thilthorpe': 'A 200cm forward/ruck already holding his own in the SANFL seniors, with a strong mark, good ground-level craft and rare acceleration for his size.',
 'Will Phillips': 'The best pure inside midfielder in the pool: wins it in close, tackles hard and bursts away from stoppages, with 2019 finals form compared to the previous year’s top mids.',
 'Logan McDonald': 'Led the WAFL goal-kicking for much of the year and made the Team of the Year; improving so fast that scouts saw a future top key forward.',
 'Braeden Campbell': 'Rated the best kick in the draft, with run and carry, contested ball and tackling to go with it; could play midfield, half-back or forward.',
 'Denver Grainger-Barras': 'The top key defender of the year: athletic, a lockdown stopper and a strong intercept mark, who beat Logan McDonald one-on-one in the WAFL.',
 'Elijah Hollands': 'Arguably the highest impact-per-touch player in the pool: penetrating kick, aggressive run and evasion, dangerous forward of centre. Slid only because of an ACL.',
 'Nik Cox': 'A 200cm athlete who could play key forward, key back or wing: elite endurance, good skills and decisions, strong overhead and clean at ground level.',
 'Archie Perkins': 'Damaging utility who drives the ball with run and carry, hits targets inside 50 and doubles as a marking forward.',
 'Zach Reid': 'Versatile tall with leap and endurance who could ruck but looked best in defence; one of the best kicks seen from a 200cm player.',
 'Luke Pedlar': 'Physical, aggressive mid-forward: strong in the contest, bursts from stoppages, tackles hard and kicks goals in bunches.',
 'Tanner Bruhn': 'Smart goal-kicking midfielder who used it well by hand and foot and won a lot of it contested; 2018 Vic Country U16 MVP before an injury-hit 2019.',
 'Tom Powell': 'Prolific stoppage midfielder and best player in the SANFL Under-18s: elite contested ball and handball distribution.',
 'Heath Chapman': 'Tall intercepting defender who rebounds well, kicks precisely and moves like a much smaller player.',
 'Conor Stone': 'Medium forward who leads well inside 50, has tricks around goal and likes to take opponents on; five goals on NAB League debut.',
 'Lachie Jones': 'Powerful, long-kicking defender who already stood up in SANFL League football, with the contested game to move into the midfield later.',
 'Oliver Henry': 'Medium marking type who can play forward or back: strong overhead, intercepts behind the ball and leads well up forward.',
 'Ryan Angwin': 'One of the youngest in the pool: light but filling out fast, an elite endurance runner and a competitive contested-ball utility.',
 'Finlay Macrae': 'Classy midfielder in the mould of brother Jack: rare evasion and composure with the ball, able to play inside or out.',
 'Max Holmes': 'Raw but a standout athlete with elite speed (his mother was an Olympic medallist); barely played in 2019, so a long-term bet.',
 'Jake Bowey': 'Small, composed and quick: runs and carries, sidesteps opponents and wins it at ground level; can play mid, forward or back.',
 'Bailey Laurie': 'Quick, evasive small forward who can push through the midfield, finds targets inside 50 and keeps working with second and third efforts.',
 'Reef McInnes': 'Tall midfielder with a December birthday and lots of upside: speed, agility, ball-winning and marking, though he played mostly in defence in 2019.',
 'Blake Coleman': 'Lively pressure forward with clean hands and good skills; seen as further along than older brother Keidean at the same age.',
 'Matthew McLeod-Allison': 'Strong-marking tall forward who reads the ball well in flight and runs all day.',
 'Brayden Cook': 'Bolter who grew 7cm in a year: athletic marking forward averaging two goals a game in the SANFL Under-18s, also able to play a wing.',
 "Nathan O'Driscoll": 'Played WAFL League as a teenager: aggressive at the ball, hard tackler, big work rate and a penetrating kick, inside, outside or across half-back.',
 'Sam Berry': 'Hard-nosed inside midfielder who wins a lot of it contested and tackles strongly, with acceleration out of stoppages and neat delivery.',
 'Seamus Mitchell': 'Small-medium forward with speed and goal sense; a late pick on upside.',
 'Caleb Poulter': 'Fast-developing tall midfielder: long kick, explosive speed and strong overhead, with forward-of-centre impact as a fallback.',
 'Liam McMahon': 'Raw key forward who attacks the ball at its highest point, with good leap and speed for a tall.',
 'Errol Gulden': 'Small outside mid-forward with one of the best junior records in the pool: precise kick, clean hands, speed and scoreboard impact.',
 'Shannon Neale': 'Athletic ruck who switched from athletics to footy: big leap, endurance and good skills, early in his development but improving fast.',
 'Fraser Rosman': 'Freak athlete at 194cm (elite 2km time and top-10 sprint): a project as a tall wing or key forward.',
 'Connor Downie': 'Outside runner with a damaging long kick, agility and line-breaking speed.',
 'Charlie Lazzaro': 'Busy, competitive midfielder who racked up the ball for Geelong Falcons; a value pick on production.',
 'Corey Durdin': 'Quick, small goal-kicking forward already playing SANFL League: forward pressure, ground-level craft and dare.',
 'James Rowe': 'Mature crumbing forward who kicked 47 goals in 17 SANFL League games: quick, evasive and daring.',
 'Josh Eyre': 'Late-growing tall athlete with speed, endurance and a big leap; injury-hit juniors meant plenty of untapped upside.',
 'Samson Ryan': 'Tall ruck prospect from the Lions Academy; a long-term development pick.',
 'Jack Carroll': 'Young, classy midfielder who moved from the outside into a genuine inside role and improved quickly in 2020.',
 'Phoenix Spicer': 'Possibly the fastest in the draft: elite speed and agility, instinctive one-touch play, a project as a crumbing forward.',
 'Harry Sharp': 'Former national steeplechase champion who broke the combine 2km record; a wing prospect praised for his work ethic.',
 'Beau McCreery': 'Mature-age pressure forward from South Adelaide; picked for his tackling and work rate.',
 'Tom Highmore': 'Mature-age defender who intercepts well and drives the ball by foot and run; proved himself in the NEAFL and SANFL.',
 'Tyler Brockman': 'Speedy, high-pressure small forward who makes things happen with the ball.',
 'Nick Stevens': 'Tall utility from the GWV Rebels; a late pick on size and ball-winning.',
 'Henry Smith': 'Ruck-forward from Woodville-West Torrens; a long-term tall project.',
 'Ollie Lord': 'Key forward from Sandringham; a raw late pick on size and marking.',
 'Brandon Walker': 'Explosive half-back who breaks lines with run, sidesteps and fends, kicks long and takes big intercept marks.',
 'Maurice Rioli Jr.': 'Arguably the best pressure forward in the pool: relentless tackling, speed and an instinct for goal.',
 'Luke Edwards': 'Productive midfielder from Glenelg who accumulated well at SANFL and state level.',
 'Cody Brand': 'Shutdown key defender with strength and athleticism; once kicked three goals when swung forward.',
 'Joel Western': 'Small, slick midfielder with acceleration out of stoppages; one of the best athletes in the pool.',
 'Dominic Bedendo': 'Forward-midfielder from the Murray Bushrangers; a late pick on athleticism.',
 'Eddie Ford': 'Athletic utility with a big vertical leap who could play forward, mid or back with class and composure.',
 'Isiah Winder': 'Athletic utility who tested well across the board: speed, leap, strong hands and composed kicking.',
 'Cameron Fleeton': 'Defender from the Geelong Falcons who reads the play and uses the ball well.',
 'Jacob Wehr': 'Mature-age late bloomer and one of the best kicks out of defence in the draft.',
}
EXTRA = {   # players without a Rookie Me 2020 entry: strengths and work-ons from the ESPN read
 'Nik Cox': (['Endurance', 'Versatility', 'Overhead marking', 'Decision making', 'Ground level craft'], ['Strength']),
 'Lachie Jones': (['Power', 'Long kick', 'Defensive work', 'Contested ball'], []),
 'Matthew McLeod-Allison': (['Overhead marking', 'Reading the ball', 'Endurance'], []),
 'Josh Eyre': (['Athleticism', 'Leap', 'Overhead marking', 'Endurance'], ['Durability']),
 'Maurice Rioli Jr.': (['Forward pressure', 'Speed', 'Ground level craft', 'Goal sense'], []),
 'Jacob Wehr': (['Kicking', 'Composure', 'Upside'], []),
 'Beau McCreery': (['Forward pressure', 'Tackling'], []),
}
rm = json.load(open('data/rm-structured.json'))
def ht(s):
    m = re.search(r'(\d{3})', s or ''); return int(m.group(1)) if m else None
def dob(s):
    m = re.match(r'(\d\d)-(\d\d)-(\d{4})', s or ''); return f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else None
LEAGUE = lambda t: 'NAB League' if t.endswith(('Chargers', 'Dragons', 'Rebels', 'Power', 'Falcons', 'Bushrangers', 'Pioneers', 'Ranges', 'Cannons', 'Knights', 'Jets', 'Stingrays')) else 'Academy' if 'Academy' in t else 'U18 Championships' if t in ('Western Australia', 'South Australia', 'Vic Metro', 'Vic Country', 'Allies') else 'SANFL/WAFL'
out = []
for d in sorted([d for d in H if d['y'] == 2020], key=lambda d: d['p']):
    n = d['n']; r = rm.get('2020|' + n) or {}
    j = junior(r.get('rows', []), 2020) if r else None
    games = None
    if j:
        games = next((int(x['gm']) for x in parse_rows(r['rows'], 2020) if x['team'] == j['team'] and x['yr'] == j['season']), None)
    stats = []
    if j:
        stats = [{'label': 'Disposals', 'value': f"{j['D']:.1f}"}, {'label': 'Marks', 'value': f"{j['M']:.1f}"}, {'label': 'Tackles', 'value': f"{j['T']:.1f}"}, {'label': 'Goals', 'value': f"{j['G']:.1f}"}]
        if j['FP'] and j['FP'] > 20: stats.append({'label': 'Fantasy', 'value': f"{round(j['FP'])}"})
    st, im = (r.get('str') or [], r.get('imp') or []) if r else EXTRA.get(n, ([], []))
    prof = {'year': 2020, 'name': n.replace('+', ''), 'junior': d.get('f') or (j or {}).get('team') or '', 'position': r.get('pos') or None,
            'height': ht(r.get('ht')) or d.get('ht'), 'dob': dob(r.get('dob')) or d.get('dob'), 'projection': r.get('range') or None,
            'statsFrom': f"{j['season']} {j['team']} ({LEAGUE(j['team'])}{f', {games} games' if games else ''})" if j else None,
            'stats': stats or None, 'strengths': st[:6], 'improvements': im[:3], 'summary': SUM.get(n.replace('+', ''), SUM.get(n, '')),
            'source': {'title': '2020 draft profile', 'url': f"https://central.rookieme.com/afl/player/{r['slug']}/"} if r.get('slug') else ESPN}
    out.append({k: v for k, v in prof.items() if v not in (None, [], '')} | {'strengths': st[:6], 'improvements': im[:3]})
missing = [o['name'] for o in out if not o.get('summary')]
json.dump(out, open('lib/draft-profiles-2020.json', 'w'), indent=1, ensure_ascii=False)
print(len(out), 'profiles; no summary:', missing)
