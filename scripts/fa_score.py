"""Rank the 2027 free agents (data/fa-dfs.json) and tag the undervalued ones. Writes lib/free-agents.json.
A player is tagged when the 2027 outlook beats what his 2026 average says, for a reason we can name."""
import json, datetime
NOW = 2026
rows = json.load(open('data/fa-dfs.json'))
def f(x):
    try: return float(x)
    except (TypeError, ValueError): return None
def age_of(dob):
    try: d = datetime.date.fromisoformat(dob[:10]); return round((datetime.date(2027, 3, 1) - d).days / 365.25, 1)
    except Exception: return None
out = []
for r in rows:
    gp, avg = int(f(r['gp']) or 0), f(r['avg'])
    # Last five rounds, ignoring games he left injured (under 25)
    late = [f(r[k]) for k in ('r20', 'r21', 'r22', 'r23', 'r24') if f(r[k]) is not None and f(r[k]) >= 25]
    l5 = sum(late) / len(late) if len(late) >= 3 else None
    hist = {h[0]: h for h in r.get('hist') or []}
    h25, h24 = hist.get(2025), hist.get(2024)
    a25 = h25[2] if h25 and h25[1] >= 5 else None
    a24 = h24[2] if h24 and h24[1] >= 5 else None
    cba26 = hist.get(2026, [0]*5)[3] if hist.get(2026) else None
    cba25 = h25[3] if h25 and h25[1] >= 5 else None
    age = age_of(r.get('dob'))
    games = sum(h[1] for h in hist.values())
    # 2027 outlook: blend of 2026, last five and 2025, nudged for age
    parts = []
    if avg is not None and gp >= 3: parts.append((avg, 0.4 * min(gp, 15) / 15))
    if l5 is not None and gp >= 5: parts.append((l5, 0.3))
    if a25 is not None: parts.append((a25, 0.3 * min(h25[1], 15) / 15))
    if a24 is not None and (avg is None or gp < 8): parts.append((a24, 0.15))
    proj = sum(v * w for v, w in parts) / sum(w for _, w in parts) if parts else None
    if proj is not None and age is not None:
        proj += 4 if age <= 21.5 else 2.5 if age <= 23 else 1 if age <= 25 else 0 if age <= 29 else -2.5 if age <= 31 else -5
    tags = []
    best_recent = max(((h[2], h[0]) for h in hist.values() if h[0] in (NOW - 1, NOW - 2) and h[1] >= 5), default=None)
    if avg is None and proj is not None and best_recent and best_recent[0] >= 75 and (age or 30) <= 32:
        tags.append(('Injury discount', f'Missed 2026; averaged {best_recent[0]:.0f} in {best_recent[1]}'))
    if avg is not None and proj is not None and (age or 30) <= 32:
        if age and age <= 23.5 and 2 <= gp <= 7 and avg >= 70:
            tags.append(('Breakout signs', f'{avg:.0f} from {gp} games at {age:.0f}: small sample, real upside'))
        if a25 and a25 >= 75 and (gp <= 12 or avg <= a25 - 12):
            tags.append(('Injury discount', f'Averaged {a25:.0f} in 2025 but only {gp} games this year'))
        if l5 and gp >= 8 and l5 >= avg + 8 and l5 >= 70:
            tags.append(('Finished strong', f'{l5:.0f} over his last five against {avg:.0f} for the year'))
        if age and age <= 23.5 and avg >= 58 and gp >= 6 and (a25 is None or avg >= a25 + 5):
            tags.append(('Young and rising', f'{age:.0f} next season and {avg:.0f} this year' + (f', up from {a25:.0f}' if a25 else ' in his first real season')))
        if cba26 is not None and cba25 is not None and cba26 >= cba25 + 12 and avg >= 62:
            tags.append(('Bigger role', f'Centre bounces up from {cba25:.0f}% to {cba26:.0f}%'))
        peak = max(((h[2], h[0]) for h in hist.values() if h[0] >= NOW - 3 and h[1] >= 8 and h[0] < NOW), default=None)
        if peak and peak[0] >= 85 and peak[0] >= avg + 12 and age and age <= 31 and not any(t[0] == 'Injury discount' for t in tags):
            tags.append(('Proven ceiling', f'Averaged {peak[0]:.0f} in {peak[1]}'))
    under = bool(tags) and proj is not None and proj >= 64 and (avg is None or proj >= avg + 2 or len(tags) >= 2 or tags[0][0] == 'Breakout signs')
    out.append(dict(name=r['name'], full=r.get('full') or r['name'], pos=r['pos'], club=r['club'], status=r['status'], own=r['own'],
                    gp=gp, avg=avg, l5=round(l5, 1) if l5 is not None else None, rounds=[r[k] for k in ('r20', 'r21', 'r22', 'r23', 'r24')],
                    age=age, games=games, a25=a25, a24=a24, proj=round(proj) if proj is not None else None,
                    tags=[t for t, _ in tags] if under else [], why=[w for _, w in tags] if under else []))
out.sort(key=lambda o: (o['avg'] is None, -(o['avg'] or 0)))
json.dump({'updated': '2026-10-25', 'source': 'Keeper board, all unowned players', 'players': out}, open('lib/free-agents.json', 'w'), ensure_ascii=False)
u = [o for o in out if o['tags']]
print(len(out), 'players,', len(u), 'tagged')
for o in sorted(u, key=lambda o: -o['proj']): print(f"{o['name']:20} {o['pos']:8} age {o['age']} gp{o['gp']:>3} avg {o['avg']} l5 {o['l5']} 25:{o['a25']} -> {o['proj']}  {o['tags']}")
