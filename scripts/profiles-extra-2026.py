"""Prospects outside Cal Twomey's top 30 that we still want in the crystal ball, added to lib/draft-profiles-2026.json.
Junior numbers come from Rookie Me (data/rm-structured.json). Strengths are the scouts' words (AFL.com.au, Zero Hanger);
summaries are our own. Run after scripts/profiles-boards-2026.py; safe to re-run."""
import json
RM_URL = 'https://central.rookieme.com/afl/power-rankings/afl-draft-power-rankings-august-2026-top-50/'
W = {'tw': 0.40, 'rm': 0.35, 'zh': 0.25}
EXTRA = [
    dict(name='Jordan Knapp', junior='Eastern Ranges', state='Vic Metro', position='MID', height=179, rm_rank=47,
         stats=[('AFL Fantasy (Talent League)', '117'), ('Disposals', '28.0'), ('Clearances', '4.4'), ('Tackles', '4.0'),
                ('Marks', '6.9'), ('AFL Fantasy (U18 champs)', '99')],
         statsFrom='2026 Talent League, 14 games (Rookie Me)',
         strengths=['Ball winning', 'Kicking', 'Decision making', 'Work rate', 'Leadership', 'Clean hands'],
         improvements=[],
         summary='Eastern Ranges captain and best and fairest who averaged 28 disposals and 117 fantasy points across 14 Talent League games, then '
                 'made the All-Australian side at the national carnival. A composed, clean ball-winner who also played wing and run-with roles '
                 'for Vic Metro. Top-10 agility at the Combine. Rookie Me had him 47th in August; Zero Hanger 49th in November.'),
]
prof = json.load(open('lib/draft-profiles-2026.json'))
by = {p['name']: p for p in prof}
TW_MAX = max(((p.get('boards') or {}).get('twomey') or {}).get('rank') or 0 for p in prof)
ZH_MAX = max((p.get('zh') or {}).get('rank') or 0 for p in prof)
for e in EXTRA:
    ranks = {'tw': TW_MAX + 1, 'rm': e['rm_rank'] or 51, 'zh': ZH_MAX + 1}
    score = round(sum(W[k] * v for k, v in ranks.items()), 1)
    p = by.get(e['name']) or {}
    p.update({'year': 2026, 'name': e['name'], 'junior': e['junior'], 'state': e['state'], 'position': e['position'], 'height': e['height'],
              'stats': [{'label': a, 'value': b} for a, b in e['stats']], 'statsFrom': e['statsFrom'],
              'strengths': e['strengths'], 'improvements': e['improvements'], 'summary': e['summary'],
              'source': {'title': 'AFL Draft Power Rankings: August 2026 Top 50', 'url': RM_URL},
              # Consensus slot on the same scale as the top 30: his weighted board rank.
              'boards': {'twomey': {'rank': None, 'note': '', 'url': 'https://www.afl.com.au/news/1633149/cal-twomeys-phantom-form-guide-top-draft-prospects-october-ranking', 'date': '20 Oct 2026'},
                         'rookieme': {'rank': e['rm_rank'], 'url': RM_URL, 'date': 'Aug 2026', 'of': 50}, 'zh': None,
                         'consensus': round(score), 'score': score, 'extra': True}})
    if e['name'] not in by: prof.append(p)
    print(e['name'], 'consensus', round(score))
json.dump(prof, open('lib/draft-profiles-2026.json', 'w'), indent=1, ensure_ascii=False)
