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

from crystal import role_of, combine_flags, H as HIST  # noqa: E402
NOW_AVG = {(d['y'], d['n']): next((a for (y, g, a) in (d.get('h') or []) if y == 2026 and g >= 5), None) for d in HIST}
PEAK = {(d['y'], d['n']): max([a for (_, g, a) in (d.get('h') or []) if g >= 8], default=None) for d in HIST}
# Current top players we can compare to: had a draft profile with traits, and average 95+ in 2026 (or 100+ peak).
CURRENT_STARS = [q for q in train if len(q['str']) >= 2 and ((NOW_AVG.get((q['year'], q['name'])) or 0) >= 95 or (q['peak'] or 0) >= 100)]
def vec(q):
    v = np.array(cm.fv(q, 10)[1:], dtype=float)
    return np.append(v, ((q.get('ht') or 186) - 186) / 4)
def comp_card(q):
    j = q.get('jun') or {}
    return {'name': q['name'].replace('+', ''), 'pick': q['pick'], 'year': q['year'], 'peak': round(q['peak'], 1),
            'now': NOW_AVG.get((q['year'], q['name'])), 'jFP': j.get('FP'), 'jT': j.get('T'), 'jD': j.get('D'),
            'scouts': q.get('rawstr', [])[:5], 'workons': q.get('rawimp', [])[:3], 'role': q.get('role')}
BASE = sum(p['label'] for p in train) / len(train)
def rate_for(f, lo, hi):
    sel = [p for p in train if f(p) is not None and lo <= f(p) < hi]
    return (sum(p['label'] for p in sel), len(sel)) if sel else (0, 0)
TAB = {g: (n, hits, rate, lift) for g, n, hits, rate, lift in table('str', GROUPS) + table('imp', IMPS)}
def why(p, contrib, role):
    lines = []
    j = p.get('jun') or {}
    fp, t = j.get('FP'), j.get('T')
    if fp and fp >= 90:
        lo = 110 if fp >= 110 else 100 if fp >= 100 else 90
        h, n = rate_for(lambda q: (q['jun'] or {}).get('FP') if q['jun'] and q['jun']['FP'] > 20 else None, lo, 999)
        lines.append({'good': True, 'text': f"Junior fantasy average of {fp:.0f}. Draftees at {lo}+ became 90+ AFL Fantasy players {round(h / n * 100)}% of the time ({h} of {n}), against {round(BASE * 100)}% for all picks."})
    elif fp and fp < 70:
        lines.append({'good': False, 'text': f"Junior fantasy average of {fp:.0f}: low output for a future fantasy star; most stars scored 90+ as juniors."})
    if t and t >= 4.5:
        lo = 6 if t >= 6 else 4.5
        h, n = rate_for(lambda q: (q['jun'] or {}).get('T') if q['jun'] and q['jun']['FP'] > 20 else None, lo, 99)
        lines.append({'good': True, 'text': f"{t:.1f} tackles a game. Juniors laying {lo}+ became stars {round(h / n * 100)}% of the time: hunters score, as Warner, Berry and Brayshaw showed."})
    for k, v in contrib:
        if k in TAB and k not in ('Junior fantasy avg', 'Junior tackles'):
            n, hits, rate, lift = TAB[k]
            label = k.replace('needs ', 'work-on: ')
            if v > 0:
                lines.append({'good': True, 'text': f"Scouts noted {label.lower()}. {hits} of {n} draftees with that note became 90+ players, {lift:.1f}× what their draft slots predicted."})
            else:
                lines.append({'good': False, 'text': f"Scouts noted {label.lower()}: only {hits} of {n} with that note became 90+ players ({lift:.1f}× their draft slots)."})
    if 'endurance' in (p.get('combine') or []): lines.append({'good': True, 'text': 'Top-10 endurance at the national combine. Elite runners became stars at 1.3× their draft slots (Brayshaw, Warner, Berry, Noah Anderson, Lachie Ash).'})
    if 'power' in (p.get('combine') or []): lines.append({'good': False, 'text': 'Top-10 speed or jump at the combine: pure athletes have become fantasy stars less often than their draft slots suggested.'})
    if role == 'Key position': lines.append({'good': False, 'text': 'Key-position role. Almost no key defenders or forwards have become 90+ fantasy players, however good they are as footballers.'})
    elif role == 'Small forward': lines.append({'good': False, 'text': 'Small-forward role. Fewer touches and stoppages make big fantasy scores rare unless he moves into the midfield.'})
    elif role == 'Ruck': lines.append({'good': True, 'text': 'Ruck. Rucks who make it are fantasy gold; they produced stars at a higher rate than their draft slots suggested.'})
    return lines

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
    listed = ((prof or {}).get('position') or rm.get('pos') or '').lower().replace('fwd', 'forward').replace('def', 'defender').replace('mid', 'midfielder').replace('ruc', 'ruck')
    role = role_of(listed, ht, strs)
    p = {'name': name, 'str': st, 'imp': im, 'jun': j, 'ht': ht, 'role': role, 'combine': combine_flags(2026, ALIAS.get(name, name))}
    x = np.array(cm.fv(p, rank))
    prob = cm.prob(model, x, role)
    prob_rel = cm.prob(cm.m_rel, x, role, cm.ROLE_CAL_REL)
    pos_only = float(pick_model.predict_proba([x[:1]])[0, 1])
    contrib = sorted([(FEATS[i], float(model.coef_[0][i] * x[i])) for i in range(1, len(FEATS)) if abs(model.coef_[0][i] * x[i]) > 0.08], key=lambda t: -abs(t[1]))
    pv = vec(p)
    sims = sorted((float(np.linalg.norm(pv - vec(q))), q) for q in CURRENT_STARS)
    sims = [q for _, q in sims[:3]]
    out.append({'rank': rank, 'name': name, 'junior': (prof or {}).get('junior') or (j or {}).get('team', ''), 'position': (prof or {}).get('position', ''), 'height': ht, 'role': role,
                'jFP': j and j['FP'], 'jD': j and j['D'], 'jT': j and j['T'], 'traits': st, 'flags': im,
                'chance': round(prob * 100, 1), 'relevant': round(prob_rel * 100, 1), 'positionOnly': round(pos_only * 100, 1),
                'reasons': [{'label': k, 'effect': round(v, 2)} for k, v in contrib[:5]],
                'why': why(p, contrib, role),
                'comps': [comp_card(q) for q in sims]})

out.sort(key=lambda r: -r['chance'])
for r in out:
    print(f"{r['rank']:2d} {r['name']:20s} {r['role']:13s} 90+ {r['chance']:5.1f}% 80+ {r['relevant']:5.1f}% (slot {r['positionOnly']:4.1f}%) comps {', '.join(c['name'] for c in r['comps'])}")

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
        'lateHits': [{'name': p['name'].replace('+', ''), 'pick': p['pick'], 'year': p['year'], 'peak': round(p['peak'], 1)} for p in sorted(late_hits, key=lambda p: -p['peak'])]}
json.dump({'meta': meta, 'patterns': pat, 'numbers': num, 'validation': val, 'prospects': out,
           'coef': {k: round(float(v), 2) for k, v in zip(FEATS, model.coef_[0])}, 'roleCal': cm.ROLE_CAL}, open('lib/crystal-ball.json', 'w'), indent=1)
print('wrote lib/crystal-ball.json')
