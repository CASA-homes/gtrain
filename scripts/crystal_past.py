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
upd = {}
for n in range(1, 5):
    rows, ys = [], []
    for d in H:
        if not (2016 <= d['y'] <= 2021): continue
        sa = season_avgs(d.get('h'), d['y'])
        # Only use seasons strictly before any 90+ season, so the model learns from the path, not the destination.
        upto = {k: v for k, v in sa.items() if k <= n}
        best = max(upto.values()) if upto else 0
        played = 1 if upto else 0
        cb = {k: v for k, v in cba_by_season(d.get('id'), d['y']).items() if k <= n}
        role = role_for(d)
        rows.append([logit(hist_pre[(d['y'], d['n'])]), (best - 70) / 10 if played else 0, 0 if played else 1,
                     (max(cb.values()) - 30) / 20 if cb else 0, 1 if role == 'Key position' else 0, 1 if role == 'Small forward' else 0])
        ys.append(1 if any(g >= 8 and a >= HIT for (_, g, a) in (d.get('h') or [])) else 0)
    upd[n] = LogisticRegression(C=1.0, max_iter=2000).fit(np.array(rows), np.array(ys))
    print('updated-chance model season', n, '[pre, best avg, no games, CBA%, key pos, small fwd] coef', np.round(upd[n].coef_, 2))

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
    # Tracking: best season so far vs where eventual stars typically were by now.
    ref = path.get(min(n_now, 5))
    track = round(best_any / ref * 100) if (best_any and ref) else None
    if hit: status = 'Star'
    elif games == 0: status = 'Yet to debut'
    elif track is not None and track >= 100: status = 'On star track'
    elif track is not None and track >= 88: status = 'Close'
    elif best_any is None: status = 'Too early'
    else: status = 'Behind'
    if hit: now = 1.0
    else:
        nn = min(n_now, 4)
        cb_now = cba_by_season(d.get('id'), d['y'])
        role = role_for(d)
        x = [logit(pc), (best_any - 70) / 10 if best_any else 0, 0 if best_any else 1,
             (max(cb_now.values()) - 30) / 20 if cb_now else 0, 1 if role == 'Key position' else 0, 1 if role == 'Small forward' else 0]
        now = float(upd[nn].predict_proba([x])[0, 1])
    p = byname.get((d['y'], d['n']))
    cbs = cba_by_season(d.get('id'), d['y'])
    age = (d['y'] - int(d['dob'][:4])) if d.get('dob') else None
    past.append({'age': age, 'mature': bool(age and age >= 21),'year': d['y'], 'pick': d['p'], 'name': d['n'], 'club': d['c'],
                 'pre': round(pc * 100, 1), 'positionOnly': round(po * 100, 1), 'now': round(now * 100, 1),
                 'games': games, 'current': cur, 'best': round(best_any, 1) if best_any else None, 'peak': round(peak, 1) if peak else None,
                 'track': track, 'status': status, 'traits': (p or {}).get('str', []), 'jFP': ((p or {}).get('jun') or {}).get('FP'),
                 'seasons': [[y, g, round(a, 1)] for (y, g, a) in h if g > 0], 'role': role_for(d),
                 'cba': {str(d['y'] + k): v for k, v in sorted(cbs.items())}, 'state': state_lines(d.get('id'), d['y'])})

# Surprises: low pre-draft chance, but already a star or ahead of the star path.
sur = [r for r in past if r['pre'] < 20 and not r['mature'] and (r['status'] in ('Star', 'On star track'))]
sur.sort(key=lambda r: -((r['best'] or 0) - 70) / max(r['pre'], 3))
for r in sur[:12]: print('surprise', r['year'], r['pick'], r['name'], r['pre'], r['status'], r['best'], r['track'])
for yr in YEARS:
    rs = [r for r in past if r['year'] == yr]
    print(yr, {s: sum(1 for r in rs if r['status'] == s) for s in ['Star', 'On star track', 'Close', 'Behind', 'Yet to debut', 'Too early']})

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
