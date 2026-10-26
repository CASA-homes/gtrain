# Fit the crystal-ball model on 2016–2025 draftees, validate it, and score the 2026 prospects.
# Run after scripts/crystal.py (which writes the scratch players.json).
import json, math, os, re, sys
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
sys.path.insert(0, 'scripts')
from crystal import GROUPS, IMPS, SMAP, IMAP, norm, junior, players, train  # noqa: E402

TRAITS = ['Defensive pressure', 'Contested / inside', 'Leadership / character', 'Kicking / skills', 'Footy IQ / vision', 'Speed / agility',
          'X-factor / hurt', 'Engine / work rate', 'Aerial / marking', 'Versatility', 'Athleticism', 'Upside', 'Clean hands']
# 'Accumulator' is left out on purpose: the tag says little about WHETHER a player makes it, but a lot about how
# well he scores once he does, so crystal_score.py reports it as a ceiling note instead of letting it pull the chance down.
FLAGS = ['needs contested/inside game', 'needs consistency', 'needs to win more ball', 'raw / limited exposure']
ROLES = ['Key position', 'Ruck', 'Small forward']
# Roles are a hard fact about how fantasy scores are earned, so let them speak louder than a single scout's trait.
ROLE_W = {'Key position': 3.0, 'Ruck': 0.0, 'Small forward': 2.0}   # ruck acts through the calibration only: past ruck stars were late picks, so a ruck boost on top of draft slot overshoots for early rucks
COMBO = ['Combine: top-10 endurance', 'Combine: top-10 speed/jump']
FEATS = ['Draft position', 'Junior fantasy avg', 'Junior tackles', 'No junior numbers'] + ROLES + COMBO + TRAITS + FLAGS + ['Big junior numbers (95+)']

def fv(p, pick):
    j = p.get('jun') or {}
    fp = (j.get('FP') or 0) - (j.get('HO') or 0)   # take hitouts out: a ruck's junior score isn't comparable to a mid's
    has = 1 if (j.get('FP') or 0) > 20 else 0
    x = [-math.log(pick),
         (min(max(fp, 40), 140) - 85) / 25 if has else 0,
         (min(max(j.get('T') or 0, 0), 8) - 3.5) / 1.5 if has else 0,
         0 if has else 1]
    x += [ROLE_W[r] if p.get('role') == r else 0 for r in ROLES]
    x += [1 if 'endurance' in (p.get('combine') or []) else 0, 1 if 'power' in (p.get('combine') or []) else 0]
    x += [1 if t in p['str'] else 0 for t in TRAITS]
    x += [1 if f in p['imp'] else 0 for f in FLAGS]
    # The lift from junior scoring isn't a straight line: 80 v 90 means little, 105+ roughly doubles a pick's star rate.
    x += [max(0, min(fp, 125) - 95) / 10 if has else 0]   # capped: only a handful of juniors ever averaged 115+
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

json.dump({'coef': coef, 'intercept': float(m.intercept_[0]), 'feats': FEATS, 'C': C}, open(os.path.join(os.environ.get('CRYSTAL_TMP', '/tmp'), 'model.json'), 'w'))
json.dump(train, open(os.path.join(os.environ.get('CRYSTAL_TMP', '/tmp'), 'train_scored.json'), 'w'))

# Second bar: "fantasy relevant" (an 80+ season), same features.
train_rel = [p for p in __import__('crystal').players if p['rel_label'] is not None]
Xr = np.array([fv(p, p['pick']) for p in train_rel]); yr_ = np.array([p['rel_label'] for p in train_rel]); yrs_r = np.array([p['year'] for p in train_rel])
pred_r = np.zeros(len(yr_))
for yr in sorted(set(yrs_r)):
    tr, te = yrs_r != yr, yrs_r == yr
    mm = LogisticRegression(C=C, max_iter=2000).fit(Xr[tr], yr_[tr]); pred_r[te] = mm.predict_proba(Xr[te])[:, 1]
m_rel = LogisticRegression(C=C, max_iter=2000).fit(Xr, yr_)
print('\n80+ model: n', len(yr_), 'hits', int(yr_.sum()), 'LOYO AUC', round(roc_auc_score(yr_, pred_r), 3))
for p, pr in zip(train_rel, pred_r): p['oos_rel'] = float(pr)

# Role calibration: scale the odds so each role's predicted stars (out-of-sample) match how many it actually produced.
# Key-position players taken early almost never become fantasy stars, which a shared draft-position slope can't see.
def _cal(rows, preds, label):
    out = {}
    for r in ROLES + ['Tall utility', 'Midfielder', 'Defender', 'Forward']:
        idx = [i for i, p in enumerate(rows) if p.get('role') == r]
        if len(idx) < 5: continue
        hits = sum(rows[i][label] for i in idx); exp = sum(preds[i] for i in idx)
        out[r] = round(min(3.0, max(0.15, (hits + 0.5) / (exp + 0.5))), 3)
    return out
ROLE_CAL = _cal(train, pred, 'label')
ROLE_CAL_REL = _cal(train_rel, pred_r, 'rel_label')
print('role calibration (90+):', ROLE_CAL, '| (80+):', ROLE_CAL_REL)

def prob(model, x, role, cal=None):
    cal = ROLE_CAL if cal is None else cal
    p = float(model.predict_proba([x])[0, 1]); f = cal.get(role, 1.0)
    o = p / (1 - p) * f
    return o / (1 + o)
