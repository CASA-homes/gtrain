"""Fill gaps in lib/draft-profiles-<year>.json for drafted players the guides skipped (mostly mature-age and
state-league picks), plus non-national-draft players we want profiled (rookie draft). Numbers come from Rookie Me's
guide rows where they exist, otherwise the player's draft-year VFL / SANFL / WAFL / Talent League line from DFS Australia.
Summaries are our own short read."""
import sys, io, contextlib, json, re, os
sys.path.insert(0, 'scripts')
with contextlib.redirect_stdout(io.StringIO()):
    from crystal import H, dfs_rec, junior, parse_rows
LG = {'vfl': 'VFL', 'sanfl': 'SANFL League', 'wafl': 'WAFL', 'nab': 'Talent League', 'sanflU18': 'SANFL Under-18s'}
SUM = {
 'Flynn Kroeger': 'Rebounding defender from Eastern Ranges, picked late after a short 2021 Talent League season.',
 'Garrett McDonagh': 'Mature-age midfielder taken from Richmond’s VFL side at 25 after averaging 21 disposals and 86 fantasy points in 2021.',
 'Greg Clark': 'Mature-age inside midfielder from Subiaco: a 195cm ball-winner and tackler, with speed and upside the knocks on him.',
 'Charlie Constable': 'Second chance for the former Geelong top-20 pick: a big-bodied inside mid who averaged 33 disposals and 111 fantasy in the VFL in 2021.',
 'Tom Emmett': 'Mature medium forward from Sturt who kicked goals in the SANFL League.',
 "Jack O'Sullivan": 'Small forward from Oakleigh with goal sense, limited to five Talent League games in his draft year.',
 'Joe Richards': 'Mature-age small midfielder from Wangaratta in the Ovens & Murray league; a late bolter on pace and footy smarts.',
 'Kaleb Smith': 'Small defender from East Fremantle, picked late on run and ball use.',
 'Bailey Macdonald': 'Defender who can also play a wing, from a strong Oakleigh side; a short draft-year season.',
 'Thomas Scully': '203cm ruck-forward from West Adelaide’s Under-18s who kicked over three goals a game in 2022.',
 'Cooper Harvey': 'Ball-winning midfielder-forward from the Northern Knights: 20 disposals and 83 fantasy a game in 2022.',
 'Corey Wagner': 'Mature-age Port Melbourne midfielder (25) who averaged 22 disposals and 85 fantasy in the 2022 VFL; a ready-made depth pick.',
 'Kyle Marshall': '201cm key defender from South Adelaide’s Under-18s; a long-term tall project.',
 'Shaun Mannagh': 'Mature-age forward-midfielder (26) who dominated the VFL for Werribee: 25 disposals, 1.9 goals and 110 fantasy a game across 21 games in 2023.',
 'Luke Lloyd': 'Tall forward-wing from Sandringham who split 2023 between the Talent League and a VFL taste.',
 'Lachlan Smith': '203cm ruck from Gippsland: 19 hitouts, 17 disposals and 86 fantasy a game in the 2023 Talent League.',
 'Oliver Wiltshire': 'Mature-age pick from local football at Barwon Heads after earlier Geelong Falcons games.',
 'Ty Gallop': 'Brisbane Academy key forward with a strong mark and goal sense, nearly three goals a game in limited 2024 Talent League games.',
 'Jaren Carr': 'Mature-age utility from South Fremantle’s WAFL side.',
 'River Stevens': 'Tough, pressuring small forward from Geelong Falcons with goal sense; size and kicking consistency the work-ons.',
 'Aidan Johnson': 'Mature-age 193cm ruck-forward from Werribee who played 20 VFL games in 2024.',
 'Tobyn Murray': 'Geelong VFL midfielder taken after 17 games in 2025; a high-volume Talent League ball-winner two years earlier.',
 'Billy Cootee': 'Mature-age Norwood midfielder who averaged 23 disposals, 5 tackles and 97 fantasy across 21 SANFL games in 2025.',
 'Angus Anderson': 'Big-bodied inside midfielder from Sturt: 21 disposals, 5 tackles and 93 fantasy a game in the 2025 SANFL League, with clean hands and clearance work.',
 'Ryan Byrnes': 'Re-drafted by St Kilda: a tireless accumulator and leader with a five-step burst, though kicking at speed and scoreboard impact are the knocks.',
 'Jake Stringer': 'Veteran forward re-drafted at 31 by GWS for his goal-kicking and experience; a short-term points pick, not a prospect.',
 'Vigo Visentini': '204cm ruck from Sandringham and Vic Metro taken with pick 8 in the 2023 rookie draft: aggressive, a good mark and a strong around-the-ground presence, but flagged as a long development project. Younger brother of Port’s Dante.',
}
EXTRA_STR = {'Vigo Visentini': (['Ruck craft', 'Aggression', 'Overhead marking', 'Defensive help'], ['Development time'])}
ROOKIE = [{'y': 2023, 'n': 'Vigo Visentini', 'f': 'Sandringham Dragons', 'dob': '2005-09-05', 'ht': 204, 'pick': 'Rookie draft #8',
           'url': 'https://www.essendonfc.com.au/news/1468185/2023-afl-rookie-draft-visentini-joins-the-bombers', 'src': 'Essendon: 2023 rookie draft',
           'dfs': '/tmp/claude-0/dfs-fa/CD_I1027966.json'}]
rm = json.load(open('data/rm-structured.json'))
k = lambda n: re.sub('[^a-z]', '', n.lower())
f = lambda c, x: float(c.get(x) or 0)
def state_line(rec, y):
    rows = [c for c in (rec or {}).get('career', []) if (c.get('league') or '').lower() != 'afl' and int(c['year']) in (y, y - 1) and int(c.get('gms') or 0) >= 2]
    if not rows: return None, None
    c = max(rows, key=lambda c: (int(c['year']), int(c['gms'])))
    hits = f(c, 'hitouts')
    stats = [{'label': 'Disposals', 'value': f"{f(c, 'kicks') + f(c, 'handballs'):.1f}"}, {'label': 'Marks', 'value': f"{f(c, 'marks'):.1f}"},
             {'label': 'Tackles', 'value': f"{f(c, 'tackles'):.1f}"}, {'label': 'Goals', 'value': f"{f(c, 'goals'):.1f}"}]
    if hits >= 5: stats.append({'label': 'Hitouts', 'value': f'{hits:.1f}'})
    stats.append({'label': 'Fantasy', 'value': f"{round(f(c, 'FP'))}"})
    return stats, f"{c['year']} {LG.get(c['league'], c['league'].upper())} ({c['gms']} games)"
def ht(s):
    m = re.search(r'(\d{3})', s or ''); return int(m.group(1)) if m else None
added = {}
targets = [(d['y'], d) for d in H if 2021 <= d['y'] <= 2025] + [(r['y'], r) for r in ROOKIE]
files = {y: json.load(open(f'lib/draft-profiles-{y}.json')) for y in range(2021, 2026)}
for y, d in targets:
    name = d['n'].replace('+', '')
    if any(k(p['name']) == k(name) for p in files[y]) or name not in SUM: continue
    r = rm.get(f"{y}|{d['n']}") or {}
    rec = json.load(open(d['dfs'])) if d.get('dfs') and os.path.exists(d['dfs']) else dfs_rec(d.get('id'))
    stats, frm = state_line(rec, y)
    st, im = (r.get('str') or [], r.get('imp') or []) if r.get('str') else EXTRA_STR.get(name, ([], []))
    prof = {'year': y, 'name': name, 'junior': d.get('f') or '', 'position': (r.get('pos') or '').strip() or None, 'height': ht(r.get('ht')) or d.get('ht'),
            'dob': d.get('dob'), 'projection': d.get('pick') or (r.get('range') or None), 'statsFrom': frm, 'stats': stats,
            'strengths': st[:6], 'improvements': im[:3], 'summary': SUM[name],
            'source': {'title': d['src'], 'url': d['url']} if d.get('url') else {'title': f'{y} draft profile', 'url': f"https://central.rookieme.com/afl/player/{r['slug']}/"} if r.get('slug')
                      else {'title': f'{y} AFL draft (DFS Australia numbers)', 'url': 'https://dfsaustralia.com/'}}
    files[y].append({kk: v for kk, v in prof.items() if v not in (None, '')})
    added.setdefault(y, []).append(name)
for y, rows in files.items(): json.dump(rows, open(f'lib/draft-profiles-{y}.json', 'w'), indent=1, ensure_ascii=False)
for y in sorted(added): print(y, len(added[y]), added[y])
