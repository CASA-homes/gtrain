# Learn how G-Train coaches draft: joins each 2026 G-Train pick to what was known before the draft
# (rookie + AFL pick, age, 2025/2024 averages) and summarises by pick range and by coach. Feeds the future draft simulator.
import json, re, statistics as S, collections
src=open('lib/gtrain-draft.ts').read()
picks=[dict(pick=int(a),name=b,team=c) for a,b,c in re.findall(r'pick: (\d+), name: "([^"]+)", team: "([^"]+)"', src)][:152]
dfs=json.load(open('data/dfs-2026.json')); fa=json.load(open('lib/free-agent-players.json'))['players']
dh=json.load(open('data/draft-history.json'))
norm=lambda s: re.sub('[^a-z]','',s.lower())
info={}
for r in dfs: info[norm(r['full'])]=dict(dob=r['dob'],hist=r['hist'],dy=r.get('draft_year'),cg=r.get('career_games'),debut=r.get('debut'))
for p in fa: info.setdefault(norm(p.get('full_name') or p['name']),dict(dob=p.get('birth_date'),hist=p.get('hist') or [],dy=p.get('draft_year'),cg=p.get('career_games'),debut=p.get('debut_year')))
# AFL draft picks 2024/2025
dlist=dh if isinstance(dh,list) else dh.get('picks') or dh.get('drafts') or []
afl={}
for d in (dlist if isinstance(dlist,list) else []):
    y=d.get('year'); n=d.get('full') or d.get('player'); p=d.get('pick')
    if y and n: afl[(int(y),norm(n))]=p
rows=[]
for k in picks:
    i=info.get(norm(k['name']))
    if not i: rows.append({**k,'kind':'?'}); continue
    h={y:(g,a) for y,g,a in i['hist']}
    age=(2026.15-int(i['dob'][:4])-(int(i['dob'][5:7])-1)/12) if i.get('dob') else None
    g25,a25=h.get(2025,(0,None)); g24,a24=h.get(2024,(0,None))
    rookie = (i.get('dy') in (2025,2025.0)) and (g25==0)
    pick=afl.get((2025,norm(k['name']))) or afl.get((int(i['dy']) if i.get('dy') else 0,norm(k['name'])))
    kind='Rookie' if rookie else ('Vet 30+' if age and age>=30 else 'Young (<=23)' if age and age<=23 else 'Prime')
    rows.append({**k,'kind':kind,'age':round(age,1) if age else None,'a25':a25,'g25':g25,'a24':a24,'g24':g24,'afl':pick,'dy':i.get('dy')})
json.dump(rows,open('/tmp/claude-0/learn-rows.json','w'))
print('unmatched',[r['name'] for r in rows if r['kind']=='?'])
for r in rows[:0]: print(r['pick'],r['team'][:12],r['name'],r['kind'],r.get('age'),'AFLpick',r.get('afl'),'25:',r.get('a25'),r.get('g25'),'24:',r.get('a24'))

R=[r for r in rows if r['kind']!='?']
print('\nROOKIES: G-Train pick <- AFL pick')
rk=[r for r in R if r['kind']=='Rookie']
print(len(rk), [(r['pick'],r['name'],r['afl']) for r in rk])
print('\nBY ROUND (10 picks each approx):')
for lo in range(1,153,20):
    grp=[r for r in R if lo<=r['pick']<lo+20]
    c=collections.Counter(r['kind'] for r in grp)
    a25=[r['a25'] for r in grp if r.get('a25') and r['kind']!='Rookie']
    print(f"picks {lo}-{lo+19}: {dict(c)} | non-rookie 2025 avg median {S.median(a25) if a25 else '-':}")
print('\nBY TEAM:')
for t in sorted({r['team'] for r in R}):
    g=[r for r in R if r['team']==t]
    c=collections.Counter(r['kind'] for r in g)
    first=[r for r in g if r['pick']<=40]
    print(f"{t[:22]:22s} n={len(g)} {dict(c)} | first-40: "+', '.join(f"{r['pick']}:{r['name'].split()[-1]}({r['kind'][0]})" for r in first))
