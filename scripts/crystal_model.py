# Fit the crystal-ball model on 2016–2025 draftees, validate it, and score the 2026 prospects.
# Run after scripts/crystal.py (which writes the scratch players.json).
import json, math, re, sys
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
sys.path.insert(0, 'scripts')
from crystal import GROUPS, IMPS, SMAP, IMAP, norm, junior, players, train  # noqa: E402

TRAITS = ['Defensive pressure', 'Contested / inside', 'Leadership / character', 'Kicking / skills', 'Footy IQ / vision', 'Speed / agility',
          'X-factor / hurt', 'Engine / work rate', 'Accumulator', 'Aerial / marking', 'Versatility', 'Athleticism', 'Upside', 'Clean hands']
FLAGS = ['needs contested/inside game', 'needs consistency', 'needs to win more ball', 'raw / limited exposure']
FEATS = ['Draft position', 'Junior fantasy avg', 'Junior tackles', 'No junior numbers', 'Key-position height (193cm+)'] + TRAITS + FLAGS

def fv(p, pick):
    j = p.get('jun') or {}
    fp = j.get('FP') or 0
    has = 1 if fp > 20 else 0
    x = [-math.log(pick),
         (min(max(fp, 40), 140) - 85) / 25 if has else 0,
         (min(max(j.get('T') or 0, 0), 8) - 3.5) / 1.5 if has else 0,
         0 if has else 1,
         1 if (p.get('ht') or 0) >= 193 else 0]
    x += [1 if t in p['str'] else 0 for t in TRAITS]
    x += [1 if f in p['imp'] else 0 for f in FLAGS]
    return x

X = np.array([fv(p, p['pick']) for p in train]); y = np.array([p['label'] for p in train]); yrs = np.array([p['year'] for p in train])
C = 0.35
# Leave-one-draft-year-out validation, against draft position alone
pred, predp = np.zeros(len(y)), np.zeros(len(y))
for yr in sorted(set(yrs)):
    tr, te = yrs != yr, yrs == yr
    if y[tr].sum() == 0: continue
    m = LogisticRegression(C=C, max_iter=2000).fit(X[tr], y[tr]); pred[te] = m.predict_proba(X[te])[:, 1]
    mp = LogisticRegression(C=10, max_iter=2000).fit(X[tr][:, :1], y[tr]); predp[te] = mp.predict_proba(X[te][:, :1])[:, 1]
print('LOYO AUC full model', round(roc_auc_score(y, pred), 3), '| draft position only', round(roc_auc_score(y, predp), 3))
# Late-pick check: among picks 15+, does the model rank the hits higher?
late = np.array([p['pick'] >= 15 for p in train])
print('picks 15+: AUC full', round(roc_auc_score(y[late], pred[late]), 3), 'vs position only', round(roc_auc_score(y[late], predp[late]), 3), 'hits', int(y[late].sum()), 'of', int(late.sum()))

m = LogisticRegression(C=C, max_iter=2000).fit(X, y)
coef = dict(zip(FEATS, m.coef_[0]))
print('\ncoefficients (log-odds per unit / per trait):')
for k, v in sorted(coef.items(), key=lambda kv: -kv[1]): print(f'  {k:32s} {v:+.2f}')

for p, pr in zip(train, pred): p['oos'] = float(pr)
print('\nout-of-sample star chance for marquee examples:')
for n in ['Errol Gulden', 'Harry Sheezel', 'Nasiah Wanganeen-Milera', 'Will Ashcroft', 'Nick Daicos', 'Bailey Smith', 'Chad Warner', 'Caleb Serong', 'Sam Walsh', 'Jase Burgoyne', 'Dylan Moore', 'Zak Butters']:
    for p in train:
        if p['name'] == n:
            print(f"  {n:24s} pick {p['pick']:2d} peak {p['peak']:5.1f} -> {p['oos']*100:4.1f}%  (position alone {predp[train.index(p)]*100:4.1f}%)")

# Biggest late-pick finds (out-of-sample) and biggest misses
print('\ntop out-of-sample scores among picks 20+:')
for p in sorted([p for p in train if p['pick'] >= 20], key=lambda p: -p['oos'])[:15]:
    print(f"  {p['year']} #{p['pick']:2d} {p['name']:24s} {p['oos']*100:4.1f}%  peak {p['peak']:5.1f} {'HIT' if p['label'] else ''}")

json.dump({'coef': coef, 'intercept': float(m.intercept_[0]), 'feats': FEATS, 'C': C}, open('/tmp/claude-0/-home-claude/29f08a6b-131d-545f-988a-2f0ce595c883/scratchpad/model.json', 'w'))
json.dump(train, open('/tmp/claude-0/-home-claude/29f08a6b-131d-545f-988a-2f0ce595c883/scratchpad/train_scored.json', 'w'))
