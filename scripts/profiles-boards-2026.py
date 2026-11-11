"""Combine the 2026 boards into lib/draft-profiles-2026.json.
- Cal Twomey's November Phantom Form Guide (AFL.com.au, Nov 2026): rank + our own short read of his note.
- Rookie Me's August Power Rankings (top 50): rank only (their profile text is already the main summary).
- Zero Hanger's big board (already in p['zh']).
Consensus: weighted rank, Twomey 40% / Rookie Me 35% / Zero Hanger 25%. Unranked on a board = just outside it.
Run after scripts/profiles-zh-2026.py. Notes are our own words, not the source text."""
import json
TW_URL = 'https://www.afl.com.au/news/1640123/cal-twomeys-phantom-form-guide-top-draft-prospects-november-ranking'
TW_DATE = 'Nov 2026'
RM_URL = 'https://central.rookieme.com/afl/power-rankings/afl-draft-power-rankings-august-2026-top-50/'
# November Phantom Form Guide, in his order. Notes are our own short read of his write-ups.
TW = [
 ('Dougie Cochrane', 'Still No.1. Tall who can play either end or push into the midfield. Essendon have flagged a bid at pick 1 and Port will match: it would be the Power’s first ever No.1.'),
 ('Cody Walker', 'Carlton father-son inside mid who wants to be a Blue (6:04 2km, fourth). Carlton can’t match a bid before pick 3 on points, so Richmond loom as the bidder, with West Coast next.'),
 ('Arki Butler', 'Game-breaking half-forward likened to a young Toby Greene. Broken collarbone late in the year. Essendon have looked at him; Richmond, West Coast and Melbourne are all in the mix.'),
 ('Ethan Drever', 'Seen as the favourite for Essendon’s top pick and a top-five lock. Run-and-carry mid with real pace (2.90 sec 20m, 6:30 2km), compared to Sam Walsh.'),
 ('Heath Mellody', 'Larke Medallist who moved from half-back into the middle and played WAFL League finals for Claremont. Essendon met him again, Richmond watched his grand final, and West Coast are big contenders for their top pick.'),
 ('Gus Teixeira', 'Powerful half-forward with a move into the middle in him (3.1 sec 20m, 6:27 2km). Interrupted back half of the year. Range: Richmond’s picks, Melbourne or Sydney at 6; West Coast keen.'),
 ('Harry Van Hattum', 'The draft’s biggest question: a 205cm ruck who leaps (sixth in the running vertical). Essendon and Richmond have him in their top-five mix, Melbourne too; Sydney, St Kilda and Collingwood if he slides.'),
 ('Ethan Matthews', 'GWS Academy left-footer (a Collingwood fan). Foot stress fracture cost him the back half of the year. Melbourne and Sydney are keenest before GWS can match at pick 9.'),
 ('Mitch Harris', 'Intercepting key defender who missed testing (ankle). Top-10 interest from Sydney and Melbourne; Adelaide would take him at 15 but Gold Coast and Collingwood sit in between.'),
 ('Caylen Murray', 'Brisbane Academy half-back with class. The Lions will match, but have put pick 21 up for sale; a top-10 bid from Sydney or Melbourne would test them.'),
 ('Wil Malady', 'Quick, high-marking forward (fourth in the 20m sprint) invited to night one. Melbourne have done work for their second pick; St Kilda, Richmond and Essendon also in range.'),
 ('Leo Steed', 'Endurance midfielder from Swan Districts (6:09 2km), invited to night one. Gold Coast linked, Adelaide a fallback; GWS and West Coast interested too.'),
 ('Sam Gayfer', 'Key forward who set the all-time Combine vertical jump record. Strongly linked to Collingwood at 11 if St Kilda don’t grab him first; Sydney and Gold Coast looking.'),
 ('Clancy Snell', 'Tall intercepting defender from Gippsland’s flag side with VFL games for Collingwood. Sydney have done the most work; Collingwood and St Kilda also keen.'),
 ('Lochie Burrows', 'Utility who plays mid, half-back or forward. Adelaide and St Kilda linked at 15 and 16; Essendon hold three picks around him.'),
 ('Tyson Bradley', 'Vic Metro MVP key defender with speed (3.0 sec 20m). Gold Coast in the mix, then St Kilda and Collingwood; probably gone before Fremantle.'),
 ('Toby Krasna', 'Midfielder with a speed and endurance mix (6:10 2km, 3.0 sec 20m), no longer tied to Carlton. St Kilda and Melbourne interested; likely gone by pick 22.'),
 ('George Dimer', 'Quick small forward who plays midfield now. Projected 15 to 30: Adelaide, Richmond, Essendon, West Coast and Port all in the mix.'),
 ('Harvie Cooke', 'Morrish Medallist midfielder. Likely early in round two; Essendon, GWS and Richmond considering him.'),
 ('Jackson Phillips', 'Running wingman who had a late back injury. Adelaide, Essendon, Richmond and Carlton possible in the 20s and early 30s.'),
 ('Khaled El Souki', 'Bulldogs NGA small forward. The Dogs can match a bid in the early 20s but would need to move picks before that; Adelaide have done the most work.'),
 ('Noah Williams', 'Left-footed inside mid and Geelong Falcons captain who missed testing (hip/groin). Range starts at St Kilda’s second pick through to Carlton at 31.'),
 ('Jake Eime', 'All-Australian half-back who slipped through Adelaide’s academy on a listing error. Adelaide and Fremantle could take him in round one; GWS in the 20s.'),
 ('Jack Pickett', 'Key forward who missed most of 2026 with a knee reconstruction. Brisbane, Collingwood, Carlton and GWS linked, but hard to place.'),
 ('Archie Elliott', 'Half-forward from the Rebels (6:26 2km). Likely 20 to 40 on night two; GWS and Collingwood looking.'),
 ('George Gale', 'Tall midfielder (191cm, 6:12 2km) from Claremont. Fremantle and Brisbane have done the work; more likely round two.'),
 ('Kodah Edwards', 'SA captain, forward/midfielder with speed (2.90 sec 20m) who missed the Combine through illness. Range 25 to 40; Brisbane, Essendon and Geelong interested.'),
 ('Keenan Boi', 'Hawthorn NGA forward and Talent League best and fairest. No guarantee the Hawks match; expected to if he gets past 29. Bulldogs, Eagles, Lions and Bombers interested.'),
 ('Harvey Spawton-Guy', 'Tall forward from West Perth who kicked 33 goals in 19 games. Essendon want a tall in round two; Carlton (31) and Fremantle (40) also possibilities.'),
 ('Billy Wigmore', 'Interceptor (189cm) who models himself on Tom Stewart. More likely 30-plus; Brisbane and Port interested, with Geelong, Collingwood and Hawthorn holding picks in his window.'),
]
NEW = {  # prospects new to Twomey's list who weren't profiled yet (our own words)
 'Harvey Spawton-Guy': dict(year=2026, name='Harvey Spawton-Guy', junior='West Perth', state='Western Australia', position='Tall forward', height=None,
   stats=[{'label': 'Goals (2026)', 'value': '33 in 19 games'}], statsFrom='2026 season', strengths=['Marking', 'Goal kicking', 'Height'], improvements=[],
   summary='Tall West Perth forward who kicked 33 goals in 19 games. New to Cal Twomey’s November top 30; seen as a round-two tall.',
   source={'title': 'Cal Twomey’s Phantom Form Guide: November ranking', 'url': TW_URL}),
}
RM = ['Dougie Cochrane', 'Cody Walker', 'Arki Butler', 'Gus Teixeira', 'Heath Mellody', 'Ethan Matthews', 'Ethan Drever', 'Harry Van Hattum', 'Clancy Snell', 'Leo Steed',
      'Wil Malady', 'Caylen Murray', 'Mitch Harris', 'Sam Gayfer', 'Tyson Bradley', 'Jackson Phillips', 'Toby Krasna', 'Khaled El Souki', 'George Dimer', 'Kodah Edwards',
      'Noah Williams', 'Jack Pickett', 'Jake Eime', 'Lochie Burrows', 'George Gale', 'Marlon Neocleous', 'Harrison Chapman', 'Ethan Herbert', 'Gabriel Patterson', 'Archie Elliott',
      'Koby LeCras', 'Xavier Ladbrook', 'Jack Slattery', 'Zac Antonellos', 'Harvie Cooke', 'Gus Kennedy', 'Archie Van Dyk', 'Albert MacGowan', 'Blake Justice', 'Wil Antrobus',
      'Sam Devers', 'Oliver Bartal', 'Hugh McCallum', 'Archie Spencer', 'Billy Wigmore', 'Darcy Szerszyn', 'Jordan Knapp', 'Cody Templeton', 'Harper Banfield']
W = {'tw': 0.40, 'rm': 0.35, 'zh': 0.25}

prof = json.load(open('lib/draft-profiles-2026.json'))
for n, base in NEW.items():
    if not any(p['name'] == n for p in prof): prof.append(base)
by = {p['name']: p for p in prof}
assert all(n in by for n, _ in TW), [n for n, _ in TW if n not in by]
ZH_MAX = max((p.get('zh') or {}).get('rank') or 0 for p in prof)
score = {}
for i, (n, note) in enumerate(TW, 1):
    p = by[n]
    rm = RM.index(n) + 1 if n in RM else None
    zh = (p.get('zh') or {}).get('rank')
    ranks = {'tw': i, 'rm': rm or len(RM) + 1, 'zh': zh or ZH_MAX + 1}
    score[n] = sum(W[k] * v for k, v in ranks.items())
    p['boards'] = {'twomey': {'rank': i, 'note': note, 'url': TW_URL, 'date': TW_DATE},
                   'rookieme': {'rank': rm, 'url': RM_URL, 'date': 'Aug 2026', 'of': 50}, 'zh': zh}
TWN = {n for n, _ in TW}
for p in prof:
    if p.get('year') != 2026 or p['name'] in TWN or (p.get('boards') or {}).get('extra'): continue
    rm = RM.index(p['name']) + 1 if p['name'] in RM else None
    zh = (p.get('zh') or {}).get('rank')
    score[p['name']] = sum(W[k] * v for k, v in {'tw': len(TW) + 1, 'rm': rm or len(RM) + 1, 'zh': zh or ZH_MAX + 1}.items())
    p['boards'] = {'twomey': {'rank': None, 'note': 'Dropped out of Twomey’s November top 30.', 'url': TW_URL, 'date': TW_DATE},
                   'rookieme': {'rank': rm, 'url': RM_URL, 'date': 'Aug 2026', 'of': 50}, 'zh': zh, 'dropped': True}
order = [x for x, _ in TW]
for c, n in enumerate(sorted(score, key=lambda n: (score[n], order.index(n) if n in order else 99)), 1):
    by[n]['boards']['consensus'] = c
    by[n]['boards']['score'] = round(score[n], 1)
json.dump(prof, open('lib/draft-profiles-2026.json', 'w'), indent=1, ensure_ascii=False)
for n, _ in TW:
    b = by[n]['boards']; print(f"{b['consensus']:2d} {n:18s} TW {b['twomey']['rank']:2d}  RM {str(b['rookieme']['rank'] or '-'):>2}  ZH {str(b['zh'] or '-'):>2}  ({b['score']})")
