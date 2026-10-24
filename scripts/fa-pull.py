"""Free agents for the 2027 G-Train draft: reads data/keeper-fa-2027.tsv (unowned players from the Keeper board),
pulls each player's DFS career and writes data/fa-dfs.json. Usage: python3 scripts/fa-pull.py <cache_dir>"""
import csv, json, os, re, sys, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
CACHE = sys.argv[1] if len(sys.argv) > 1 else '/tmp/dfs-cache'; os.makedirs(CACHE, exist_ok=True)
URL = 'https://dfsaustralia.com/wp-admin/admin-ajax.php'
def post(data, name=None):
    f = name and os.path.join(CACHE, name)
    if f and os.path.exists(f): return json.load(open(f))
    body = urllib.parse.urlencode(data).encode(); err = None
    for _ in range(3):
        try:
            out = json.loads(urllib.request.urlopen(urllib.request.Request(URL, data=body, headers={'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded'}), timeout=40).read())
            if f: json.dump(out, open(f, 'w'))
            return out
        except Exception as e: err = e
    raise err
CLUB = {'Adelaide Crows':'ADE','Brisbane Lions':'BRL','Carlton':'CAR','Collingwood':'COL','Essendon':'ESS','Fremantle':'FRE','Geelong Cats':'GEE','Gold Coast Suns':'GCS','GWS Giants':'GWS','Hawthorn':'HAW','Melbourne':'MEL','North Melbourne':'NTH','Port Adelaide':'PTA','Richmond':'RIC','St Kilda':'STK','Sydney Swans':'SYD','West Coast Eagles':'WCE','Western Bulldogs':'WBD'}
names = list(post({'action': 'afl_fantasy_player_name_list_mysql'}, 'names.json')['players'].values())
norm = lambda s: re.sub(r'\s+', ' ', s.lower().replace('’', "'")).strip()
rows = [r for r in csv.DictReader(open('data/keeper-fa-2027.tsv'), delimiter='\t') if r['status'] not in ('DEL', 'RET')]
def num(x):
    try: return float(x)
    except (TypeError, ValueError): return None
def one(r):
    ini, *rest = r['name'].split(' '); sur = norm(' '.join(rest)); club = CLUB.get(r['club'])
    cs = [p for p in names if norm(p['playerName']).endswith(' ' + sur) and norm(p['playerName'])[0] == ini[0].lower()]
    best, bs = None, -1
    for p in cs[:8]:
        d = post({'action': 'afl_fantasy_player_summary_call_mysql', 'playerId': p['playerId']}, p['playerId'] + '.json')
        nm = (d.get('name') or [{}])[0]; car = d.get('career') or []
        c26 = next((c for c in car if c['year'] == '2026' and (c.get('league') or '').lower() == 'afl'), None)
        s = (10 if c26 and c26.get('teamAbbr') == club else 0) + (6 if nm.get('teamAbbr') == club else 0) + (3 if c26 else 0) + (1 if any(int(c['year']) >= 2024 for c in car) else 0)
        if s > bs: bs, best = s, (p['playerId'], d)
    o = dict(r)
    if best:
        pid, d = best; nm = (d.get('name') or [{}])[0]
        car = [c for c in d.get('career') or [] if (c.get('league') or '').lower() == 'afl']
        o.update(dfs_id=pid, full=nm.get('playerName'), dob=nm.get('dob'), height=num(nm.get('heightCm')), draft_year=num(nm.get('draftYear')),
                 hist=sorted([[int(c['year']), int(num(c.get('gms')) or 0), round(num(c.get('FP')) or 0, 1), num(c.get('centreBounceAttendancePercentage')), num(c.get('timeOnGroundPercentage'))] for c in car]),
                 match=bs)
    return o
with ThreadPoolExecutor(6) as ex: out = list(ex.map(one, rows))
json.dump(out, open('data/fa-dfs.json', 'w'), ensure_ascii=False)
print(len(out), 'written;', sum(1 for o in out if o.get('match', -1) < 6), 'weak/no matches')
for o in out:
    if o.get('match', -1) < 6: print('WEAK', o['name'], o['club'], o.get('full'), o.get('match'))
