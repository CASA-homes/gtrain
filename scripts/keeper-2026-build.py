"""From data/keeper-2026-lineups.json (every club's Keeper lineup for rounds 1-24, plus fixture results) build:
  lib/results-2026.json    every club's results: [round label, opponent, W/L, for, against]
  lib/club-games-2026.json games each player played FOR each club: on the club's list that round, the club had a match
                           (home-and-away, or a final it played), and he played that AFL round. starts = in the 18 on field.
Keeper rounds 1-24 line up with AFL rounds 1-24 (opening round counts as round 1); rounds 22-24 are the G-Train finals."""
import json, collections
L = json.load(open('data/keeper-2026-lineups.json'))
G = json.load(open('lib/player-games.json'))['players']
ros = json.load(open('data/dfs-2026.json')); fa = json.load(open('lib/free-agent-players.json'))['players']
CLUB = {'Adelaide Crows':'ADE','Brisbane Lions':'BRL','Carlton':'CAR','Collingwood':'COL','Essendon':'ESS','Fremantle':'FRE','Geelong Cats':'GEE','Gold Coast Suns':'GCS','GWS Giants':'GWS','Hawthorn':'HAW','Melbourne':'MEL','North Melbourne':'NTH','Port Adelaide':'PTA','Richmond':'RIC','St Kilda':'STK','Sydney Swans':'SYD','West Coast Eagles':'WCE','Western Bulldogs':'WBD'}
idx = collections.defaultdict(list)
for o in ros: idx[o['name']].append((o.get('dfs_team'), o['dfs_id']))
for o in fa: idx[o['name']].append((o.get('afl_club'), o['dfs_id']))
OVERRIDE = {'1396': 'CD_I1012014'}   # Keeper's C. Warner on a G-Train list is Chad, not Corey
def dfs_of(kid, name, club):
    if kid in OVERRIDE: return OVERRIDE[kid]
    c = idx.get(name, []); pick = [x for x in c if x[0] == CLUB.get(club)] or c
    ids = {d for _, d in pick}
    return ids.pop() if len(ids) == 1 else None
played = {pid: {min(max(r[0], 1), 24) for r in d['g'] if r[0] is not None and r[0] <= 24} for pid, d in G.items()}

results = {}
for team, rows in L['fixtures'].items():
    results[team] = [[r[0], r[1], r[2], int(r[3]), int(r[4])] for r in rows if len(r) >= 5 and r[2] in ('W', 'L', 'D')]
had_match = {team: {i + 1 for i, r in enumerate(rows) if len(r) >= 3 and r[2] in ('W', 'L', 'D')} for team, rows in L['fixtures'].items()}

games = {}
for team, rounds in L['lineups'].items():
    c = {}
    for r, rows in rounds.items():
        r = int(r)
        if r not in had_match[team]: continue
        for i, (name, slot, club, kid) in enumerate(rows):
            if not kid: continue
            pid = dfs_of(kid, name, club)
            e = c.setdefault(kid, {'name': name, 'dfs': pid, 'games': 0, 'starts': 0, 'listed': 0})
            e['listed'] += 1
            if pid and r in played.get(pid, set()):
                e['games'] += 1
                if i < 18: e['starts'] += 1
    games[team] = sorted([[e['name'], e['dfs'], e['games'], e['starts'], e['listed']] for e in c.values()], key=lambda x: (-x[2], x[0]))
json.dump({'season': 2026, 'teams': results}, open('lib/results-2026.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump({'season': 2026, 'cols': ['name', 'dfs_id', 'games', 'starts', 'rounds_listed'], 'teams': games}, open('lib/club-games-2026.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print({t: len(v) for t, v in results.items()}); print({t: len(v) for t, v in games.items()})
print('Bodega top:', games['Bodega Boys'][:4], 'Dunkley:', [g for g in games['Bodega Boys'] if 'Dunkley' in g[0]])
