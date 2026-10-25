"""Turn the unowned players (data/fa-dfs.json, from fa-pull.py) into full player rows for the site: same shape as
rostered players (box score, career history, every 2026 game), so ratings, attributes and player pages work for them.
Writes lib/free-agent-players.json. Usage: python3 scripts/fa-build.py <dfs_cache_dir>"""
import json, os, sys
CACHE = sys.argv[1] if len(sys.argv) > 1 else '/tmp/dfs-cache'
CLUB = {'Adelaide Crows':'ADE','Brisbane Lions':'BRL','Carlton':'CAR','Collingwood':'COL','Essendon':'ESS','Fremantle':'FRE','Geelong Cats':'GEE','Gold Coast Suns':'GCS','GWS Giants':'GWS','Hawthorn':'HAW','Melbourne':'MEL','North Melbourne':'NTH','Port Adelaide':'PTA','Richmond':'RIC','St Kilda':'STK','Sydney Swans':'SYD','West Coast Eagles':'WCE','Western Bulldogs':'WBD'}
def num(x):
    try: return float(x)
    except (TypeError, ValueError): return None
def avg(games, k):
    v = [num(g.get(k)) for g in games]; v = [x for x in v if x is not None]
    return round(sum(v) / len(v), 1) if v else None
out = []
for r in json.load(open('data/fa-dfs.json')):
    pid = r.get('dfs_id')
    d = json.load(open(os.path.join(CACHE, pid + '.json'))) if pid and os.path.exists(os.path.join(CACHE, pid + '.json')) else {}
    nm = (d.get('name') or [{}])[0]
    car = [c for c in d.get('career') or [] if (c.get('league') or '').lower() == 'afl']
    c26 = next((c for c in car if c['year'] == '2026'), None)
    g26 = [g for g in d.get('combinedGames') or [] if g.get('year') == '2026' and g.get('league') == 'AFL']
    box = {}
    if c26:
        for k, f in dict(gm='gms', k='kicks', h='handballs', m='marks', t='tackles', ho='hitouts', ff='freesFor', fa='freesAgainst', g='goals', b='behinds',
                         tog='timeOnGroundPercentage', cba='centreBounceAttendancePercentage', de='dispEff', ki='kickins', rc='ruckContestPercentage', mx='maxFP', ppm='pointsPerMinute').items():
            box[k] = num(c26.get(f))
    if g26:
        for k, f in dict(cp='contestedPossessions', up='uncontestedPossessions', cl='totalClearances', mg='metresGained', i5='inside50s', r5='rebound50s',
                         it='intercepts', cm='contestedMarks', mi5='marksInside50', rp='ratingPoints').items():
            box[k] = avg(g26, f)
    gi = lambda g, k: (int(num(g.get(k))) if num(g.get(k)) is not None else None)
    games = sorted([[gi(g, 'round'), gi(g, 'FP'), gi(g, 'timeOnGroundPercentage'), gi(g, 'kickins')] for g in g26 if num(g.get('FP')) is not None], key=lambda x: (x[0] is None, x[0] or 0))
    last5 = [None if r[k] in ('-', '') else int(float(r[k])) for k in ('r24', 'r23', 'r22', 'r21', 'r20')]
    ident = 10_000_000 + int(pid.split('I')[-1]) if pid else 20_000_000 + len(out)
    out.append({
        'id': ident, 'name': r['name'], 'full_name': nm.get('playerName') or None, 'positions': [{'D': 'DEF', 'M': 'MID', 'F': 'FWD', 'R': 'RUC', 'RUCK': 'RUC'}.get(x, x) for x in r['pos'].split('/')], 'afl_club': CLUB.get(r['club']),
        'birth_date': nm.get('dob') or None, 'draft_pick': None, 'draft_year': int(num(nm.get('draftYear'))) if num(nm.get('draftYear')) else None,
        'dfs_id': pid, 'height_cm': num(nm.get('heightCm')), 'debut_year': min((int(c['year']) for c in car), default=None),
        'career_games': int(sum(num(c.get('gms')) or 0 for c in car)),
        'hist': sorted([[int(c['year']), int(num(c.get('gms')) or 0), round(num(c.get('FP')) or 0, 1)] for c in car]),
        'box': {k: v for k, v in box.items() if v is not None} or None, 'games_log': games or None,
        'games': int(num(r['gp']) or 0), 'average': num(r['avg']) if int(num(r['gp']) or 0) else None, 'last5': last5,
        'status': None if r['status'] == 'FA' else r['status'], 'owned_pct': r['own'],
    })
json.dump({'updated': '2026-10-25', 'players': out}, open('lib/free-agent-players.json', 'w'), separators=(',', ':'), ensure_ascii=False)
print(len(out), 'players;', sum(1 for o in out if o['box']), 'with a 2026 box score;', os.path.getsize('lib/free-agent-players.json') // 1024, 'KB')
