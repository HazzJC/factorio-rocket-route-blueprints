import json, sys
f=sys.argv[1]
rows=[json.loads(l) for l in open(f,encoding='utf8') if l.startswith('{')]
samples=[r for r in rows if r['ev']=='sample']
launches=[r for r in rows if r['ev']=='launch']
ids=sorted(set(r['id'] for r in samples))
print('route | ore/supply launches | WH capsule min/max/last | loose sec min/max/last | packed min/max/last | fuel items max | dock-blocked samples | alive')
for i in ids:
    S=[r for r in samples if r['id']==i]
    def ser(k,sub): return [r[k].get(sub,0) or 0 for r in S]
    cap,sec,pk,fu=ser('wh','cap'),ser('wh','sec'),ser('wh','pk'),ser('wh','fuel')
    ol=sum(1 for l in launches if l['id']==i and l['kind']=='ore'); sl=sum(1 for l in launches if l['id']==i and l['kind']=='supply')
    blocked=sum(1 for r in S if (r['dock'].get('cap',0)+r['dock'].get('sec',0)+r['dock'].get('pk',0)+r['dock'].get('fuel',0))>0)
    alive=all(r.get('alive') for r in S)
    print(f"{i} | {ol}/{sl} | {min(cap)}/{max(cap)}/{cap[-1]} | {min(sec)}/{max(sec)}/{sec[-1]} | {min(pk)}/{max(pk)}/{pk[-1]} | {max(fu)} | {blocked}/{len(S)} | {alive}")
    # thirds: average of packed and capsule
    n=len(S)//3
    avg=lambda a:round(sum(a)/max(1,len(a)),1)
    print('    avg pk by third', avg(pk[:n]),avg(pk[n:2*n]),avg(pk[2*n:]),' avg cap',avg(cap[:n]),avg(cap[n:2*n]),avg(cap[2*n:]), ' avg sec',avg(sec[:n]),avg(sec[n:2*n]),avg(sec[2*n:]))
