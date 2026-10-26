# Crystal ball: which draft-profile traits and junior numbers predicted AFL Fantasy stars?
# Inputs: lib/draft-history.json (picks + AFL careers), data/rm-structured.json (Rookie Me profile traits/stats).
import json, os, re, math, collections, sys
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

H = json.load(open('lib/draft-history.json'))
RM = json.load(open('data/rm-structured.json'))
HIT = 90.0      # "star" for fantasy: a season averaging 90+ (8+ games)
ELITE = 100.0
REL = 80.0      # "fantasy relevant": a season averaging 80+

GROUPS = {
  'Accumulator': ['accumulation', 'production', 'ball winning', 'accumulator'],
  'Contested / inside': ['contested work', 'contested ball', 'contested game', 'contested ball winning', 'contested ability', 'inside game', 'clearances', 'clearance work', 'stoppage craft', 'stoppage work', 'stoppage positioning', 'stoppage burst', 'ground balls', 'hardness', 'impact in the midfield', 'movement through traffic'],
  'Clean hands': ['clean hands', 'cleanliness', 'cleanness', 'quick hands', 'clean at ground level', 'clean', 'cleanness at ground level'],
  'Footy IQ / vision': ['decision making', 'footy iq', 'football iq', 'smarts', 'footy smarts', 'football smarts', 'vision', 'reading the play', 'reading of the play', 'poise', 'composure', 'composed', 'class', 'classy', 'creativity', 'skills and decision making'],
  'Kicking / skills': ['kicking', 'skills', 'skill', 'kick penetration', 'penetrating kick', 'ball use', 'disposal efficiency', 'foot skills', 'dual-sided', 'dual-footed', 'dual footed', 'two-footed', 'clean skills', 'efficiency', 'kicking efficiency', 'kick efficiency', 'kicking skills', 'long kicking', 'kicking accuracy', 'distribution'],
  'Engine / work rate': ['endurance', 'work rate', 'work-rate', 'running capacity', 'running power', 'ground coverage', 'two-way running', 'speed-endurance mix', 'speed/endurance mix', 'gut running', 'outside run', 'work ethic', 'two-way effort', 'energy', 'spread'],
  'Consistency': ['consistency'],
  'Speed / agility': ['speed', 'acceleration', 'explosiveness', 'agility', 'evasiveness', 'evasion', 'explosive speed', 'burst', 'pace', 'speed/agility', 'five-step burst', 'line-breaking', 'breaking the lines', 'run-and-carry', 'run and carry', 'agile'],
  'Athleticism': ['athleticism', 'vertical leap', 'leap', 'mobility', 'vertical jump'],
  'Aerial / marking': ['overhead marking', 'aerial ability', 'marking', 'contested marking', 'intercept marking', 'reach', 'leading patterns', 'aerial impact', 'good overhead mark', 'marking on the lead', 'marking inside 50'],
  'Scoreboard impact': ['scoreboard impact', 'goal sense', 'forward craft', 'finishing', 'goalkicking', 'goal kicking', 'set shot goalkicking', 'set shot goal kicking'],
  'Leadership / character': ['leadership', 'competitiveness', 'character', 'attitude', 'professionalism', 'resilience', 'intensity', 'courage', 'leadership/competitiveness', 'voice', 'coachability', 'confidence', 'toughness', 'aggression'],
  'Defensive pressure': ['tackling', 'defensive pressure', 'pressure', 'defensive effort', 'tackling pressure', 'pressure acts', 'defensive acts', 'defensive work', 'defensive traits', 'accountability'],
  'Intercept / rebound': ['rebounding', 'intercepting', 'intercept game', 'intercept ability', 'one-on-ones', 'positioning', 'rebound run', 'defensive versatility'],
  'X-factor / hurt': ['x-factor', 'hurt factor', 'impact', 'dare', 'flair', 'big game player', 'big game performer', 'game-winning ability', 'impact per possession'],
  'Upside': ['upside', 'scope', 'rate of development', 'raw'],
  'Size / strength': ['size', 'strength', 'physicality', 'power', 'powerful', 'core strength', 'mature body'],
  'Versatility': ['versatility', 'versatile'],
  'Ruck craft': ['ruck craft', 'ruck work', 'ruckwork', 'follow-up work', 'follow-up'],
  'Inside-outside balance': ['inside-outside balance', 'inside/outside balance', 'balanced', 'balance'],
}
IMPS = {
  'needs strength/size': ['strength', 'size', 'physicality', 'size/strength', 'strength/size'],
  'needs endurance': ['endurance', 'running capacity', 'gut running', 'running power'],
  'needs consistency': ['consistency', 'four-quarter consistency', 'four quarter consistency', 'consistency within games', 'quarter-to-quarter consistency'],
  'needs speed/athleticism': ['speed', 'explosive speed', 'acceleration', 'athleticism', 'agility', 'explosiveness'],
  'needs kicking': ['kicking', 'kicking consistency', 'kick consistency', 'kicking under pressure', 'kicking at speed', 'kicking on the run', 'kicking technique', 'field kicking', 'kicking composure', 'kicking efficiency', 'kicking penetration', 'disposal consistency', 'ball use', 'disposal efficiency', 'opposite foot', 'consistency by foot', 'disposal under pressure', 'impact per kick'],
  'needs contested/inside game': ['contested game', 'contested work', 'contested ball', 'contested ball winning', 'inside game', 'midfield craft', 'ground balls', 'midfield development', 'hands in close'],
  'needs outside game': ['outside game'],
  'needs to win more ball': ['accumulation', 'production', 'offensive output', 'ball winning', 'four-quarter production'],
  'needs defensive work': ['defensive pressure', 'defensive craft', 'defensive game', 'defensive work rate', 'defensive running', 'tackling', 'tackle pressure', 'tackling pressure', 'defensive acts', 'defensive habits', 'repeat defensive effort', 'one-on-one defending'],
  'needs composure/decisions': ['composure', 'decision making'],
  'durability concern': ['durability', 'post-injury durability', 'injury durability'],
  'raw / limited exposure': ['raw', 'rawness', 'exposure', 'limited exposure', 'rawness/exposure'],
  'needs finishing': ['scoreboard impact', 'finishing', 'conversion', 'set shot goalkicking', 'set shot goal kicking', 'set shot consistency', 'goalkicking accuracy', 'goal kicking', 'finishing consistency'],
}
def norm(s): return re.sub(r'\s+', ' ', s.lower().strip())
SMAP = {t: g for g, ts in GROUPS.items() for t in ts}
IMAP = {t: g for g, ts in IMPS.items() for t in ts}

def parse_rows(rows, year):
    out = []
    for r in rows:
        t = r.split()
        nums = []
        i = len(t) - 1
        while i > 0 and re.fullmatch(r'-?[\d.]+', t[i]):
            nums.insert(0, float(t[i])); i -= 1
        if len(nums) < 21: continue
        team = ' '.join(t[1:i + 1])
        gm = nums[12] or 1
        out.append({'yr': int(t[0]), 'team': team, 'gm': nums[12], 'D': nums[15], 'M': nums[16], 'T': nums[18], 'G': nums[19], 'FP': nums[20],
                    'CLR': nums[8] / gm, 'I50': nums[9] / gm, 'R50': nums[10] / gm, 'HO': nums[17]})
    return out

REP = re.compile(r'^(Vic Metro|Vic Country|South Australia|Western Australia|Allies|Queensland|NSW/ACT|Tasmania|Northern Territory|AFL Academy)', re.I)
def junior(rows, year):
    """Best junior fantasy line: the draft (top-age) year first; if he barely played it (injury), the year before;
    failing that, two years back (usually Under 16s) at a 10% discount."""
    allr = [r for r in parse_rows(rows, year) if r['gm'] >= 2]
    rs = [r for r in allr if r['yr'] in (year, year - 1)]
    top = [r for r in rs if r['yr'] == year] or rs
    back2 = False
    if not top:
        top = [r for r in allr if r['yr'] == year - 2]; back2 = True
    if not top: return None
    best = dict(max(top, key=lambda r: r['FP']))
    if back2: best['FP'] = round(best['FP'] * 0.9, 1)
    prev = [r for r in rs if r['yr'] == year - 1]
    return {'FP': best['FP'], 'HO': best['HO'], 'D': best['D'], 'T': best['T'], 'M': best['M'], 'G': best['G'], 'CLR': best['CLR'], 'I50': best['I50'],
            'rep': any(REP.match(r['team']) for r in rs + top), 'prevFP': max((r['FP'] for r in prev), default=None), 'team': best['team'],
            'season': best['yr']}

def range_mid(s):
    s = (s or '').lower()
    m = re.findall(r'\d+', s)
    if 'pick 1' in s: return 1
    if 'top' in s and m: return int(m[0]) / 2
    if len(m) >= 2: return (int(m[0]) + int(m[1])) / 2
    if 'first' in s: return 12
    if 'second' in s: return 30
    if 'third' in s: return 45
    if 'late' in s or 'rookie' in s: return 55
    if m: return int(m[0]) + 5
    return None

def posgroup(pos, ht):
    p = (pos or '').lower()
    if 'ruck' in p: return 'RUC'
    if 'key' in p or (ht and ht >= 194): return 'KEY'
    if 'mid' in p or 'wing' in p: return 'MID'
    if 'def' in p: return 'DEF'
    if 'forw' in p: return 'FWD'
    return 'MID'

RUCK_TRAITS = {'ruck craft', 'ruck work', 'ruckwork', 'ruck nous', 'hitouts'}
def role_of(pos, ht, strs):
    """Fantasy role from the draft profile. Only players listed as rucks are rucks; key position = listed key/tall,
    or 194cm+ with no listed position; small forward = listed small forward (not a mid), or 178cm or under listed as a forward."""
    p = (pos or '').lower()
    ht = ht or 0
    if 'ruck' in p: return 'Ruck'
    if not p and any(norm(s) in RUCK_TRAITS for s in strs or []): return 'Ruck'
    # Tall players listed as utilities or midfielders (Bontempelli/Goddard types) get their own role: they can play
    # through the middle, so they are not written off like pure key position players.
    if ht >= 188 and ('util' in p or (('key' in p or 'tall' in p) and 'mid' in p) or ('mid' in p or 'wing' in p) and ht >= 190): return 'Tall utility'
    if 'key' in p or 'tall' in p: return 'Key position'
    if not p and ht >= 194: return 'Key position'
    if 'mid' in p or 'wing' in p: return 'Midfielder'
    if 'small forward' in p or ('forward' in p and ht and ht <= 178): return 'Small forward'
    if 'def' in p: return 'Defender'
    if 'forward' in p: return 'Forward'
    return 'Midfielder' if not p and ht and ht < 194 else 'Unknown'

def peak(h):
    xs = [a for (_, g, a) in (h or []) if g >= 8]
    return max(xs) if xs else 0.0

DFS_CACHE = os.environ.get('DFS_CACHE', '/tmp/claude-0/-home-claude/29f08a6b-131d-545f-988a-2f0ce595c883/scratchpad/dfs-cache')
_SNAP = None
def dfs_rec(pid):
    """DFS career record: the local pull cache if there is one, else the committed snapshot (data/dfs-careers.json.gz)."""
    global _SNAP
    import os, gzip
    if not pid: return None
    f = os.path.join(DFS_CACHE, f'{pid}.json')
    if os.path.exists(f): return json.load(open(f))
    if _SNAP is None:
        snap = 'data/dfs-careers.json.gz'
        _SNAP = json.load(gzip.open(snap, 'rt')) if os.path.exists(snap) else {}
    return _SNAP.get(pid)
def career_hitouts(pid):
    r = dfs_rec(pid)
    if not r: return 0
    g = sum(int(c.get('gms') or 0) for c in r.get('career', []) if (c.get('league') or 'afl').lower() == 'afl')
    ho = sum(float(c.get('hitouts') or 0) * int(c.get('gms') or 0) for c in r.get('career', []) if (c.get('league') or 'afl').lower() == 'afl')
    return ho / g if g else 0

COMBINE = json.load(open('data/combine-top10.json'))
CGROUPS = {'endurance': ['2km time trial', 'Yo-yo', '3km time trial', 'Beep test'], 'power': ['20m sprint', 'Standing vertical jump', 'Running vertical jump']}
_ck = lambda n: re.sub('[^a-z]', '', n.lower())
_CB = {}
for _y, _v in COMBINE.items():
    for _t, _rows in _v['tests'].items():
        for _r in _rows:
            for _g, _ts in CGROUPS.items():
                if _t in _ts: _CB.setdefault((int(_y), _ck(_r['name'])), set()).add(_g)
def combine_flags(year, name): return sorted(_CB.get((year, _ck(name)), set()))

JUNIOR_LEAGUES_X = {'afl', 'vfl', 'sanfl', 'wafl'}
def junior_games(pid, year):
    """Per-game junior scoring from DFS (Talent League, SANFL/WAFL under-18s, nationals), draft year and the year before:
    best single game and how many games went 120+ / 150+. DFS has these from roughly the 2019 draft on, and only once a
    player is on an AFL list, so draft prospects pick this up after they're drafted."""
    r = dfs_rec(pid) or {}
    rs = [c for c in r.get('career', []) if (c.get('league') or '').lower() not in JUNIOR_LEAGUES_X
          and int(c.get('year') or 0) in (year, year - 1) and int(c.get('gms') or 0) >= 1]
    if not rs: return None
    best = max(rs, key=lambda c: float(c.get('maxFP') or 0))
    return {'max': float(best.get('maxFP') or 0), 'maxYr': int(best['year']), 'g120': sum(int(c.get('gm120') or 0) for c in rs),
            'gms': sum(int(c.get('gms') or 0) for c in rs)}

players = []
for d in H:
    k = f"{d['y']}|{d['n']}"
    r = RM.get(k)
    if not r: continue
    ht = int(re.sub(r'\D', '', r['ht'])[:3] or 0) or d.get('ht')
    st = sorted({SMAP[norm(s)] for s in r['str'] if norm(s) in SMAP})
    im = sorted({IMAP[norm(s)] for s in r['imp'] if norm(s) in IMAP})
    j = junior(r['rows'], d['y'])
    jg = junior_games(d.get('id'), d['y'])
    if j and jg: j = {**j, 'max': jg['max'], 'maxYr': jg['maxYr'], 'g120': jg['g120']}
    pk = peak(d.get('h'))
    mature = d['y'] <= 2022
    players.append({'id': d.get('id'), 'year': d['y'], 'pick': d['p'], 'name': d['n'], 'club': d['c'], 'ht': ht, 'pos': posgroup(r['pos'], ht), 'combine': combine_flags(d['y'], d['n']), 'role': ('Ruck' if (not r['pos'] and (max((x['HO'] for x in parse_rows(r['rows'], d['y'])), default=0) >= 8 or career_hitouts(d.get('id')) >= 8)) else role_of(r['pos'], ht, r['str'])), 'listed': r['pos'], 'str': st, 'imp': im,
                    'rawstr': r['str'], 'rawimp': r['imp'], 'jun': j, 'range': range_mid(r['range']), 'peak': pk,
                    'hit': pk >= HIT, 'elite': pk >= ELITE, 'mature': mature, 'rel': pk >= REL, 'rel_label': (1 if pk >= REL else (0 if mature else None)),
                    'label': (1 if pk >= HIT else (0 if mature else None))})

train = [p for p in players if p['label'] is not None]
print('profiles matched', len(players), 'trainable', len(train), 'hits', sum(p['label'] for p in train), 'elite', sum(p['elite'] for p in train))

# ---- pick-only baseline (expected hit chance from draft position)
def pick_feats(p): return [math.log(p['pick'])]
Xp = np.array([pick_feats(p) for p in train]); y = np.array([p['label'] for p in train])
pm = LogisticRegression(C=10).fit(Xp, y)
exp_hit = pm.predict_proba(Xp)[:, 1]
for p, e in zip(train, exp_hit): p['exp'] = e
print('pick model coef', pm.coef_, pm.intercept_, 'hit chance pick1', pm.predict_proba([[0]])[0, 1], 'pick10', pm.predict_proba([[math.log(10)]])[0, 1], 'pick30', pm.predict_proba([[math.log(30)]])[0, 1])

def table(key, groups):
    rows = []
    for g in groups:
        sel = [p for p in train if g in p[key]]
        if len(sel) < 8: continue
        hits = sum(p['label'] for p in sel); exp = sum(p['exp'] for p in sel)
        rows.append((g, len(sel), hits, hits / len(sel), hits / exp if exp else 0))
    rows.sort(key=lambda r: -r[4])
    return rows

base = sum(p['label'] for p in train) / len(train)
print(f'\nbase hit rate {base:.3f}')
print('\nSTRENGTHS: group, n, hits, hit rate, hits vs expected from pick')
for r in table('str', GROUPS): print(f'  {r[0]:28s} n={r[1]:3d} hits={r[2]:2d} rate={r[3]:.2f} lift={r[4]:.2f}')
print('\nIMPROVEMENTS:')
for r in table('imp', IMPS): print(f'  {r[0]:28s} n={r[1]:3d} hits={r[2]:2d} rate={r[3]:.2f} lift={r[4]:.2f}')

def bucket(name, f, cuts):
    print(f'\n{name}:')
    for lo, hi in cuts:
        sel = [p for p in train if f(p) is not None and lo <= f(p) < hi]
        if not sel: continue
        hits = sum(p['label'] for p in sel); exp = sum(p['exp'] for p in sel)
        print(f'  {lo}-{hi}: n={len(sel)} hits={hits} rate={hits/len(sel):.2f} lift={hits/exp if exp else 0:.2f}')
bucket('junior fantasy (best draft-year row)', lambda p: p['jun']['FP'] if p['jun'] else None, [(0, 60), (60, 75), (75, 90), (90, 100), (100, 110), (110, 200)])
bucket('junior disposals', lambda p: p['jun']['D'] if p['jun'] else None, [(0, 15), (15, 20), (20, 25), (25, 30), (30, 60)])
bucket('junior tackles', lambda p: p['jun']['T'] if p['jun'] else None, [(0, 3), (3, 4.5), (4.5, 6), (6, 20)])
bucket('height', lambda p: p['ht'], [(0, 180), (180, 185), (185, 190), (190, 195), (195, 230)])
bucket('pick', lambda p: p['pick'], [(1, 6), (6, 11), (11, 21), (21, 41), (41, 100)])
print('\nposition:')
for g in ['MID', 'DEF', 'FWD', 'KEY', 'RUC']:
    sel = [p for p in train if p['pos'] == g]
    if sel: print(f"  {g}: n={len(sel)} hits={sum(p['label'] for p in sel)} rate={sum(p['label'] for p in sel)/len(sel):.2f} lift={sum(p['label'] for p in sel)/sum(p['exp'] for p in sel):.2f}")
json.dump(players, open(os.path.join(os.environ.get('CRYSTAL_TMP', '/tmp'), 'players.json'), 'w'))
