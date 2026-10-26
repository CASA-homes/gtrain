# Crystal ball, previous drafts (2021–2025): pre-draft chance (out-of-sample), how each player is tracking,
# an updated chance given what he's done so far, and the biggest surprises. Adds a "past" block to lib/crystal-ball.json.
# Run after crystal_score.py.
import json, math, sys
import numpy as np
from sklearn.linear_model import LogisticRegression
sys.path.insert(0, 'scripts')
from crystal import players, train, H, HIT, dfs_rec  # noqa: E402
import crystal_model as cm  # noqa: E402

YEARS = [2021, 2022, 2023, 2024, 2025]
NOW = 2026
byname = {(p['year'], p['name']): p for p in players}

def cba_by_season(pid, year):
    """{season number: centre-bounce attendance %} from DFS (AFL seasons with 5+ games)."""
    r = dfs_rec(pid)
    out = {}
    for c in (r or {}).get('career', []):
        if (c.get('league') or 'afl').lower() != 'afl' or int(c.get('gms') or 0) < 5: continue
        try: out[int(c['year']) - year] = float(c.get('centreBounceAttendancePercentage') or 0)
        except (TypeError, ValueError): pass
    return out

STATE = {'vfl': 'VFL', 'sanfl': 'SANFL', 'wafl': 'WAFL'}
def state_lines(pid, year):
    """Seconds footy since the draft: VFL / SANFL / WAFL seasons with fantasy average, disposals, tackles, marks, goals."""
    r = dfs_rec(pid)
    out = []
    for c in (r or {}).get('career', []):
        lg = (c.get('league') or '').lower()
        if lg not in STATE or int(c.get('year') or 0) <= year or int(c.get('gms') or 0) < 1: continue
        f = lambda k: float(c.get(k) or 0)
        out.append({'league': STATE[lg], 'year': int(c['year']), 'games': int(c['gms']), 'fp': round(f('FP'), 1),
                    'disposals': round(f('kicks') + f('handballs'), 1), 'tackles': round(f('tackles'), 1), 'marks': round(f('marks'), 1), 'goals': round(f('goals'), 1)})
    return sorted(out, key=lambda x: -x['year'])

def role_for(d):
    p = byname.get((d['y'], d['n']))
    return (p or {}).get('role', 'Unknown')

def season_avgs(h, year):
    """{season number: avg} for seasons with 5+ games (season 1 = first year after the draft)."""
    return {y - year: a for (y, g, a) in (h or []) if g >= 5}

# Commissioner overrides for things the stats can't see yet (delistings, retirements). Delisted = near-zero.
OVERRIDES = {
    'Elijah Tsatas': ('delisted', 'Delisted by Essendon after 2026 (picked up by North). Couldn’t hold a spot over younger players.'),
}

def afl_seasons(pid, year, n):
    """AFL rows for seasons 1..n after the draft: (season no, games, fp, tog, ppm, gm100, cba)."""
    r = dfs_rec(pid)
    out = []
    for c in (r or {}).get('career', []):
        if (c.get('league') or 'afl').lower() != 'afl': continue
        k = int(c['year']) - year
        g = int(c.get('gms') or 0)
        if not (1 <= k <= n) or g < 1: continue
        f = lambda key: float(c.get(key) or 0)
        out.append((k, g, f('FP'), f('timeOnGroundPercentage'), f('pointsPerMinute'), int(f('gm100')), f('centreBounceAttendancePercentage')))
    return out

def state_games(pid, year, season):
    r = dfs_rec(pid)
    return sum(int(c.get('gms') or 0) for c in (r or {}).get('career', [])
               if (c.get('league') or '').lower() in STATE and int(c.get('year') or 0) == year + season)

K = 8  # shrink small samples toward a 55 average: 79 from 6 games reads like ~69, 79 from 22 games stays ~73+
def shrunk(g, fp): return (g * fp + K * 55) / (g + K)

def features(pid, year, n, pre_p, role):
    """Everything known by the end of season n. Returns (vector, facts for the reasons line)."""
    rows = afl_seasons(pid, year, n)
    games = sum(r[1] for r in rows)
    best = max((shrunk(r[1], r[2]) for r in rows), default=None)
    last = [r for r in rows if r[0] == n]
    last_s = shrunk(last[0][1], last[0][2]) if last else None
    avail = games / (22 * n)
    last_avail = (last[0][1] / 22) if last else 0
    g100 = sum(r[5] for r in rows)
    ceil = (g100 + 0.5) / (games + 6)                      # share of games 100+, shrunk
    ppm = max((r[4] for r in rows if r[1] >= 5), default=None)
    st = state_games(pid, year, n)
    stuck = st / (st + (last[0][1] if last else 0)) if st else 0
    cba = max((r[6] for r in rows if r[1] >= 5), default=0)
    x = [logit(pre_p),
         (best - 70) / 10 if best else -1.5,
         (last_s - 70) / 10 if last_s else -1.5,
         avail * 3, last_avail * 2,
         ceil * 10,
         (ppm - 0.9) / 0.15 if ppm else -1,
         stuck * 2,
         (cba - 30) / 20,
         1 if role == 'Key position' else 0, 1 if role == 'Small forward' else 0, 1 if role == 'Ruck' else 0]
    facts = {'games': games, 'avail': avail, 'g100': g100, 'stuck': stuck, 'st': st, 'last_g': last[0][1] if last else 0,
             'best': best, 'ppm': ppm, 'tog': max((r[3] for r in rows if r[1] >= 5), default=None)}
    return x, facts

# 1) Pre-draft chance for everyone in 2021–2025, from a model fitted without that draft year.
pre = {}
for yr in YEARS:
    tr = [p for p in train if p['year'] != yr]
    X = np.array([cm.fv(p, p['pick']) for p in tr]); y = np.array([p['label'] for p in tr])
    m = LogisticRegression(C=cm.C, max_iter=2000).fit(X, y)
    mp = LogisticRegression(C=10, max_iter=2000).fit(X[:, :1], y)
    for d in H:
        if d['y'] != yr: continue
        p = byname.get((yr, d['n'])) or {'str': [], 'imp': [], 'jun': None, 'ht': d.get('ht')}
        x = np.array(cm.fv(p, d['p']))
        pre[(yr, d['n'])] = (float(m.predict_proba([x])[0, 1]), float(mp.predict_proba([x[:1]])[0, 1]))

# 2) The star path: median average of eventual 90+ players in each season after the draft (drafts 2016–2022).
hits_hist = [d for d in H if d['y'] <= 2022 and any(g >= 8 and a >= HIT for (_, g, a) in (d.get('h') or []))]
path = {}
for n in range(1, 6):
    xs = [season_avgs(d['h'], d['y']).get(n) for d in hits_hist]
    xs = [x for x in xs if x]
    path[n] = float(np.median(xs)) if xs else None
print('star path (median avg of eventual 90+ players by season):', {k: round(v, 1) for k, v in path.items() if v})

# 3) Updated chance: given pre-draft chance and the latest season average at season n, trained on 2016–2021 drafts
#    (whose outcomes are known), one small model per season number.
def logit(p): p = min(max(p, 1e-3), 1 - 1e-3); return math.log(p / (1 - p))
hist_pre = {}
for yr in range(2016, 2022):
    tr = [p for p in train if p['year'] != yr]
    X = np.array([cm.fv(p, p['pick']) for p in tr]); y = np.array([p['label'] for p in tr])
    m = LogisticRegression(C=cm.C, max_iter=2000).fit(X, y)
    for d in H:
        if d['y'] != yr: continue
        p = byname.get((yr, d['n'])) or {'str': [], 'imp': [], 'jun': None, 'ht': d.get('ht')}
        hist_pre[(yr, d['n'])] = float(m.predict_proba([np.array(cm.fv(p, d['p']))])[0, 1])
def outcome(d): return 1 if any(g >= 8 and a >= HIT for (_, g, a) in (d.get('h') or [])) else 0
def made_by(d, n): return any(g >= 8 and a >= HIT and y - d['y'] <= n for (y, g, a) in (d.get('h') or []))
upd = {}
for n in range(1, 6):
    rows, ys = [], []
    for d in H:
        if not (2016 <= d['y'] <= 2021) or made_by(d, n): continue   # already a star by then: nothing to predict
        x, _ = features(d.get('id'), d['y'], n, hist_pre[(d['y'], d['n'])], role_for(d))
        rows.append(x); ys.append(outcome(d))
    upd[n] = LogisticRegression(C=0.5, max_iter=4000).fit(np.array(rows), np.array(ys))
    print('chance model season', n, 'n', len(ys), 'hits', sum(ys), 'coef', np.round(upd[n].coef_, 2))

# 3b) Comparables: for anyone with 10+ AFL games, the 25 historical players (drafts 2016-2021, same stage, same broad role)
#     who looked most like him: best average, latest season, games played, 100+ rate, centre bounces, time in the 2s.
#     His chance = how many of them went on to a 90+ season, smoothed toward the 10% base rate, then calibrated by stage.
def role_group(role): return 'ruck' if role == 'Ruck' else 'tall' if role in ('Key position', 'Tall utility') else 'mid'
def comp_vec(d_id, year, n, role, h, dob=None):
    rows = afl_seasons(d_id, year, n)
    games = sum(r[1] for r in rows)
    raw = max([a for (y, g, a) in (h or []) if g >= 8 and y - year <= n], default=None)
    last = [r for r in rows if r[0] == n and r[1] >= 5]
    lastraw = last[0][2] if last else (raw or 55) - 8
    g100 = sum(r[5] for r in rows)
    cba = max((r[6] for r in rows if r[1] >= 5), default=0)
    st = state_games(d_id, year, n)
    lg = [r for r in rows if r[0] == n]
    stuck = st / (st + (lg[0][1] if lg else 0)) if st else 0
    rg = role_group(role)
    return games, np.array([(raw or 55) / 8, lastraw / 8, games / (22 * n) * 3, g100 / max(1, games) * 8, (cba - 30) / 20 * 0.6, stuck * 2,
                            3 if rg == 'ruck' else 0, 1.5 if rg == 'tall' else 0,
                            max(0, (year - int(dob[:4]) if dob else 18) + n - 21) * 0.8])   # age this season, beyond 21
pool = {}
for n in range(1, 6):
    pool[n] = []
    for d in H:
        if not (2016 <= d['y'] <= 2021) or made_by(d, n): continue
        gm, v = comp_vec(d.get('id'), d['y'], n, role_for(d), d.get('h'), d.get('dob'))
        if gm >= 10: pool[n].append((d, v, outcome(d)))
def knn(v, n, excl_year=None, k=25):
    P = [p for p in pool[n] if p[0]['y'] != excl_year]
    ds = np.array([np.linalg.norm(p[1] - v) for p in P]); idx = np.argsort(ds)[:k]
    w = 1 / (0.5 + ds[idx]); y = np.array([P[i][2] for i in idx])
    return (np.sum(w * y) + 0.1 * 2) / (np.sum(w) + 2), [(P[i][0]['n'], P[i][2]) for i in idx]
cal = {}
for n in range(1, 6):
    raw_p = np.array([knn(v, n, excl_year=d['y'])[0] for d, v, _ in pool[n]]); ys = np.array([y for _, _, y in pool[n]])
    cal[n] = LogisticRegression(C=100).fit(np.log(raw_p / (1 - raw_p)).reshape(-1, 1), ys)
    print('comps season', n, 'pool', len(ys), 'hits', ys.sum())
def comp_chance(v, n, year):
    r, c = knn(v, n, excl_year=year)
    return float(cal[n].predict_proba([[math.log(r / (1 - r))]])[0, 1]), c

# 4) Score each 2021–2025 draftee.
past = []
for d in sorted([d for d in H if d['y'] in YEARS], key=lambda d: (d['y'], d['p'])):
    pc, po = pre[(d['y'], d['n'])]
    h = d.get('h') or []
    sa = season_avgs(h, d['y'])
    games = sum(g for (_, g, _) in h)
    last = [(y, g, a) for (y, g, a) in h if y == NOW and g > 0]
    cur = {'games': last[0][1], 'avg': round(last[0][2], 1)} if last else None
    n_now = NOW - d['y']                      # seasons available so far
    peak = max([a for (_, g, a) in h if g >= 8], default=None)
    best_any = max(sa.values()) if sa else None
    hit = bool(peak and peak >= HIT)
    nn = max(1, min(n_now, 5))
    role = role_for(d)
    x, fx = features(d.get('id'), d['y'], nn, pc, role)
    ref = path.get(min(n_now, 5))
    track = round(fx['best'] / ref * 100) if (fx['best'] and ref) else None
    model_p = float(upd[nn].predict_proba([x])[0, 1])
    gm_c, cv = comp_vec(d.get('id'), d['y'], nn, role, h, d.get('dob'))
    like = []
    if hit: now = 1.0
    elif gm_c >= 10:
        cp, cl = comp_chance(cv, nn, d['y'])
        w = min(1.0, gm_c / 30)                     # lean on comparables once there's a real sample
        now = w * cp + (1 - w) * model_p
        like = [nm + ('*' if y else '') for nm, y in cl[:6]]
    else: now = model_p
    age_now = (NOW - int(d['dob'][:4])) if d.get('dob') else None
    if not hit and age_now and age_now >= 30: now = min(now, 0.02)
    ov = OVERRIDES.get(d['n'])
    if ov and ov[0] == 'delisted' and not hit: now = min(now * 0.1, 0.02)
    # Reasons, plain English, worst first
    why = []
    if ov: why.append(ov[1])
    if not hit and age_now and age_now >= 30: why.append(f'{age_now} now: a veteran pick for points, not a future star')
    if not hit and games:
        if fx['avail'] < 0.5 and n_now >= 2: why.append(f"Plays {round(fx['avail'] * 100)}% of games ({games} from {22 * nn} available)")
        if fx['st'] >= 6 and fx['stuck'] >= 0.5: why.append(f"Stuck in the seconds: {fx['st']} state-league games v {fx['last_g']} AFL in {NOW if n_now <= 5 else d['y'] + nn}")
        if games >= 20 and fx['g100'] <= max(1, games // 20): why.append(f"Rarely goes big: {fx['g100']} of {games} games at 100+")
        if fx['ppm'] and fx['ppm'] >= 1.05 and fx['avail'] >= 0.5: why.append(f"Scores {fx['ppm']:.2f} a minute, star rate if the minutes come")
        if fx['g100'] >= 4 and games and fx['g100'] / games >= 0.15: why.append(f"Has the ceiling: {fx['g100']} games of 100+")
    # Status = chance of ever having a 90+ season
    if hit: status = 'Star'
    elif games == 0 and n_now <= 2: status = 'Yet to debut'
    elif n_now <= 1 and games < 5: status = 'Too early'
    elif now >= 0.5: status = 'On track'
    elif now >= 0.3: status = 'Close'
    elif now >= 0.1: status = 'Long shot'
    else: status = 'Unlikely'
    p = byname.get((d['y'], d['n']))
    cbs = cba_by_season(d.get('id'), d['y'])
    age = (d['y'] - int(d['dob'][:4])) if d.get('dob') else None
    past.append({'age': age, 'mature': bool(age and age >= 21),'year': d['y'], 'pick': d['p'], 'name': d['n'], 'club': d['c'],
                 'pre': round(pc * 100, 1), 'positionOnly': round(po * 100, 1), 'now': round(now * 100, 1),
                 'games': games, 'current': cur, 'best': round(fx['best'], 1) if fx['best'] else None, 'peak': round(peak, 1) if peak else None,
                 'track': track, 'status': status, 'why': why[:3], 'like': like, 'traits': (p or {}).get('str', []), 'jFP': ((p or {}).get('jun') or {}).get('FP'),
                 'seasons': [[y, g, round(a, 1)] for (y, g, a) in h if g > 0], 'role': role_for(d),
                 'cba': {str(d['y'] + k): v for k, v in sorted(cbs.items())}, 'state': state_lines(d.get('id'), d['y'])})

# Surprises: low pre-draft chance, but already a star or ahead of the star path.
sur = [r for r in past if r['pre'] < 20 and not r['mature'] and (r['status'] in ('Star', 'On track'))]
sur.sort(key=lambda r: -((r['best'] or 0) - 70) / max(r['pre'], 3))
for r in sur[:12]: print('surprise', r['year'], r['pick'], r['name'], r['pre'], r['status'], r['best'], r['track'])
for yr in YEARS:
    rs = [r for r in past if r['year'] == yr]
    print(yr, {s: sum(1 for r in rs if r['status'] == s) for s in ['Star', 'On track', 'Close', 'Long shot', 'Unlikely', 'Yet to debut', 'Too early']})

brk = []
for r in past:
    c = r['cba']
    if r['status'] == 'Star' or str(NOW) not in c or r['role'] == 'Ruck' or not r['current'] or r['current']['avg'] < 55: continue
    prev = c.get(str(NOW - 1))
    jump = c[str(NOW)] - (prev if prev is not None else 0)
    if c[str(NOW)] >= 30 and (prev is None or jump >= 15):
        brk.append((jump, r))
brk.sort(key=lambda t: -t[0])
for j, r in brk[:10]: print('breakout', r['year'], r['name'], r['cba'], r['now'], r['current'])
# Sleeper watch: 2024–25 draftees who've barely played AFL (8 games or fewer) but were rated highly, or are tearing up the seconds.
def best_state(r):
    xs = [x for x in r['state'] if x['games'] >= 4]
    return max(xs, key=lambda x: (x['year'], x['fp'])) if xs else None
slp = []
for r in past:
    if r['year'] not in (2024, 2025) or r['games'] > 8 or r['mature']: continue
    b = best_state(r)
    if not b: continue
    if r['pre'] >= 15 or r['pick'] <= 15 or b['fp'] >= 78:
        slp.append((b['fp'] + 0.6 * r['pre'], r))
slp.sort(key=lambda t: -t[0])
for _, r in slp[:12]: print('sleeper', r['year'], r['pick'], r['name'], r['pre'], r['games'], best_state(r))
D = json.load(open('lib/crystal-ball.json'))
D['past'] = {'years': YEARS, 'path': {str(k): round(v, 1) for k, v in path.items() if v}, 'players': past,
             'surprises': [r['name'] + '|' + str(r['year']) for r in sur[:8]],
             'breakouts': [r['name'] + '|' + str(r['year']) for _, r in brk[:8]],
             'sleepers': [r['name'] + '|' + str(r['year']) for _, r in slp[:8]]}
json.dump(D, open('lib/crystal-ball.json', 'w'), indent=1)
print('wrote past block:', len(past), 'players')
