import json, sys, re
f = sys.argv[1]; only = sys.argv[2] if len(sys.argv) > 2 else None
rows = [json.loads(l) for l in open(f, encoding='utf8') if l.strip().startswith('{')]
def short(t): return re.sub(r'\[/?color[^\]]*\]|\[img=[^\]]*\]', '', t or '')[:90]
print('events:', {e: sum(1 for r in rows if r['ev'] == e) for e in set(r['ev'] for r in rows)})
for r in rows:
    if r['ev'] not in ('sample', 'final'): continue
    if only and r['id'] != only: continue
    w, p, d, s, rv = r['wh'], r['pad'], r['dock'], r['spad'], r['recv']
    print(f"{r['min']:6.1f} {r['id']} L={r.get('L')} launches={r['launches']}/{r['supply']} WH cap{w['cap']} sec{w['sec']} pk{w['pk']} fuel{w['fuel']} | pad ore{p['ore']} cap{p['cap']} sec{p['sec']} | tank{r['liquid']['tank']} | dock {d} | spad cap{s['cap']} sec{s['sec']} pk{s['pk']} fuel{s['fuel']} chest{s['chest_fuel']} | ret {r['returned']}")
for r in rows:
    if r['ev'] == 'panels' and (not only or r['id'] == only):
        last = r
print('LAST PANELS'); 
for r in [x for x in rows if x['ev']=='panels'][-4:]:
    print(r['id'], {k: short(v) for k, v in r.items() if k not in ('ev', 'min', 'id')})
for r in rows:
    if r['ev'] in ('launch-event-keys','CREATE FAILED','SETUP ERROR','SAMPLE ERROR'): print(r)
