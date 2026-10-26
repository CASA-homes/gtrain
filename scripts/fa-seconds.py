"""Unowned players who dominated the seconds (VFL / SANFL / WAFL) in 2026, or in 2025 if they barely played 2s in 2026.
Reads the DFS cache for free agents and writes lib/fa-seconds.json for the crystal ball's 2027 free agents view.
Usage: python3 scripts/fa-seconds.py <dfs_fa_cache_dir>"""
import json, os, sys
CACHE = sys.argv[1] if len(sys.argv) > 1 else '/tmp/dfs-fa'
STATE = {'vfl': 'VFL', 'sanfl': 'SANFL', 'wafl': 'WAFL'}
num = lambda x: float(x) if x not in (None, '', '-') else 0.0
ids = {r['name'] + '|' + r['club']: r.get('dfs_id') for r in json.load(open('data/fa-dfs.json'))}
out = []
for p in json.load(open('lib/free-agents.json'))['players']:
    pid = ids.get(p['name'] + '|' + p['club'])
    f = os.path.join(CACHE, (pid or 'x') + '.json')
    if not pid or not os.path.exists(f): continue
    if (p.get('age') or 99) > 27: continue            # a veteran dominating the 2s isn't a draft target
    d = json.load(open(f))
    rows = {(c['year'], c['league'].lower()): c for c in d.get('career', []) if (c.get('league') or '').lower() in STATE}
    pick = None
    for yr in ('2026', '2025'):
        cands = [c for (y, l), c in rows.items() if y == yr]
        if not cands: continue
        c = max(cands, key=lambda c: int(c['gms']))
        g = int(c['gms'])
        if yr == '2026' and g >= 4: pick = (yr, c); break
        if yr == '2025' and g >= 6 and not any(int(c2['gms']) >= 4 for (y, l), c2 in rows.items() if y == '2026'): pick = (yr, c)
    if not pick: continue
    yr, c = pick
    g, avg = int(c['gms']), num(c['FP'])
    if avg < (90 if g >= 6 else 97): continue
    lg = c['league'].lower()
    games = [x for x in d.get('combinedGames', []) if x.get('year') == yr and (x.get('league') or '').lower() == lg]
    games.sort(key=lambda x: (str(x.get('round')).isdigit(), int(x['round']) if str(x.get('round')).isdigit() else 99))
    last = [int(num(x['FP'])) for x in games][-5:]
    ruck = 'RUC' in p['pos'] or num(c.get('hitouts')) >= 10
    shrunk = (g * avg + 4 * 70) / (g + 4)
    score = shrunk - (8 if ruck else 0) + max(0, 23 - (p.get('age') or 23)) * 2 - (4 if yr == '2025' else 0)
    why = []
    if avg >= 105: why.append(f"{STATE[lg]} {avg:.0f} average: among the best in the competition")
    if int(num(c.get('gm100'))) >= max(3, g // 2): why.append(f"{int(num(c.get('gm100')))} of {g} games at 100+")
    if p['gp'] and p['avg'] and p['avg'] >= 65: why.append(f"Already {p['avg']:.0f} from {p['gp']} AFL games in 2026")
    elif p['gp'] <= 3: why.append('Barely seen at AFL level: a cheap late pick if a spot opens')
    if ruck: why.append('Ruck: hitouts pad seconds scores, so read it a notch lower')
    if yr == '2025': why.append('Numbers are from 2025; barely played seconds in 2026')
    out.append({'name': p['name'], 'full': p['full'], 'pos': p['pos'], 'club': p['club'], 'age': p.get('age'), 'league': STATE[lg], 'year': int(yr),
                'g': g, 'avg': round(avg, 1), 'max': int(num(c.get('maxFP'))), 'g100': int(num(c.get('gm100'))),
                'disp': round(num(c.get('kicks')) + num(c.get('handballs')), 1), 'tkl': round(num(c.get('tackles')), 1), 'mk': round(num(c.get('marks')), 1),
                'gl': round(num(c.get('goals')), 1), 'ho': round(num(c.get('hitouts')), 1), 'last': last, 'aflG': p['gp'], 'aflAvg': p['avg'],
                'ruck': ruck, 'score': round(score, 1), 'why': why})
out.sort(key=lambda r: -r['score'])
json.dump({'updated': json.load(open('lib/free-agents.json'))['updated'], 'players': out}, open('lib/fa-seconds.json', 'w'), indent=1)
print(len(out), 'players')
for r in out[:20]: print(r['full'], r['age'], r['league'], r['year'], r['g'], r['avg'], r['score'], 'AFL', r['aflG'], r['aflAvg'], r['last'])
