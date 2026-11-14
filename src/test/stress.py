"""Rocket-route stress test.  python stress.py --slot 0 --minutes 90 --speed 60 --routes 4
Builds the blueprints with ../bpgen.js, runs test/stress.lua on a COPY of the save through fkit.harness."""
import sys, os, json, subprocess, argparse, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', '..', 'agent-kit'))
from fkit import harness

ap = argparse.ArgumentParser()
ap.add_argument('--slot', type=int, default=0); ap.add_argument('--minutes', type=float, default=1)
ap.add_argument('--speed', type=float, default=20); ap.add_argument('--routes', default='A,B,C,D')
ap.add_argument('--sample', type=float, default=5); ap.add_argument('--tag', default='run'); ap.add_argument('--bots', type=int, default=25)
ap.add_argument('--timeout', type=int, default=3600); ap.add_argument('--legacy', action='store_true'); ap.add_argument('--faults', default=''); ap.add_argument('--stale', default='')
a = ap.parse_args()

ALL = {
  'A': dict(id='A', sender=('nauvis', 2000, 2000), outpost=('Henkhisesui', 1500, 1500), recv=('Nauvis Orbit', 1500, 1500),
            cfg=dict(planet='Alpha', materialItem='se-holmium-ore', materialName='Holmium Ore', dest='orbit', refineries=3, reserve=2, prodTier=0, fuelItems=3900)),
  'B': dict(id='B', sender=('nauvis', 2200, 2000), outpost=('Wayland', 800, 800), recv=('Nauvis Orbit', 1700, 1500),
            cfg=dict(planet='Bravo', materialItem='se-iridium-ore', materialName='Iridium Ore', dest='orbit', refineries=4, reserve=2, prodTier=3, fuelItems=3900)),
  'C': dict(id='C', sender=('nauvis', 2400, 2000), outpost=('Morityema', 1000, 1000), recv=('Nauvis Orbit', 1900, 1500),
            cfg=dict(planet='Charlie', materialItem='se-holmium-ore', materialName='Holmium Ore', dest='orbit', refineries=6, reserve=1, prodTier=6, fuelItems=3900)),
  'D': dict(id='D', sender=('nauvis', 2600, 2000), outpost=('Calidus Asteroid Belt 1', 0, 0), recv=('Nauvis Orbit', 2100, 1500),
            cfg=dict(planet='Delta', materialItem='se-holmium-ore', materialName='Holmium Ore', dest='orbit', refineries=4, reserve=2, prodTier=0, space=True, fuelItems=3900)),
  'E': dict(id='E', sender=('nauvis', 2800, 2000), outpost=('Calidus Asteroid Belt 2', 0, 0), recv=('Nauvis Orbit', 2300, 1500),
            cfg=dict(planet='Echo', materialItem='se-holmium-ore', materialName='Holmium Ore', dest='orbit', refineries=6, reserve=1, prodTier=0, space=True, fuelItems=3900)),
  'F': dict(id='F', sender=('nauvis', 3000, 2000), outpost=('Yuraq', 100, 100), recv=('Nauvis Orbit', 2500, 1500),
            cfg=dict(planet='Foxtrot', materialItem='se-iridium-ore', materialName='Iridium Ore', dest='orbit', refineries=4, reserve=2, prodTier=2, fluidSupply='sulfur', fluidWater='ice', fuelItems=3900)),
  'G': dict(id='G', sender=('nauvis', 3200, 2000), outpost=('Farangis', 100, 100), recv=('Nauvis Orbit', 2700, 1500),
            cfg=dict(planet='Golf', materialItem='se-holmium-ore', materialName='Holmium Ore', dest='orbit', refineries=4, reserve=3, prodTier=9, fuelItems=3900)),
}
ids = a.routes.split(',')
defs = [dict(id=i, cfg=dict(ALL[i]['cfg'], **({'fuelItems': 1500} if a.legacy else {}))) for i in ids]
r = subprocess.run(['node', os.path.join(HERE, 'mkroutes.js'), json.dumps(defs)] + (['legacy'] if a.legacy else []), capture_output=True, text=True, encoding='utf8')
if r.returncode: print(r.stderr); sys.exit(1)
built = json.loads(r.stdout)
routes = []
for b in built:
    d = ALL[b['id']]
    bad = [e for es in b['errors'] for e in es]
    if bad: print('VALIDATION', b['id'], bad); sys.exit(1)
    routes.append(dict(id=b['id'], ore=b['ore'], space=b['space'], names=dict(launch=b['names']['launch'], supplyLaunch=b['names']['supplyLaunch'], receiver=b['names']['receiver'], supplyDock=b['names']['supplyDock']),
        strings=b['strings'], fluid_item=b['fluid_item'], fluid_filled=b['fluid_filled'], extra_items=b['extra_items'],
        sender=dict(surface=d['sender'][0], x=d['sender'][1], y=d['sender'][2]), outpost=dict(surface=d['outpost'][0], x=d['outpost'][1], y=d['outpost'][2]),
        recv=dict(surface=d['recv'][0], x=d['recv'][1], y=d['recv'][2])))
faults = [dict(id=x.split(':')[0], kind=x.split(':')[1], **{'from': float(x.split(':')[2]), 'to': float(x.split(':')[3])}) for x in a.faults.split(',') if x]
cfg = dict(stale=[x for x in a.stale.split(',') if x], faults=faults, legacy=a.legacy, routes=routes, speed=a.speed, ticks=int(a.minutes * 3600), sample=int(a.sample * 3600), bots=a.bots, floor='refined-concrete',
           stock1={'rocket-fuel': 3900, 'se-space-capsule': 100}, stock2={'se-cargo-rocket-section-packed': 150, 'se-cargo-rocket-section': 300})
lua = open(os.path.join(HERE, 'stress.lua'), encoding='utf8').read()
files = {'control.lua': lua, 'cfg.lua': 'return [==[' + json.dumps(cfg) + ']==]'}
t0 = time.time()
res = harness.run(files, 'result.txt', slot=a.slot, timeout=a.timeout)
print('ok', res.ok, 'seconds', int(time.time() - t0))
from fkit import paths
out = os.path.join(paths.env_dir(a.slot), 'state', 'script-output')
for f in ('samples.txt',):
    p = os.path.join(out, f)
    if os.path.exists(p):
        txt = open(p, encoding='utf8', errors='replace').read()
        open(os.path.join(HERE, f'samples-{a.tag}.txt'), 'w', encoding='utf8').write(txt)
print((res.text or '')[-1500:])
if not res.ok: print(res.log_tail)
