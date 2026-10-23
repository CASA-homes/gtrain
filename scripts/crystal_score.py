# Score 2026 prospects with the fitted crystal-ball model and write lib/crystal-ball.json for the site.
import json, math, re, sys
import numpy as np
sys.path.insert(0, 'scripts')
from crystal import GROUPS, IMPS, SMAP, IMAP, norm, junior, train, table  # noqa: E402
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
PH = re.findall(r"rank: (\d+), name: '([^']*)'", open('lib/phantom-2026.ts').read())
PH = [(int(r), n) for r, n in PH]
ALIAS = {'Mitch Harris': 'Mitchell Harris'}

pick_model = cm.LogisticRegression(C=10, max_iter=2000).fit(cm.X[:, :1], cm.y)
out = []
for rank, name in PH:
    prof = PROF.get(name)
    rm = RM.get('2026|' + ALIAS.get(name, name)) or {}
    ht = (prof or {}).get('height') or int(re.sub(r'\D', '', rm.get('ht', '') or '0')[:3] or 0)
    strs = (prof or {}).get('strengths', [])
    imps = (prof or {}).get('improvements', [])
    st = sorted({g for g in (kw_group(s, SMAP) for s in strs) if g})
    if any('goals' in norm(s) or 'scoreboard' in norm(s) for s in strs): st = sorted(set(st) | {'Scoreboard impact'})
    im = sorted({g for g in (kw_group(s, IMAP) for s in imps) if g})
    if any('volume' in norm(s) or 'production' in norm(s) for s in imps): im = sorted(set(im) | {'needs to win more ball'})
    if any('consisten' in norm(s) for s in imps): im = sorted(set(im) | {'needs consistency'})
    j = junior(rm.get('rows', []), 2026) if rm else None
    p = {'name': name, 'str': st, 'imp': im, 'jun': j, 'ht': ht}
    x = np.array(cm.fv(p, rank))
    prob = float(model.predict_proba([x])[0, 1])
    pos_only = float(pick_model.predict_proba([x[:1]])[0, 1])
    contrib = sorted([(FEATS[i], float(model.coef_[0][i] * (x[i] - (0 if i else -math.log(rank))))) for i in range(len(FEATS)) if i > 0 and abs(model.coef_[0][i] * x[i]) > 0.08], key=lambda t: -abs(t[1]))
    # Comparable past players: closest trait/junior-number profile among historical hits.
    def vec(q):
        v = np.array(cm.fv(q, 10)[1:], dtype=float)
        return np.append(v, ((q.get('ht') or 186) - 186) / 4)
    pv = vec(p)
    sims = []
    for q in train:
        if not q['label'] or len(q['str']) < 2: continue
        qv = vec(q)
        d = float(np.linalg.norm(pv - qv))
        sims.append((d, q['name'], q['pick'], q['year'], round(q['peak'], 1)))
    sims.sort()
    out.append({'rank': rank, 'name': name, 'junior': (prof or {}).get('junior') or (j or {}).get('team', ''), 'position': (prof or {}).get('position', ''), 'height': ht,
                'jFP': j and j['FP'], 'jD': j and j['D'], 'jT': j and j['T'], 'traits': st, 'flags': im,
                'chance': round(prob * 100, 1), 'positionOnly': round(pos_only * 100, 1),
                'reasons': [{'label': k, 'effect': round(v, 2)} for k, v in contrib[:5]],
                'comps': [{'name': s[1], 'pick': s[2], 'year': s[3], 'peak': s[4]} for s in sims[:3]]})

out.sort(key=lambda r: -r['chance'])
for r in out:
    print(f"{r['rank']:2d} {r['name']:20s} {r['chance']:5.1f}% (pos {r['positionOnly']:4.1f}%) jFP {r['jFP']} T {r['jT']} | {', '.join(r['traits'])} | {', '.join(r['flags'])} | comps {', '.join(c['name'] for c in r['comps'])}")

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
meta = {'hitBar': 90, 'trainN': len(train), 'trainHits': int(sum(p['label'] for p in train)), 'years': '2016–2025',
        'auc': round(cm.roc_auc_score(cm.y, cm.pred), 3), 'aucPositionOnly': round(cm.roc_auc_score(cm.y, cm.predp), 3),
        'aucLate': round(cm.roc_auc_score(cm.y[cm.late], cm.pred[cm.late]), 3), 'aucLatePositionOnly': round(cm.roc_auc_score(cm.y[cm.late], cm.predp[cm.late]), 3),
        'lateHits': [{'name': p['name'].replace('+', ''), 'pick': p['pick'], 'year': p['year'], 'peak': round(p['peak'], 1)} for p in sorted(late_hits, key=lambda p: -p['peak'])]}
json.dump({'meta': meta, 'patterns': pat, 'numbers': num, 'validation': val, 'prospects': out,
           'coef': {k: round(float(v), 2) for k, v in zip(FEATS, model.coef_[0])}}, open('lib/crystal-ball.json', 'w'), indent=1)
print('wrote lib/crystal-ball.json')
