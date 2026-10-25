"""Per-game detail for every player (rostered and free agents) for the player card: opponent, venue, score, time on
ground, centre-bounce share, quarter scores, where he won the ball, and the AFL heat map id. Plus 2025 games for
two-season opponent and venue splits. Reads DFS player summaries from the cache dirs given; writes lib/player-games.json.
Usage: python3 scripts/games-build.py <cache_dir> [<cache_dir> ...]"""
import json, os, sys, re
ids = {o['dfs_id'] for o in json.load(open('data/dfs-2026.json')) if o.get('dfs_id')}
ids |= {p['dfs_id'] for p in json.load(open('lib/free-agent-players.json'))['players'] if p.get('dfs_id')}
def n(x):
    try: return round(float(x))
    except (TypeError, ValueError): return None
out = {}
for pid in sorted(ids):
    f = next((os.path.join(c, pid + '.json') for c in sys.argv[1:] if os.path.exists(os.path.join(c, pid + '.json'))), None)
    if not f: continue
    d = json.load(open(f))
    gs = [g for g in d.get('combinedGames') or [] if g.get('league') == 'AFL' and g.get('year') in ('2025', '2026') and n(g.get('FP')) is not None]
    g26 = sorted([g for g in gs if g['year'] == '2026'], key=lambda g: int(g.get('round') or 0))
    g25 = [g for g in gs if g['year'] == '2025']
    rows = []
    for g in g26:
        m = re.search(r'match-(\d+)-', g.get('heatmapUrl') or '')
        rows.append([n(g.get('round')), g.get('opponentAbbr'), g.get('venueAbbr'), n(g.get('FP')), n(g.get('timeOnGroundPercentage')), n(g.get('centreBounceAttendancePercentage')),
                     n(g.get('dt_1')), n(g.get('dt_2')), n(g.get('dt_3')), n(g.get('dt_4')),
                     n(g.get('defensive50')), n(g.get('defensiveMidfield')), n(g.get('attackingMidfield')), n(g.get('attacking50')), m.group(1) if m else None])
    if rows or g25:
        out[pid] = {'g': rows, 'p': [[g.get('opponentAbbr'), g.get('venueAbbr'), n(g.get('FP'))] for g in g25]}
json.dump({'cols': ['round', 'opp', 'venue', 'fp', 'tog', 'cba', 'q1', 'q2', 'q3', 'q4', 'd50', 'dmid', 'amid', 'a50', 'heat'], 'players': out},
          open('lib/player-games.json', 'w'), separators=(',', ':'))
print(len(out), 'players of', len(ids), os.path.getsize('lib/player-games.json') // 1024, 'KB')
