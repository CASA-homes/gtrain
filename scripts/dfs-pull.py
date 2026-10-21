"""Pull 2026 player data from DFS Australia for every rostered G-Train player.
Usage: python3 scripts/dfs-pull.py <cache_dir>  -> writes data/dfs-2026.json
"""
import json, os, re, sys, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor

CACHE = sys.argv[1] if len(sys.argv) > 1 else '/tmp/dfs-cache'
os.makedirs(CACHE, exist_ok=True)
URL = 'https://dfsaustralia.com/wp-admin/admin-ajax.php'

def post(data, cache_name=None):
    if cache_name:
        f = os.path.join(CACHE, cache_name)
        if os.path.exists(f):
            return json.load(open(f))
    body = urllib.parse.urlencode(data).encode()
    for _ in range(3):
        try:
            req = urllib.request.Request(URL, data=body, headers={'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded'})
            out = json.loads(urllib.request.urlopen(req, timeout=40).read())
            if cache_name:
                json.dump(out, open(os.path.join(CACHE, cache_name), 'w'))
            return out
        except Exception as e:
            err = e
    raise err

# Roster with the pre-trade club (DFS's 2026 row shows the club they played for)
old = {}
for m in re.finditer(r"\('(.+?)','(.+?)','(\w+)','(\w+)'\)", open('supabase/2026-trade-period.sql').read()):
    t, n, o, _ = [x.replace("''", "'") for x in m.groups()]
    old[(t, n)] = o
roster, team = [], None
for l in open('data/clubs-2026.txt'):
    l = l.strip()
    if not l or l.startswith('# '): continue
    if l.startswith('## '): team = l[3:]; continue
    n, c = l.split('|')
    roster.append((team, n, old.get((team, n), c)))

names = list(post({'action': 'afl_fantasy_player_name_list_mysql'}, 'names.json')['players'].values())
norm = lambda s: re.sub(r'\s+', ' ', s.lower().replace('’', "'")).strip()

def cands(n):
    ini, *rest = n.split(' ')
    sur = norm(' '.join(rest))
    return [p for p in names if norm(p['playerName']).endswith(' ' + sur) and norm(p['playerName'])[0] == ini[0].lower()]

def summary(pid):
    return post({'action': 'afl_fantasy_player_summary_call_mysql', 'playerId': pid}, pid + '.json')

def num(x):
    try: return float(x)
    except (TypeError, ValueError): return None

def avg(games, k):
    v = [num(g.get(k)) for g in games]
    v = [x for x in v if x is not None]
    return round(sum(v) / len(v), 1) if v else None

def record(team, n, club, pid, d):
    nm = (d.get('name') or [{}])[0]
    car = [c for c in d.get('career') or [] if (c.get('league') or '').lower() == 'afl']
    c26 = next((c for c in car if c['year'] == '2026'), None)
    g26 = [g for g in d.get('combinedGames') or [] if g.get('year') == '2026' and g.get('league') == 'AFL']
    o = dict(team=team, name=n, dfs_id=pid, full=nm.get('playerName'), dob=nm.get('dob'), draft_year=num(nm.get('draftYear')),
             height=num(nm.get('heightCm')), dfs_team=nm.get('teamAbbr'),
             career_games=int(sum(num(c.get('gms')) or 0 for c in car)),
             debut=min((int(c['year']) for c in car), default=None))
    # Year-by-year AFL Fantasy average: [year, games, average]
    o['hist'] = sorted([[int(c['year']), int(num(c.get('gms')) or 0), round(num(c.get('FP')) or 0, 1)] for c in car])
    box = {}
    if c26:
        for k, f in dict(gm='gms', k='kicks', h='handballs', m='marks', t='tackles', ho='hitouts', ff='freesFor', fa='freesAgainst',
                         g='goals', b='behinds', tog='timeOnGroundPercentage', cba='centreBounceAttendancePercentage', de='dispEff',
                         ki='kickins', rc='ruckContestPercentage', mx='maxFP', ppm='pointsPerMinute').items():
            box[k] = num(c26.get(f))
    if g26:
        for k, f in dict(cp='contestedPossessions', up='uncontestedPossessions', cl='totalClearances', mg='metresGained', i5='inside50s',
                         r5='rebound50s', it='intercepts', cm='contestedMarks', mi5='marksInside50', rp='ratingPoints').items():
            box[k] = avg(g26, f)
    o['box'] = {k: v for k, v in box.items() if v is not None} or None
    return o

def one(row):
    team, n, club = row
    best, bs = None, -1
    for p in cands(n)[:8]:
        d = summary(p['playerId'])
        nm = (d.get('name') or [{}])[0]
        c26 = next((c for c in d.get('career') or [] if c['year'] == '2026' and (c.get('league') or '').lower() == 'afl'), None)
        recent = any(int(c['year']) >= 2024 for c in d.get('career') or [])
        s = (10 if c26 and c26.get('teamAbbr') == club else 0) + (6 if nm.get('teamAbbr') == club else 0) + (3 if c26 else 0) + (1 if recent else 0)
        if s > bs: bs, best = s, (p['playerId'], d)
    if not best: return None, f'{n} ({club}): no match'
    return record(team, n, club, *best), (None if bs >= 6 else f'{n} ({club}): weak match {bs}')

with ThreadPoolExecutor(6) as ex:
    res = list(ex.map(one, roster))
out = [r for r, _ in res if r]
for _, w in res:
    if w: print('WARN', w)
json.dump(out, open('data/dfs-2026.json', 'w'), indent=0, ensure_ascii=False)
print(len(out), 'players written to data/dfs-2026.json')
