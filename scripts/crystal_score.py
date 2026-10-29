# Score 2026 prospects with the fitted crystal-ball model and write lib/crystal-ball.json for the site.
import json, math, re, sys
import numpy as np
sys.path.insert(0, 'scripts')
from crystal import GROUPS, IMPS, SMAP, IMAP, norm, junior, train, table, players as ALL, dfs_rec, junior_games, DFS_CACHE  # noqa: E402
import crystal_model as cm  # noqa: E402  (fits + validates on import)

model = cm.m
FEATS = cm.FEATS

def kw_group(s, gmap):
    s = norm(s)
    if s in gmap: return gmap[s]
    for t, g in sorted(gmap.items(), key=lambda kv: -len(kv[0])):
        if len(t) >= 5 and t in s: return g
    return None

RM = json.load(open('data/rm-structured.json'))
PROF = {p['name']: p for p in json.load(open('lib/draft-profiles-2026.json'))}
_PT = open('lib/phantom-2026.ts').read()
PH = [(int(r), n) for r, n in re.findall(r"rank: (\d+), name: '([^']*)'", _PT)]
# After the national draft: rank is the actual pick and each entry carries the club that took him.
DRAFTED = bool(re.search(r'DRAFT_2026_DONE\s*=\s*true', _PT))
CLUB = {m.group(1): m.group(2) for m in re.finditer(r"name: '([^']*)'[^\n]*?club: '([^']*)'", _PT)}
ALIAS = {'Mitch Harris': 'Mitchell Harris'}

from crystal import role_of, combine_flags, H as HIST  # noqa: E402
NOW_AVG = {(d['y'], d['n']): next((a for (y, g, a) in (d.get('h') or []) if y == 2026 and g >= 5), None) for d in HIST}
PEAK = {(d['y'], d['n']): max([a for (_, g, a) in (d.get('h') or []) if g >= 8], default=None) for d in HIST}
# Current top players we can compare to: had a draft profile with traits, and average 95+ in 2026 (or 100+ peak).
CURRENT_STARS = [q for q in train if len(q['str']) >= 2 and ((NOW_AVG.get((q['year'], q['name'])) or 0) >= 95 or (q['peak'] or 0) >= 100)]
def vec(q):
    v = np.array(cm.fv(q, 10)[1:], dtype=float)
    return np.append(v, ((q.get('ht') or 186) - 186) / 4)
def comp_pool(role):
    """Compare like with like: rucks to ruck stars, talls to tall stars, everyone else to non-rucks."""
    if role == 'Ruck':
        pool = [q for q in train if q.get('role') == 'Ruck' and ((NOW_AVG.get((q['year'], q['name'])) or 0) >= 90 or (q['peak'] or 0) >= 90)]
    elif role in ('Tall utility', 'Key position'):
        pool = [q for q in CURRENT_STARS if q.get('role') != 'Ruck' and (q.get('ht') or 0) >= 189]
    else:
        pool = [q for q in CURRENT_STARS if q.get('role') != 'Ruck' and (q.get('ht') or 0) < 194]
    return pool if len(pool) >= 2 else [q for q in CURRENT_STARS if q.get('role') != 'Ruck']
# ---- Player type: what kind of footballer he is, so comparisons are like for like.
def afl_type(q):
    """Current AFL role from the last two AFL seasons (8+ games): centre bounces, kick-ins, goals, hitouts, kick ratio."""
    r = dfs_rec(q.get('id'))
    rows = sorted([c for c in (r or {}).get('career', []) if (c.get('league') or '').lower() == 'afl' and int(c.get('gms') or 0) >= 8], key=lambda c: int(c['year']))[-2:]
    if not rows: return None
    f = lambda k: sum(float(c.get(k) or 0) for c in rows) / len(rows)
    cba, ki, gl, ho, k2h = f('centreBounceAttendancePercentage'), f('kickins'), f('goals'), f('hitouts'), f('k2h')
    ht = q.get('ht') or 186
    if ho >= 12: return 'Ruck'
    if cba >= 50: return 'Inside mid'
    if ki >= 20: return 'Half-back'
    if ht >= 194 and cba < 20: return 'Key'
    if gl >= 1.2 or (gl >= 0.6 and cba < 20 and k2h < 1.8): return 'Forward'
    if gl >= 0.6 and cba >= 20: return 'Mid-forward'
    if cba >= 20: return 'Midfielder'
    return 'Wing'

def prospect_type(pos, role):
    """Listed position for a 2026 prospect -> the AFL types he should be compared with, best match first."""
    p = (pos or '').lower()
    if role == 'Ruck': return ['Ruck']
    if role == 'Key position': return ['Key', 'Half-back']
    if role == 'Tall utility': return ['Wing', 'Midfielder', 'Half-back'] if 'wing' in p else ['Key', 'Midfielder', 'Half-back']
    if 'small fwd' in p and 'mid' in p: return ['Mid-forward', 'Forward']
    if role == 'Small forward' or p.startswith('small'): return ['Forward', 'Mid-forward']
    if p.startswith('def') or 'mid/def' in p: return ['Half-back', 'Wing', 'Midfielder']
    if p.startswith('wing'): return ['Wing', 'Midfielder', 'Half-back']
    if 'mid' in p and 'fwd' in p: return ['Mid-forward', 'Midfielder', 'Forward']
    if p.startswith('fwd') or p == 'forward': return ['Forward', 'Mid-forward']
    return ['Inside mid', 'Midfielder', 'Mid-forward']

TYPE_LABEL = {'Inside mid': 'inside midfielder', 'Midfielder': 'midfielder', 'Mid-forward': 'midfielder-forward', 'Forward': 'forward',
              'Half-back': 'half-back', 'Wing': 'wing', 'Key': 'key position player', 'Ruck': 'ruck'}
# Comparison pool: every profiled draftee who has had an 85+ season or averages 85+ in 2026, typed by how he plays now.
COMP_POOL = []
for q in ALL:
    if (q['peak'] or 0) >= 85 or (NOW_AVG.get((q['year'], q['name'])) or 0) >= 85:
        t = afl_type(q)
        if t: COMP_POOL.append(dict(q, aflType=t))
print('comparison pool', len(COMP_POOL), {t: sum(1 for q in COMP_POOL if q['aflType'] == t) for t in TYPE_LABEL})

def comp_card(q):
    j = q.get('jun') or {}
    return {'name': q['name'].replace('+', ''), 'pick': q['pick'], 'year': q['year'], 'peak': round(q['peak'], 1),
            'now': NOW_AVG.get((q['year'], q['name'])), 'jFP': j.get('FP'), 'jT': j.get('T'), 'jD': j.get('D'),
            'scouts': q.get('rawstr', [])[:5], 'workons': q.get('rawimp', [])[:3], 'role': q.get('role'), 'type': TYPE_LABEL.get(q.get('aflType'), '')}
BASE = sum(p['label'] for p in train) / len(train)
def rate_for(f, lo, hi):
    sel = [p for p in train if f(p) is not None and lo <= f(p) < hi]
    return (sum(p['label'] for p in sel), len(sel)) if sel else (0, 0)
TAB = {g: (n, hits, rate, lift) for g, n, hits, rate, lift in table('str', GROUPS) + table('imp', IMPS)}
# Accumulators who made it: of draftees with the scouts' 'Accumulator' tag who played 50+ AFL games, how many had an
# 80+ season, against everyone else who played 50+. The tag doesn't predict making it; it predicts the ceiling.
def _afl_games(q):
    r = dfs_rec(q['id']) if q.get('id') else None
    return sum(int(c.get('gms') or 0) for c in (r or {}).get('career', []) if (c.get('league') or 'afl').lower() == 'afl')
def _made_stats(rows):
    made = [q for q in rows if _afl_games(q) >= 50]
    peaks = sorted(q['peak'] for q in made)
    return {'n': len(rows), 'made': len(made), 'rel': sum(1 for q in made if q['peak'] >= 80), 'star': sum(1 for q in made if q['peak'] >= 90),
            'medPeak': round(peaks[len(peaks) // 2], 1) if peaks else None}
ACC = _made_stats([q for q in train if 'Accumulator' in q['str']])
REST = _made_stats([q for q in train if 'Accumulator' not in q['str']])
ACC['examples'] = [q['name'].replace('+', '') for q in sorted([q for q in train if 'Accumulator' in q['str'] and q['peak'] >= 88], key=lambda q: -q['peak'])][:4]
print('accumulator ceiling:', ACC, 'vs', REST)

# Big junior games: juniors with per-game data (DFS, ~2019 drafts on) whose average was under 95 but who had a 140+ game.
_bg = [q for q in train if (q['jun'] or {}).get('max') and 20 < (q['jun']['FP'] or 0) < 95 and q['jun']['max'] >= 140]
_bg_exp = None
def big_game_stats():
    global _bg_exp
    if _bg_exp is None:
        pm = cm.LogisticRegression(C=10, max_iter=2000).fit(cm.X[:, :1], cm.y)
        _bg_exp = sum(float(pm.predict_proba([[-math.log(q['pick'])]])[0, 1]) for q in _bg)
    hits = [q for q in _bg if q['label']]
    return len(_bg), len(hits), len(hits) / max(_bg_exp, 1e-9), [f"{q['name']} ({q['jun']['FP']:.0f} avg, {q['jun']['max']:.0f} best)" for q in sorted(hits, key=lambda q: q['pick'])]
print('big-game juniors:', big_game_stats())

def big_game_line(j):
    """Note for a junior with a big single game on record, or None."""
    mx, fp = (j or {}).get('max') or 0, (j or {}).get('FP') or 0
    if mx < 130: return None
    n120 = j.get('g120') or 0
    games = f"best junior game {mx:.0f}" + (f", {n120} games of 120+" if n120 >= 2 else '')
    if fp < 95 and mx >= 140:
        n, h, lift, ex = big_game_stats()
        return {'good': True, 'text': f"Big-game ceiling: {games}, well above his {fp:.0f} average. Juniors averaging under 95 who still had a 140+ game became 90+ players at {lift:.1f}× their draft slots ({h} of {n}: {', '.join(ex)}). A few huge games say the scoring is in him."}
    return {'good': True, 'text': f"Big-game ceiling: {games}. Goes big when it's on, not just a steady accumulator."}

# Rucks take time: how many AFL seasons after the draft before the rucks who made it first averaged 90+.
def _first_hit_season(q):
    yrs = sorted(y for (y, g, a) in (next((d.get('h') for d in HIST if d['y'] == q['year'] and d['n'] == q['name']), None) or []) if g >= 8 and a >= 90)
    return (yrs[0] - q['year']) if yrs else None
RUCK_TIME = sorted(((_first_hit_season(q), q['name'].replace('+', '')) for q in train if q.get('role') == 'Ruck' and q['label']), key=lambda t: t[0] or 99)
RUCK_TIME = [t for t in RUCK_TIME if t[0]]
print('ruck time to first 90+ season:', RUCK_TIME)

def why(p, contrib, role):
    lines = []
    bg = big_game_line(p.get('jun'))
    if bg: lines.append(bg)
    j = p.get('jun') or {}
    fp, t = j.get('FP'), j.get('T')
    if fp and fp >= 90:
        lo = 110 if fp >= 110 else 100 if fp >= 100 else 90
        h, n = rate_for(lambda q: (q['jun'] or {}).get('FP') if q['jun'] and q['jun']['FP'] > 20 else None, lo, 999)
        lines.append({'good': True, 'text': f"Junior fantasy average of {fp:.0f}. Draftees at {lo}+ became 90+ AFL Fantasy players {round(h / n * 100)}% of the time ({h} of {n}), against {round(BASE * 100)}% for all picks."})
    elif fp and fp < 85 and ((t or 0) >= 5 or (j.get('CLR') or 0) >= 4):
        lines.append({'good': True, 'text': f"Junior fantasy average of {fp:.0f} undersells him: {t or 0:.1f} tackles and {j.get('CLR') or 0:.1f} clearances a game. Low scorers with that contested work became stars at about 1.2–1.3× their draft slots: a hidden scorer."})
    elif fp and fp < 85:
        lines.append({'good': False, 'text': f"Junior fantasy average of {fp:.0f}. Not counted against him on its own (his pick and other numbers already say more), but most stars scored 90+ as juniors, so he'd be doing it a different way."})
    if t and t >= 4.5:
        lo = 6 if t >= 6 else 4.5
        h, n = rate_for(lambda q: (q['jun'] or {}).get('T') if q['jun'] and q['jun']['FP'] > 20 else None, lo, 99)
        lines.append({'good': True, 'text': f"{t:.1f} tackles a game. Juniors laying {lo}+ became stars {round(h / n * 100)}% of the time: hunters score, as Warner, Berry and Brayshaw showed."})
    for k, v in contrib:
        if k in TAB and k not in ('Junior fantasy avg', 'Junior tackles', 'Big junior games (140+)'):
            n, hits, rate, lift = TAB[k]
            label = k.replace('needs ', 'work-on: ')
            if v > 0:
                lines.append({'good': True, 'text': f"Scouts noted {label.lower()}. {hits} of {n} draftees with that note became 90+ players, {lift:.1f}× what their draft slots predicted."})
            else:
                lines.append({'good': False, 'text': f"Scouts noted {label.lower()}: only {hits} of {n} with that note became 90+ players ({lift:.1f}× their draft slots)."})
    if 'Accumulator' in p['str'] and ACC['made']:
        lines.append({'good': True, 'text': f"Accumulator. The tag doesn't tell you whether he'll make it, but it tells you how high he goes if he does: {round(ACC['rel'] / ACC['made'] * 100)}% of accumulators who played 50+ games had an 80+ season, against {round(REST['rel'] / REST['made'] * 100)}% of everyone else (best season typically {ACC['medPeak']:.0f} vs {REST['medPeak']:.0f}). {', '.join(ACC['examples'][:3])}."})
    if 'endurance' in (p.get('combine') or []): lines.append({'good': True, 'text': 'Top-10 endurance at the national combine. Elite runners became stars at 1.3× their draft slots (Brayshaw, Warner, Berry, Noah Anderson, Lachie Ash).'})
    if 'power' in (p.get('combine') or []): lines.append({'good': False, 'text': 'Top-10 speed or jump at the combine: pure athletes have become fantasy stars less often than their draft slots suggested.'})
    if role == 'Key position': lines.append({'good': False, 'text': 'Key-position role. Almost no key defenders or forwards have become 90+ fantasy players, however good they are as footballers.'})
    elif role == 'Small forward': lines.append({'good': False, 'text': 'Small-forward role. Fewer touches and stoppages make big fantasy scores rare unless he moves into the midfield.'})
    elif role == 'Tall utility': lines.append({'good': False, 'text': 'Tall utility. Big bodies who can play through the midfield sit between key forwards (almost never stars) and midfielders: they usually become solid 75–90 scorers, and the odd one (Noah Anderson, Bontempelli, Goddard) becomes a star.'})
    elif role == 'Ruck':
        yrs = [t[0] for t in RUCK_TIME]
        wait = f" But it takes time: the rucks who made it first averaged 90+ in year {min(yrs)}–{max(yrs)} after the draft (typically year {sorted(yrs)[len(yrs) // 2]}; {', '.join(f'{n} {y}' for y, n in RUCK_TIME)}). Expect little before then." if yrs else ''
        lines.append({'good': True, 'text': 'Ruck. Rucks who make it are fantasy gold; they produced stars at a higher rate than their draft slots suggested.' + wait})
    flags = dict(zip(cm.PROFILES, cm.profile_flags(p)))
    if flags.get('Class + production'): lines.append({'good': True, 'text': 'Class plus production: a skilled, smart ball user who also wins a lot of it. The modern star profile (Nick Daicos, Will Ashcroft, Jagga Smith, Levi Ashcroft).'})
    if flags.get('Pure runner / athlete'): lines.append({'good': False, 'text': 'Sold mainly on running or athleticism, with no skill or contested tag. Across the 2016–24 drafts that profile produced almost no fantasy stars (Hollands, Ginbey, Dylan Stephens types topped out in the 70s).'})
    if flags.get('Accumulator without class'): lines.append({'good': False, 'text': 'Accumulator without a class or contested tag. Volume alone hasn’t translated: none of the 2016–24 accumulators sold only on ball-winning became stars (Robertson, Schoenberg, Rowston).'})
    if flags.get('Tall (192cm+, not a ruck)') and role not in ('Key position', 'Ruck'): lines.append({'good': False, 'text': '192cm or taller. No non-ruck tall drafted 2016–24 has had a 90+ season so far (0 of 90+).'})
    return lines

AFL_JG = json.load(open('data/junior-games-2026.json'))['players']
# DFS ids for prospects (they appear in DFS's player list once they're on an AFL list, i.e. after the draft)
try:
    DFS_ID = {norm(p['playerName']): p['playerId'] for p in json.load(open(f'{DFS_CACHE}/names.json'))['players'].values()}
except Exception:
    DFS_ID = {}
pick_model = cm.LogisticRegression(C=10, max_iter=2000).fit(cm.X[:, :1], cm.y)
out = []
for rank, name in PH:
    prof = PROF.get(name)
    rm = RM.get('2026|' + ALIAS.get(name, name)) or {}
    ht = (prof or {}).get('height') or int(re.sub(r'\D', '', rm.get('ht', '') or '0')[:3] or 0)
    strs = list((prof or {}).get('strengths', [])) + list(rm.get('str') or []) + list(((prof or {}).get('zh') or {}).get('strengths') or [])
    imps = list((prof or {}).get('improvements', [])) + list(rm.get('imp') or [])
    st = sorted({g for g in (kw_group(s, SMAP) for s in strs) if g})
    if any('goals' in norm(s) or 'scoreboard' in norm(s) for s in strs): st = sorted(set(st) | {'Scoreboard impact'})
    im = sorted({g for g in (kw_group(s, IMAP) for s in imps) if g})
    if any('volume' in norm(s) or 'production' in norm(s) for s in imps): im = sorted(set(im) | {'needs to win more ball'})
    if any('consisten' in norm(s) for s in imps): im = sorted(set(im) | {'needs consistency'})
    j = junior(rm.get('rows', []), 2026) if rm else None
    jg = junior_games(DFS_ID.get(norm(name)), 2026) if DFS_ID.get(norm(name)) else None
    if not jg and name in AFL_JG:   # per-game AF from the AFL match centre (Talent League + U18 champs, 2025–26)
        gs = [x for yr in AFL_JG[name].values() for comp in yr.values() for x in comp]
        if gs:
            best_yr = max(AFL_JG[name], key=lambda y: max((x for c in AFL_JG[name][y].values() for x in c), default=0))
            jg = {'max': float(max(gs)), 'maxYr': int(best_yr), 'g120': sum(1 for x in gs if x >= 120), 'g150': sum(1 for x in gs if x >= 150), 'gms': len(gs)}
    if j and jg: j = {**j, 'max': jg['max'], 'maxYr': jg['maxYr'], 'g120': jg['g120'], 'g150': jg.get('g150'), 'jGames': jg.get('gms')}
    listed = ((prof or {}).get('position') or rm.get('pos') or '').lower().replace('fwd', 'forward').replace('def', 'defender').replace('mid', 'midfielder').replace('ruc', 'ruck')
    role = role_of(listed, ht, strs)
    p = {'name': name, 'str': st, 'imp': im, 'jun': j, 'ht': ht, 'role': role, 'combine': combine_flags(2026, ALIAS.get(name, name))}
    # Before the draft the pick slot is the consensus of Twomey / Rookie Me / Zero Hanger; after it, the real pick.
    brd = (prof or {}).get('boards') or {}
    slot = rank if DRAFTED else brd.get('consensus', rank)
    x = np.array(cm.fv(p, slot))
    off = cm.prior_offset(p)
    prob = cm.prob(model, x, role, offset=off)
    prob_rel = cm.prob(cm.m_rel, x, role, cm.ROLE_CAL_REL, offset=off)
    pos_only = float(pick_model.predict_proba([x[:1]])[0, 1])
    eff = {FEATS[i]: float(model.coef_[0][i] * x[i]) for i in range(1, len(FEATS))}
    # One junior-scoring line on the page: the low-output penalty and the big-numbers boost are two halves of the same thing
    eff['Junior fantasy avg'] = eff.pop('Low junior numbers', 0) + eff.pop('Big junior numbers (95+)', 0)
    contrib = sorted([(k, v) for k, v in eff.items() if abs(v) > 0.08], key=lambda t: -abs(t[1]))
    types = prospect_type((prof or {}).get('position', ''), role)
    out.append({'rank': rank, 'name': name, 'slot': slot, 'boards': {'tw': (brd.get('twomey') or {}).get('rank'), 'rm': (brd.get('rookieme') or {}).get('rank'), 'zh': brd.get('zh')}, 'club': CLUB.get(name), 'drafted': DRAFTED, 'junior': (prof or {}).get('junior') or (j or {}).get('team', ''), 'position': (prof or {}).get('position', ''), 'height': ht, 'role': role,
                'jFP': j and j['FP'], 'jD': j and j['D'], 'jT': j and j['T'], 'jSeason': j and j.get('season'), 'jMax': (j and j.get('max')) or (jg and jg['max']), 'j120': (j and j.get('g120')) or (jg and jg['g120']), 'traits': st, 'flags': im,
                'chance': round(prob * 100, 1), 'relevant': round(prob_rel * 100, 1), 'positionOnly': round(pos_only * 100, 1),
                'reasons': [{'label': k, 'effect': round(v, 2)} for k, v in contrib[:5]],
                'why': why(p, contrib, role), 'type': TYPE_LABEL[types[0]], 'ceiling': 'Accumulator' in st,
                '_vec': vec(p), '_types': types})

# Comparisons: same type first (a worse type match costs 1.5), nearest profile, and each current player used at most
# twice across the board so the same few names don't repeat. Best prospects choose first.
used = {}
for r in sorted(out, key=lambda r: -r['chance']):
    cands = []
    for q in COMP_POOL:
        if q['aflType'] not in r['_types']: continue
        if r['role'] in ('Key position', 'Tall utility') and (q.get('ht') or 0) < (187 if r['_types'][0] == 'Wing' else 189): continue
        tier = r['_types'].index(q['aflType'])
        d = float(np.linalg.norm(r['_vec'] - vec(q))) + 1.5 * tier + 0.9 * used.get(q['name'], 0)
        if used.get(q['name'], 0) >= 2: continue
        cands.append((d, q['name'], q))
    cands.sort(key=lambda t: t[:2])
    picks = [q for _, _, q in cands[:3]]
    for q in picks: used[q['name']] = used.get(q['name'], 0) + 1
    r['comps'] = [comp_card(q) for q in picks]
for r in out: r.pop('_vec'); r.pop('_types')

out.sort(key=lambda r: -r['chance'])
for r in out:
    print(f"{r['rank']:2d} {r['name']:20s} {r['type'][:12]:12s} {r['role']:13s} 90+ {r['chance']:5.1f}% 80+ {r['relevant']:5.1f}% (slot {r['positionOnly']:4.1f}%) comps {', '.join(c['name'] for c in r['comps'])}")

# Patterns for the page (hit rate + lift beyond draft position)
pat = []
for g, n, hits, rate, lift in table('str', GROUPS): pat.append({'kind': 'strength', 'label': g, 'n': n, 'hits': hits, 'rate': round(rate, 3), 'lift': round(lift, 2)})
for g, n, hits, rate, lift in table('imp', IMPS): pat.append({'kind': 'workon', 'label': g, 'n': n, 'hits': hits, 'rate': round(rate, 3), 'lift': round(lift, 2)})
def bucket(f, cuts, label):
    res = []
    for lo, hi in cuts:
        sel = [p for p in train if f(p) is not None and lo <= f(p) < hi]
        if not sel: continue
        hits = sum(p['label'] for p in sel); exp = sum(p['exp'] for p in sel)
        res.append({'label': label(lo, hi), 'n': len(sel), 'hits': hits, 'rate': round(hits / len(sel), 3), 'lift': round(hits / exp, 2) if exp else 0})
    return res
num = {
    'juniorFantasy': bucket(lambda p: p['jun']['FP'] if p['jun'] and p['jun']['FP'] > 20 else None, [(0, 75), (75, 90), (90, 100), (100, 110), (110, 200)], lambda lo, hi: f'Under {hi}' if lo == 0 else (f'{lo}+' if hi == 200 else f'{lo}–{hi}')),
    'juniorDisposals': bucket(lambda p: p['jun']['D'] if p['jun'] and p['jun']['FP'] > 20 else None, [(0, 15), (15, 20), (20, 25), (25, 60)], lambda lo, hi: f'Under {hi}' if lo == 0 else (f'{lo}+' if hi == 60 else f'{lo}–{hi}')),
    'juniorTackles': bucket(lambda p: p['jun']['T'] if p['jun'] and p['jun']['FP'] > 20 else None, [(0, 3), (3, 4.5), (4.5, 6), (6, 20)], lambda lo, hi: f'Under {hi}' if lo == 0 else (f'{lo}+' if hi == 20 else f'{lo}–{hi}')),
    'height': bucket(lambda p: p['ht'], [(0, 180), (180, 186), (186, 193), (193, 230)], lambda lo, hi: f'Under {hi}cm' if lo == 0 else (f'{lo}cm+' if hi == 230 else f'{lo}–{hi - 1}cm')),
    'pick': bucket(lambda p: p['pick'], [(1, 6), (6, 11), (11, 21), (21, 41), (41, 100)], lambda lo, hi: f'Picks {lo}–{hi - 1}' if hi < 100 else f'Pick {lo}+'),
}
val = []
pred_oos = {p['name']: p for p in train}
for n in ['Will Ashcroft', 'Nick Daicos', 'Harry Sheezel', 'Bailey Smith', 'Nasiah Wanganeen-Milera', 'Caleb Serong', 'Zak Butters', 'Errol Gulden', 'Chad Warner', 'Sam Berry', 'Jake Bowey+', 'Jase Burgoyne']:
    p = pred_oos.get(n)
    if not p: continue
    i = train.index(p)
    val.append({'name': n.replace('+', ''), 'year': p['year'], 'pick': p['pick'], 'peak': round(p['peak'], 1), 'chance': round(p['oos'] * 100, 1), 'positionOnly': round(float(cm.predp[i]) * 100, 1),
                'jFP': p['jun'] and p['jun']['FP'], 'traits': p['str']})
late_hits = [p for p in train if p['label'] and p['pick'] >= 20]
meta = {'relBar': 80, 'aucRel': round(cm.roc_auc_score(cm.yr_, cm.pred_r), 3), 'hitBar': 90, 'trainN': len(train), 'trainHits': int(sum(p['label'] for p in train)), 'years': '2016–2025',
        'auc': round(cm.roc_auc_score(cm.y, cm.pred), 3), 'aucPositionOnly': round(cm.roc_auc_score(cm.y, cm.predp), 3),
        'aucLate': round(cm.roc_auc_score(cm.y[cm.late], cm.pred[cm.late]), 3), 'aucLatePositionOnly': round(cm.roc_auc_score(cm.y[cm.late], cm.predp[cm.late]), 3),
        'accumulator': {'acc': ACC, 'rest': REST}, 'ruckTime': [{'name': n, 'years': y} for y, n in RUCK_TIME], 'neutral': sorted(cm.NEUTRAL), 'priors': cm.PRIOR,
        'lateHits': [{'name': p['name'].replace('+', ''), 'pick': p['pick'], 'year': p['year'], 'peak': round(p['peak'], 1)} for p in sorted(late_hits, key=lambda p: -p['peak'])]}
json.dump({'meta': meta, 'patterns': pat, 'numbers': num, 'validation': val, 'prospects': out,
           'coef': {k: round(float(v), 2) for k, v in zip(FEATS, model.coef_[0])}, 'roleCal': cm.ROLE_CAL}, open('lib/crystal-ball.json', 'w'), indent=1)
print('wrote lib/crystal-ball.json')
