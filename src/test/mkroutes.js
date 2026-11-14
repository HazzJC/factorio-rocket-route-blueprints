// node mkroutes.js '<json routes cfg>' -> prints JSON with encoded blueprint strings + names
const legacy = process.argv[3] === 'legacy';
const g = require(legacy ? '../bpgen.v1.js' : '../bpgen.js');
const defs = JSON.parse(process.argv[2]);
(async () => {
  const out = [];
  for (const d of defs) {
    const r = g.build(d.cfg);
    const strs = {};
    for (const p of r.parts) strs[p.key] = await g.encode({ blueprint: p.json });
    out.push({ id: d.id, ore: r.cfg.materialItem, space: !!r.cfg.space, names: r.names, strings: strs, errors: r.parts.map(p => p.errors),
      fluid_item: r.cfg.fluid && r.cfg.fluid.supply === 'barrels' ? r.cfg.fluid.filled : null, fluid_filled: r.cfg.fluid && r.cfg.fluid.supply === 'barrels' ? r.cfg.fluid.filled : null,
      fuelK: r.cfg.fuelK, fuelItems: r.cfg.fuelItems, extra_items: r.cfg.fluid && r.cfg.fluid.supply === 'sulfur' ? [['sulfur', r.cfg.fluid.kit * 2], ['iron-plate', r.cfg.fluid.kitP * 2]].concat(r.cfg.fluid.kitI ? [['se-water-ice', r.cfg.fluid.kitI * 2]] : []) : [] });
  }
  process.stdout.write(JSON.stringify(out));
})();
