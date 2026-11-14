/* Space Exploration rocket-route blueprint generator
 * Factorio 2.0.77 + Space Exploration 0.7.57 + AAI Containers / AAI Signal Transmission + Zithorian's Extra Storage Tanks.
 * Pure JS, no dependencies. Works in Node (module.exports) and in the browser (window.BPGEN).
 *
 * Every layout below was built and run inside the real game (headless) with these exact mods:
 * entities place, wires connect, inserters hit the right targets, one power network, rockets fly the whole loop. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BPGEN = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 562949958467584; // Factorio 2.0.77.0
  // inserter "direction" = the side it PICKS UP from (verified in game); belts use the direction they flow to
  const N = 0, E = 4, S = 8, W = 12;
  // wire connector ids: single-connector entities use 1 red / 2 green; combinators: in 1,2 / out 3,4; copper pole 5
  const CIN = { R: 1, G: 2 }, COUT = { R: 3, G: 4 }, C1 = { R: 1, G: 2 }, COPPER = 5;

  // ---- prototype facts (read from the installed mods' data-raw dump) ----
  const SIZES = {
    'se-rocket-launch-pad': [10, 10], 'cargo-landing-pad': [8, 8],
    'aai-warehouse': [6, 6], 'aai-warehouse-requester': [6, 6], 'aai-warehouse-passive-provider': [6, 6],
    'aai-storehouse-active-provider': [4, 4],
    'aai-signal-sender': [5, 5], 'aai-signal-receiver': [9, 9],
    'se-fuel-refinery': [5, 5], 'zith-storage-tank-5x5': [5, 5],
    'se-space-assembling-machine': [3, 3], 'assembling-machine-1': [3, 3], 'assembling-machine-2': [3, 3], 'assembling-machine-3': [3, 3],
    'substation': [2, 2], 'chemical-plant': [3, 3], 'arithmetic-combinator': [1, 2], 'decider-combinator': [1, 2],
  };
  const REACH = { 'se-rocket-launch-pad': 12.5, 'cargo-landing-pad': 12.5, 'aai-signal-sender': 10, 'aai-signal-receiver': 10 };
  const NEEDS_POWER = new Set(['bulk-inserter', 'fast-inserter', 'long-handed-inserter', 'inserter', 'assembling-machine-1',
    'assembling-machine-2', 'assembling-machine-3', 'se-space-assembling-machine', 'chemical-plant', 'se-fuel-refinery', 'aai-signal-sender', 'aai-signal-receiver', 'small-lamp']);
  const SUB_SUPPLY = 9; // substation supply area 18x18

  const sigItem = (n) => ({ name: n });
  const sigFluid = (n) => ({ type: 'fluid', name: n });
  const sigVirt = (n) => ({ type: 'virtual', name: n });
  const IT = {
    fuel: 'rocket-fuel', packed: 'se-cargo-rocket-section-packed', section: 'se-cargo-rocket-section',
    capsule: 'se-space-capsule', liquid: 'se-liquid-rocket-fuel',
  };

  class Builder {
    constructor() { this.e = []; this.wires = []; this.tiles = []; }
    put(name, tx, ty, o = {}) {
      const dir = o.dir || 0;
      let [w, h] = SIZES[name] || [1, 1];
      if (/combinator$/.test(name) && name !== 'constant-combinator' && (dir === E || dir === W)) [w, h] = [h, w];
      const ent = { n: this.e.length + 1, name, tx, ty, w, h, dir, x: tx + w / 2, y: ty + h / 2, extra: o.extra || {}, tags: o.tags,
        from: o.from, to: o.to, long: name === 'long-handed-inserter', role: o.role };
      this.e.push(ent);
      return ent;
    }
    wire(a, ca, b, cb) { this.wires.push([a.n, ca, b.n, cb, a, b]); }
    chain(ents, conn) { for (let i = 1; i < ents.length; i++) this.wire(ents[i - 1], conn[0], ents[i], conn[1] === undefined ? conn[0] : conn[1]); }
    json(label, description, icons) {
      const entities = this.e.map((e) => {
        const o = { entity_number: e.n, name: e.name, position: { x: e.x, y: e.y } };
        if (e.dir) o.direction = e.dir;
        Object.assign(o, e.extra);
        if (e.tags) o.tags = e.tags;
        return o;
      });
      const bp = {
        icons: icons.map((s, i) => ({ signal: s, index: i + 1 })),
        entities,
        wires: this.wires.map((w) => [w[0], w[1], w[2], w[3]]),
        item: 'blueprint', label, version: VERSION,
      };
      if (description) bp.description = description;
      if (this.tiles.length) bp.tiles = this.tiles;
      return bp;
    }
  }

  const cmp = (first, comparator, second) => {
    const c = { first_signal: first, comparator };
    if (typeof second === 'number') { if (second !== 0) c.constant = second; } else c.second_signal = second;
    return c;
  };
  function inserter(B, type, tx, ty, dir, o) {
    const extra = {};
    const list = o.filters || (o.filter ? [o.filter] : null);
    if (list) {
      extra.use_filters = true; // without this flag the filter list is ignored (found the hard way in-game)
      extra.filter_mode = o.blacklist ? 'blacklist' : 'whitelist';
      extra.filters = list.map((n, i) => ({ index: i + 1, name: n, quality: 'normal', comparator: '=' }));
    }
    if (o.cond) extra.control_behavior = { circuit_enabled: true, circuit_condition: cmp(o.cond[0], o.cond[1], o.cond[2]) };
    return B.put(type, tx, ty, { dir, extra, from: o.from, to: o.to, role: o.role });
  }

  // ---- debug lamps + display panels ----
  const SEV = { bad: ['signal-deny', 'red', { r: 1, g: 0.15, b: 0.1, a: 1 }], warn: ['signal-yellow', 'yellow', { r: 1, g: 0.8, b: 0.1, a: 1 }],
    ok: ['signal-check', 'green', { r: 0.25, g: 1, b: 0.3, a: 1 }], info: ['signal-info', 'cyan', { r: 0.3, g: 0.65, b: 1, a: 1 }] };
  const ALWAYS = () => cmp(sigVirt('signal-A'), '>', -2000000000);     // always true (signal-A can go negative on the stock net): the panel's fallback message
  // lamp lit = the condition is true (colour says how bad). Wire it to the network that carries the signal.
  function lamp(B, tx, ty, sev, cond, role) {
    return B.put('small-lamp', tx, ty, { role: role || 'debug', extra: { color: SEV[sev][2], control_behavior: { circuit_enabled: true, circuit_condition: cmp(cond[0], cond[1], cond[2]) } } });
  }
  // display panel shows the FIRST message whose condition is true, so list the most important first
  function panel(B, tx, ty, msgs, role) {
    return B.put('display-panel', tx, ty, { role: role || 'debug', extra: { control_behavior: { parameters: msgs.map((m) => ({
      condition: m.cond ? cmp(m.cond[0], m.cond[1], m.cond[2]) : ALWAYS(), icon: sigVirt(SEV[m.sev][0]), text: `[color=${SEV[m.sev][1]}]${m.text}[/color]` })) } } });
  }
  // route key: both ends carry it so a shared AAI channel cannot mix two routes up (derived from planet + material)
  function routeKey(c) {
    const str = c.planet + '|' + c.materialItem; let h1 = 2166136261, h2 = 5381;
    for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 16777619) >>> 0; h2 = (Math.imul(h2, 33) ^ ch) >>> 0; }
    return [1000 + (h1 % 998000), 1000 + (h2 % 998000)];
  }

  // ---- configuration ----
  // refinery productivity modules (tiers 1-9, read from the installed prototypes): bonus and speed penalty per module
  const PROD = [0, .04, .06, .08, .10, .12, .14, .16, .18, .20];
  const SLOW = [0, .10, .15, .20, .25, .30, .35, .40, .45, .50];
  const modName = (t) => (t <= 1 ? 'productivity-module' : 'productivity-module-' + t);
  const oBelt = (c) => (c.space ? 'se-space-transport-belt' : c.belt);
  function addScaffold(B) { // space floor under every footprint (belts and pipes included)
    const seen = new Set();
    for (const e of B.e) for (let x = e.tx; x < e.tx + e.w; x++) for (let y = e.ty; y < e.ty + e.h; y++) {
      const k = x + ',' + y; if (seen.has(k)) continue; seen.add(k);
      B.tiles.push({ position: { x, y }, name: 'se-space-platform-scaffold' });
    }
  }
  function defaults(c) {
    const d = Object.assign({
      planet: 'Planet', materialItem: 'se-holmium-ore', materialName: 'Holmium Ore', dest: 'nauvis',
      refineries: 2, reserve: 2, fuelItems: 2500, packed: 20, capsules: 1, prodTier: 0, launchFuel: 0, margin: 80, space: false,
      bulk: true, belt: 'fast-transport-belt', assembler: 'assembling-machine-3', channel: '',
    }, c || {});
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));
    d.refineries = clamp(d.refineries, 1, 6);
    d.reserve = clamp(d.reserve, 1, 3);
    d.packed = clamp(d.packed, 20, 60);
    d.capsules = clamp(d.capsules, 1, 4);
    d.prodTier = Math.max(0, Math.min(9, Math.round(Number(d.prodTier) || 0)));
    d.margin = clamp(d.margin, 10, 400);
    d.space = !!d.space;
    if (d.space) { d.fluidSupply = 'barrels'; d.belt = 'se-space-transport-belt'; }
    // refinery maths: 3 modules; productivity adds to the 50 liquid per fuel item, speed drops (never below 20%)
    d.fuelProd = d.prodTier ? 3 * PROD[d.prodTier] : 0;
    d.fuelSpeed = d.prodTier ? Math.max(0.2, 1 - 3 * SLOW[d.prodTier]) : 1;
    d.fuelK = Math.round(50 * (1 + d.fuelProd));                                   // liquid fuel per fuel item
    d.launchFuel = Math.max(0, Math.round(Number(d.launchFuel) || 0));
    // the most fuel one supply rocket may carry (the sender asks the bots for this many): auto from the launch fuel when known
    d.fuelItems = d.launchFuel > 0 ? clamp(Math.ceil(d.launchFuel / d.fuelK) + d.margin + 50, 100, 2600) : clamp(d.fuelItems, 100, d.maxFuelItems || 2600);
    d.planet = String(d.planet || 'Planet').trim() || 'Planet';
    d.materialName = String(d.materialName || 'Ore').trim() || 'Ore';
    d.dest = d.dest === 'orbit' ? 'orbit' : 'nauvis';
    d.debug = d.debug !== false;
    d.fluid = resolveFluid(d);
    return d;
  }
  // ores that cannot be mined without a fluid (from the installed prototypes): fluid per ore mined
  const FLUID_ORES = { 'uranium-ore': ['sulfuric-acid', 10], 'se-iridium-ore': ['sulfuric-acid', 1], 'se-naquium-ore': ['sulfuric-acid', 20] };
  function resolveFluid(d) {
    let name = null, per = 0;
    const mode = d.fluidMode || 'auto';
    if (mode === 'auto' && FLUID_ORES[d.materialItem]) { name = FLUID_ORES[d.materialItem][0]; per = FLUID_ORES[d.materialItem][1]; }
    else if (mode === 'custom' && d.fluidName) { name = String(d.fluidName).trim(); per = 1; }
    if (!name) return null;
    if (mode === 'custom' && Number(d.fluidPerOre) > 0) per = Number(d.fluidPerOre);
    const orePerRocket = (Number(d.stack) || 50) * 498;
    const acid = orePerRocket * per;                                            // fluid units one full ore rocket needs
    const fuelSlots = Math.ceil(d.fuelItems / 10);
    const roomSlots = Math.max(1, 470 - fuelSlots - d.packed - d.capsules);       // slots left beside the other cargo
    const supply = name === 'sulfuric-acid' && d.fluidSupply === 'sulfur' ? 'sulfur' : 'barrels';
    const water = supply === 'sulfur' && d.fluidWater === 'ice' ? 'ice' : 'pipe';
    const round10 = (v) => Math.max(10, Math.min(supply === "sulfur" ? 25000 : 2500, Math.round(v / 10) * 10));
    const f = { name, per, supply, water, filled: name + '-barrel', recipe: 'empty-' + name + '-barrel' };
    if (supply === 'sulfur') {
      // sulfuric acid = 5 sulfur + 1 iron plate + 100 water -> 50 acid; 1 water ice melts into 100 water
      const slotPerSulfur = 1 / 50 + (1 / 5) / 100 + (water === 'ice' ? (1 / 5) / 200 : 0);
      f.need = Math.max(1, Math.ceil(acid / 10));                                   // sulfur per full ore rocket
      const maxS = Math.floor(roomSlots / slotPerSulfur * 0.8);
      f.kit = round10(d.barrels ? Number(d.barrels) : Math.min(f.need * d.reserve, maxS));
      f.kitP = Math.ceil(f.kit / 5); f.kitI = water === 'ice' ? Math.ceil(f.kit / 5) : 0;
      f.slots = Math.ceil(f.kit / 50 + f.kitP / 100 + f.kitI / 200);
      f.thrFluid = Math.min(d.reserve * acid, 140000);
    } else {
      f.need = Math.max(1, Math.ceil(acid / 50));                                   // barrels per full ore rocket
      const want = d.barrels ? Number(d.barrels) : Math.min(f.need * d.reserve, Math.floor(roomSlots * 10 * 0.8)); // one shipment covers the reserve
      f.kit = round10(want);
      f.slots = Math.ceil(f.kit / 10);
      f.thr = Math.min(d.reserve * f.need, 3000);
      f.thrFluid = f.thr * 50;
    }
    return f;
  }
  function names(c) {
    const p = c.planet, m = c.materialName;
    return {
      launch: `${p} ${m} Launch`,
      receiver: `${p} ${m} Receiver`,
      supplyDock: `${p} ${m} Supply Dock`,
      supplyLaunch: `${p} ${m} Supply Launch`,
      channel: c.channel && c.channel.trim() ? c.channel.trim() : `${p} ${m} Supply`,
    };
  }
  const destLabel = (c) => (c.dest === 'orbit' ? 'Nauvis Orbit' : 'Nauvis');

  // =====================================================================================
  //  1 - Nauvis supply sender
  // =====================================================================================
  function genSender(c) {
    const nm = names(c), B = new Builder();
    const insF = 'fast-inserter', bulk = c.bulk ? 'bulk-inserter' : 'fast-inserter';
    const S1p = B.put('substation', -3, 0, { role: 'power' });
    const S2 = B.put('substation', 10, -2, { role: 'power' });
    const LP = B.put('se-rocket-launch-pad', 0, 0, { role: 'lp', tags: { name: nm.supplyLaunch, launch_trigger: 'fuel-full-signal', landing_pad_name: nm.supplyDock } });
    const WH = B.put('aai-warehouse-requester', -7, 4, { role: 'wh', extra: { request_filters: { sections: [{ index: 1, filters: [
      { index: 1, name: IT.fuel, quality: 'normal', comparator: '=', count: c.fuelItems },
      { index: 2, name: IT.packed, quality: 'normal', comparator: '=', count: c.packed },
      { index: 3, name: IT.capsule, quality: 'normal', comparator: '=', count: c.capsules + 1 },
      { index: 4, name: IT.section, quality: 'normal', comparator: '=', count: 100 },
    ].concat(c.fluid && c.fluid.supply === 'barrels' ? [{ index: 5, name: c.fluid.filled, quality: 'normal', comparator: '=', count: c.fluid.kit }] : []) }] } } });
    const mk = (y, type, item, cond) => inserter(B, type, -1, y, W, { filter: item, cond, from: WH, to: LP });
    const condFuel = [sigItem(IT.fuel), '<', sigVirt('signal-A')];
    const iFuel = mk(4, bulk, IT.fuel, condFuel); // fuel is ~90% of the cargo: two inserters
    const iFuel2 = mk(5, bulk, IT.fuel, condFuel);
    const iPack = mk(6, insF, IT.packed, [sigItem(IT.packed), '<', sigVirt('signal-B')]);
    const iCap = mk(7, insF, IT.capsule, [sigItem(IT.capsule), '<', sigVirt('signal-C')]);
    const iSec = mk(8, insF, IT.section, [sigItem(IT.section), '<', 100]); // the pad's own 100 sections
    const fl = c.fluid, sulfur = fl && fl.supply === 'sulfur';
    const iBar = fl && !sulfur ? mk(9, insF, fl.filled, [sigItem(fl.filled), '<', sigVirt('signal-G')]) : null;
    // sulfur mode: a second requester warehouse south of the pad holds sulfur / iron plates (/ water ice)
    const iSul = [];
    if (sulfur) {
      const flt = [{ index: 1, name: 'sulfur', quality: 'normal', comparator: '=', count: fl.kit }, { index: 2, name: 'iron-plate', quality: 'normal', comparator: '=', count: fl.kitP }]
        .concat(fl.kitI ? [{ index: 3, name: 'se-water-ice', quality: 'normal', comparator: '=', count: fl.kitI }] : []);
      const WH2 = B.put('aai-warehouse-requester', -2, 11, { role: 'wh', extra: { request_filters: { sections: [{ index: 1, filters: flt }] } } });
      const mk2 = (x, item, sig) => inserter(B, insF, x, 10, S, { filter: item, cond: [sigItem(item), '<', sigVirt(sig)], from: WH2, to: LP });
      iSul.push(mk2(0, 'sulfur', 'signal-G'), mk2(1, 'iron-plate', 'signal-H'));
      if (fl.kitI) iSul.push(mk2(2, 'se-water-ice', 'signal-I'));
      const S3 = B.put('substation', -4, 10, { role: 'power' });
      B.wire(S1p, COPPER, S3, COPPER);
    }
    const TANKN = B.put('zith-storage-tank-5x5', 4, 10, { role: 'tank', extra: { control_behavior: { read_contents: true } } });
    if (sulfur) B.put('pipe', 4, 15, { role: 'pipe' }); else B.put('pipe', 3, 14, { role: 'pipe' });
    const RX = B.put('aai-signal-receiver', 11, 0, { role: 'aai', tags: { channel: nm.channel } });
    const DL = B.put('decider-combinator', 10, 2, { dir: N, role: 'logic', extra: { control_behavior: { decider_conditions: {
      conditions: [
        cmp(sigVirt('signal-D'), '>', 0),
        Object.assign(cmp(sigItem(IT.fuel), '≥', sigVirt('signal-A')), { compare_type: 'and' }),
        Object.assign(cmp(sigItem(IT.packed), '≥', sigVirt('signal-B')), { compare_type: 'and' }),
        Object.assign(cmp(sigItem(IT.capsule), '≥', sigVirt('signal-C')), { compare_type: 'and' }),
      ].concat(fl ? (sulfur
        ? [['sulfur', 'signal-G'], ['iron-plate', 'signal-H']].concat(fl.kitI ? [['se-water-ice', 'signal-I']] : [])
        : [[fl.filled, 'signal-G']]).map(([it, sg]) => Object.assign(cmp(sigItem(it), '≥', sigVirt(sg)), { compare_type: 'and' })) : []),
      outputs: [{ signal: sigVirt('signal-green'), copy_count_from_input: false }],
    } } } });
    B.wire(S1p, COPPER, S2, COPPER);
    // The AAI link keeps the wire colour it was sent on and the outpost transmits on green, so the receiver side is green.
    // The pad side (decider, inserters, tank, pad) is one RED network.
    // the AAI receiver hands out EVERYTHING on its channel, so it gets its own network and a filter that only lets this
    // route's request through (matching route key); other traffic on a shared channel never reaches the pad network
    const [kA, kB] = routeKey(c);
    const passSigs = ['signal-A', 'signal-B', 'signal-C', 'signal-D'].concat(fl ? (sulfur ? ['signal-G', 'signal-H'].concat(fl.kitI ? ['signal-I'] : []) : ['signal-G']) : []);
    // The filter reads GREEN only and writes RED only. The pad network is red, so the filter can never read its own output:
    // even if an old wire (from an earlier version of this blueprint) joins the AAI receiver to the pad, nothing can ramp up.
    const GREEN_ONLY = { red: false, green: true };
    const gcond = (cnd) => Object.assign(cnd, { first_signal_networks: GREEN_ONLY, second_signal_networks: GREEN_ONLY });
    const FD = B.put('decider-combinator', 10, 4, { dir: N, role: 'logic', extra: { control_behavior: { decider_conditions: {
      conditions: [gcond(cmp(sigVirt('signal-K'), '=', kA)), gcond(Object.assign(cmp(sigVirt('signal-Q'), '=', kB), { compare_type: 'and' }))],
      outputs: passSigs.map((sg) => ({ signal: sigVirt(sg), copy_count_from_input: true, networks: GREEN_ONLY })),
    } } } });
    B.wire(RX, C1.G, FD, CIN.G);
    B.wire(FD, COUT.R, LP, C1.R);
    B.wire(TANKN, C1.R, LP, C1.R);                       // buffer tank counts as fuel in the pad's signal
    B.wire(LP, C1.R, DL, CIN.R);
    B.wire(DL, COUT.R, LP, C1.R);
    B.wire(LP, C1.R, iSec, C1.R);
    B.chain([iSec, iCap, iPack, iFuel2, iFuel].concat(iBar ? [iBar] : []).concat(iSul), [C1.R]);
    if (c.debug) {
      const sg = (n) => sigVirt(n), L = sg('signal-L');
      // link status (on the raw AAI network): lamp lit when the route key does not match, panel says why
      const lLink = lamp(B, 10, 6, 'bad', [sg('signal-K'), '≠', kA]);
      const pLink = panel(B, 10, 7, [
        { sev: 'bad', cond: [sg('signal-L'), '>', 0], text: 'STALE WIRE: the AAI receiver is wired to the launch pad (an old version of this sender was pasted over). Delete the old sender and paste this one fresh, or cut the green wire between the receiver and the pad.' },
        { sev: 'bad', cond: [sg('signal-K'), '<', 1], text: `LINK DOWN: nothing from the outpost. Power the AAI link at both ends; channel "${nm.channel}" must be identical on both.` },
        { sev: 'bad', cond: [sg('signal-K'), '>', kA], text: `LINK CONFLICT: channel carries another route's key (shared channel?). Give this route its own channel.` },
        { sev: 'bad', cond: [sg('signal-K'), '<', kA], text: `LINK CONFLICT: channel carries another route's key (shared channel?). Give this route its own channel.` },
        { sev: 'ok', text: 'Link OK: route key matches' }]);
      B.wire(RX, C1.G, lLink, C1.G); B.chain([lLink, pLink], [C1.G]);
      // pad status (on the pad network): lamps + one prioritized message
      const fluidSig = sigFluid(IT.liquid);
      const pPad = panel(B, 9, -1, [
        { sev: 'bad', cond: [L, '<', 1], text: `NO DESTINATION: outpost dock "${nm.supplyDock}" not found. Build the outpost first / check the name.` },
        { sev: 'bad', cond: [fluidSig, '<', L], text: 'WAITING ON LIQUID FUEL: pad + buffer tank hold less than one launch. Pipe more rocket fuel in.' },
        { sev: 'warn', cond: [sigItem(IT.section), '<', 100], text: 'WAITING OWN SECTIONS: the requester chest has no cargo sections (the pad needs 100).' },
        { sev: 'warn', cond: [sigItem(IT.capsule), '<', 1], text: 'WAITING CAPSULE: none in the requester chest.' },
        { sev: 'warn', cond: [sg('signal-green'), '>', 0], text: 'LOADED, launch signal ON: waiting for the pad (fuel, or the outpost dock is not empty).' },
        { sev: 'info', cond: [sg('signal-D'), '>', 0], text: 'LOADING: the outpost asked for supplies.' },
        { sev: 'ok', text: 'IDLE: the outpost has enough stock.' }]);
      const l1 = lamp(B, 8, -1, 'bad', [L, '<', 1]);
      const l2 = lamp(B, 7, -1, 'bad', [fluidSig, '<', L]);
      const l3 = lamp(B, 6, -1, 'info', [sg('signal-D'), '>', 0]);
      const l4 = lamp(B, 5, -1, 'warn', [sg('signal-green'), '>', 0]);
      B.wire(DL, CIN.R, pPad, C1.R); B.chain([pPad, l1, l2, l3, l4], [C1.R]);
      // requester chest (own red wire = chest contents only): what the bots have not delivered yet
      const pChest = panel(B, -9, 5, [
        { sev: 'warn', cond: [sigItem(IT.fuel), '<', 1], text: `CHEST EMPTY: [img=item/${IT.fuel}] rocket fuel. Waiting for bots (check the supply chest / logistic network).` },
        { sev: 'warn', cond: [sigItem(IT.section), '<', 100], text: `CHEST SHORT: [img=item/${IT.section}] cargo sections (the pad needs 100 per rocket).` },
        { sev: 'warn', cond: [sigItem(IT.capsule), '<', 1], text: `CHEST EMPTY: [img=item/${IT.capsule}] capsules.` },
        { sev: 'warn', cond: [sigItem(IT.packed), '<', 1], text: `CHEST EMPTY: [img=item/${IT.packed}] packed sections.` },
        { sev: 'ok', text: 'Requester chest stocked.' }]);
      B.wire(WH, C1.R, pChest, C1.R);
    }
    return {
      builder: B,
      json: B.json(`1/3 ${c.planet} ${c.materialName}: Nauvis supply sender`,
        `Nauvis supply sender for "${c.planet} ${c.materialName}". The requester chest (bots) holds rocket fuel, packed cargo sections and capsules. ` +
        `The outpost asks for supplies over AAI channel "${nm.channel}"; the decider loads and launches a rocket to dock "${nm.supplyDock}". ` +
        (fl ? (sulfur ? `Also ships sulfur and iron plates${fl.kitI ? ' and water ice' : ''} so the outpost can make ${fl.name} (the ore needs ${fl.per} per unit mined); a second requester chest south of the pad holds them. `
          : `Also ships ${fl.name} barrels (the ore needs ${fl.per} per unit mined). `) : '') +
        `Pipe liquid rocket fuel into the buffer tank (pipe stub on its west side) and connect power.`,
        [sigItem('se-rocket-launch-pad'), sigItem(IT.packed), sigItem(IT.fuel)]),
    };
  }

  // =====================================================================================
  //  2 - launch outpost (planet / moon, or space)
  // =====================================================================================
  // Reading guide (also printed in the tool):
  //   ORE      belts -> 2 storage warehouses (N and E of the pad) -> pad          (buffer while the rocket is away)
  //   SUPPLY   dock -> warehouse -> pad / unpacker / refineries; surplus goes home through three "valve" inserters
  //   FUEL     brain: how many fuel items to ask for = ceil((R x launch fuel - stock) / K) + margin, K = liquid per fuel item
  //   LOGIC    one red "stock" network (everything we hold) and one green "request" network (what we transmit)
  function genOutpost(c) {
    const nm = names(c), B = new Builder();
    const sp = !!c.space;
    const bulk = c.bulk ? 'bulk-inserter' : 'fast-inserter', insF = 'fast-inserter';
    const R = c.reserve, NR = c.refineries, mat = c.materialItem, K = c.fuelK;
    const belt = oBelt(c), pipe = sp ? 'se-space-pipe' : 'pipe', amach = sp ? 'se-space-assembling-machine' : c.assembler;
    let S6pending = null;

    const LP = B.put('se-rocket-launch-pad', 0, 0, { role: 'lp', tags: { name: nm.launch, launch_trigger: 'cargo-full', landing_pad_name: nm.receiver } });

    // ---- ore: belts -> two storage warehouses -> pad (north and east) ----
    const WHA = B.put('aai-warehouse', 2, -7, { role: 'ore' });
    const WHB = B.put('aai-warehouse', 11, 2, { role: 'ore' });
    for (let i = 2; i <= 7; i++) {
      inserter(B, bulk, i, -1, N, { filter: mat, from: WHA, to: LP });                                              // warehouse -> pad
      inserter(B, i % 2 === 0 ? bulk : 'long-handed-inserter', i, -8, N, { filter: mat, to: WHA });                 // belt -> warehouse (near belt: short, far belt: long)
    }
    for (let j = 2; j <= 7; j++) {
      inserter(B, bulk, 10, j, E, { filter: mat, from: WHB, to: LP });
      inserter(B, j % 2 === 0 ? bulk : 'long-handed-inserter', 17, j, E, { filter: mat, to: WHB });
    }
    for (let i = 0; i < 10; i++) { B.put(belt, i, -9, { dir: E, role: 'belt' }); B.put(belt, i, -10, { dir: E, role: 'belt' }); }
    for (let j = 0; j < 10; j++) { B.put(belt, 18, j, { dir: N, role: 'belt' }); B.put(belt, 19, j, { dir: N, role: 'belt' }); }

    // ---- west: supply dock -> buffer warehouse -> pad (the dock must be emptied after every landing) ----
    const WH = B.put('aai-warehouse', -7, 4, { role: 'wh' });
    const AM = B.put(amach, -4, 0, { role: 'am', extra: { recipe: 'se-cargo-rocket-section-unpack' } });
    const gate = (tx, ty, dir, item, cond, from, to) => inserter(B, insF, tx, ty, dir, { filter: item, cond, from, to });
    const iSec = gate(-1, 5, W, IT.section, [sigItem(IT.section), '<', 100], WH, LP);
    const iCap = gate(-1, 6, W, IT.capsule, [sigItem(IT.capsule), '<', 1], WH, LP);
    const iAm = gate(-1, 1, W, null, [sigItem(IT.section), '<', 100], AM, LP);
    const iPk = gate(-3, 3, S, IT.packed, [sigItem(IT.section), '<', 100], WH, AM);
    // VALVES: when the warehouse holds more than the reserve, the surplus rides home in the next ore rocket.
    // They read only the warehouse (own green wire), so they never see the pad.
    const vSec = inserter(B, insF, -1, 4, W, { filter: IT.section, cond: [sigItem(IT.section), '>', 100 * (R + 1)], from: WH, to: LP, role: 'valve' });
    const vCap = inserter(B, insF, -1, 8, W, { filter: IT.capsule, cond: [sigItem(IT.capsule), '>', R + 1], from: WH, to: LP, role: 'valve' });
    const vPak = inserter(B, insF, -1, 9, W, { filter: IT.packed, cond: [sigItem(IT.packed), '>', c.packed * (R + 1)], from: WH, to: LP, role: 'valve' });
    B.wire(WH, C1.G, vSec, C1.G); B.chain([vSec, vCap, vPak], [C1.G]);
    // mining fluid (e.g. sulfuric acid for iridium)
    const fl = c.fluid, sulfur = fl && fl.supply === 'sulfur';
    let ATANK = null, WH2 = null;
    const keep = sulfur ? ['sulfur', 'iron-plate'].concat(fl.water === 'ice' ? ['se-water-ice'] : []) : null;
    if (fl && !sulfur) {
      // barrels -> unbarrel -> buffer tank -> pipe stub for the drills; empties ride home with the ore
      const amF = sp ? amach : (c.assembler === 'assembling-machine-1' ? 'assembling-machine-2' : c.assembler); // barrelling needs fluid crafting
      const BAM = B.put(amF, -7, 0, { dir: E, role: 'am', extra: { recipe: fl.recipe } });
      ATANK = B.put('zith-storage-tank-5x5', -12, -3, { role: 'tank', extra: { control_behavior: { read_contents: true } } });
      B.put(pipe, -13, 1, { role: 'pipe' });
      inserter(B, insF, -6, 3, S, { filter: fl.filled, from: WH, to: BAM });
      inserter(B, insF, -5, 3, N, { filter: 'barrel', from: BAM, to: WH });
      inserter(B, insF, -1, 7, W, { filter: 'barrel', from: WH, to: LP });
    }
    const LD = B.put('cargo-landing-pad', -16, 4, { role: 'ld', tags: { name: nm.supplyDock } });
    if (sulfur) {
      // sulfur + plates (+ ice) go to their own warehouse north of the dock; chemical plants turn them into acid next to a tank
      WH2 = B.put('aai-warehouse', -15, -3, { role: 'wh' });
      for (const x of [-14, -13, -12]) inserter(B, insF, x, 3, S, { filters: keep, from: LD, to: WH2 });
      const A = B.put('chemical-plant', -12, -7, { dir: W, role: 'am', extra: { recipe: 'sulfuric-acid' } });
      inserter(B, insF, -11, -4, S, { filters: ['sulfur', 'iron-plate'], from: WH2, to: A });
      if (fl.water === 'ice') {
        const M = B.put('chemical-plant', -15, -7, { dir: W, role: 'am', extra: { recipe: 'se-melting-water-ice' } });
        inserter(B, insF, -14, -4, S, { filter: 'se-water-ice', from: WH2, to: M });
      } else B.put(pipe, -13, -5, { role: 'pipe' });       // water inlet stub (offshore pump / your water)
      ATANK = B.put('zith-storage-tank-5x5', -9, -5, { role: 'tank', extra: { control_behavior: { read_contents: true } } });
      B.put(pipe, -4, -5, { role: 'pipe' });                // acid outlet stub for the drills
      const S6 = B.put('substation', -17, -1, { role: 'power' });
      S6pending = S6;
    }
    for (let y = 4; y < 10; y++) inserter(B, bulk, -8, y, W, sulfur ? { filters: keep, blacklist: true, from: LD, to: WH } : { from: LD, to: WH });

    // ---- fuel: warehouse -> belt -> refineries (+ productivity modules) -> pipes -> buffer tank (touches the pad's own tank) ----
    inserter(B, bulk, -3, 10, N, { filter: IT.fuel, from: WH });
    for (let y = 11; y <= 10 + 5 * NR; y++) B.put(belt, -3, y, { dir: S, role: 'belt' });
    for (let k = 0; k < NR; k++) {
      const extra = { recipe: IT.liquid };
      if (c.prodTier > 0) extra.items = [{ id: { name: modName(c.prodTier) }, items: { in_inventory: [0, 1, 2].map((s) => ({ inventory: 4, stack: s })) } }];
      const ref = B.put('se-fuel-refinery', -1, 10 + 5 * k, { dir: E, role: 'refinery', extra });
      inserter(B, insF, -2, 11 + 5 * k, W, { filter: IT.fuel, to: ref });
    }
    for (let y = 15; y <= 10 + 5 * (NR - 1); y++) B.put(pipe, 4, y, { role: 'pipe' });
    const TANK = B.put('zith-storage-tank-5x5', 4, 10, { role: 'tank', extra: { control_behavior: { read_contents: true } } });

    // ---- logic cluster (row y=15 / y=17 / y=19) ----
    const arith = (tx, ty, a, op, k, out, o) => B.put('arithmetic-combinator', tx, ty, { dir: N, role: 'logic', extra: { control_behavior: { arithmetic_conditions: Object.assign({ first_signal: a, operation: op, output_signal: out }, typeof k === 'number' ? { second_constant: k } : { second_signal: k }) } } });
    const decider = (tx, ty, conds, outs) => B.put('decider-combinator', tx, ty, { dir: N, role: 'logic', extra: { control_behavior: { decider_conditions: { conditions: conds, outputs: outs } } } });
    const A1 = arith(5, 15, sigItem(IT.fuel), '*', K, sigFluid(IT.liquid));         // fuel items -> liquid equivalent (K = liquid per item, from the module tier)
    const A2 = arith(6, 15, sigItem(IT.packed), '*', 5, sigItem(IT.section));      // packed -> sections equivalent
    const needFuel = R > 1 ? sigVirt('signal-M') : sigVirt('signal-L');            // L = launch fuel reported by the pad
    const lowFuel = () => cmp(sigFluid(IT.liquid), '<', needFuel);
    const lowSec = () => cmp(sigItem(IT.section), '<', 100 * R);
    const lowCap = () => cmp(sigItem(IT.capsule), '<', R);
    const copy = (s) => [{ signal: sigVirt(s), copy_count_from_input: true }];
    const sA = sigVirt('signal-A');
    // FUEL BRAIN:  X = need - stock ;  Z = X + (K-1) + margin*K ;  A = Z / K  (= ceil(X/K) + margin fuel items)
    const AX = arith(11, 15, needFuel, '-', sigFluid(IT.liquid), sigVirt('signal-X'));
    const AZ = arith(12, 15, sigVirt('signal-X'), '+', K - 1 + c.margin * K, sigVirt('signal-Z'));
    const AA = arith(13, 15, sigVirt('signal-Z'), '/', K, sA);
    const D1 = decider(7, 15, [lowFuel(), Object.assign(cmp(sA, '≤', c.fuelItems), { compare_type: 'and' })], copy('signal-A'));
    const D1b = decider(14, 15, [lowFuel(), Object.assign(cmp(sA, '>', c.fuelItems), { compare_type: 'and' })], [{ signal: sA, copy_count_from_input: false, constant: c.fuelItems }]); // never ask for more than one rocket can carry
    const D2 = decider(8, 15, [lowSec()], copy('signal-B'));
    const D3 = decider(9, 15, [lowCap()], copy('signal-C'));
    const D4 = decider(10, 15, [lowFuel(), Object.assign(lowSec(), { compare_type: 'or' }), Object.assign(lowCap(), { compare_type: 'or' })],
      [{ signal: sigVirt('signal-D'), copy_count_from_input: false }]);
    let A3 = null;
    if (R > 1) A3 = arith(7, 17, sigVirt('signal-L'), '*', R, sigVirt('signal-M'));
    const constant = (tx, ty, filters) => B.put('constant-combinator', tx, ty, { role: 'logic', extra: { control_behavior: { sections: { sections: [{ index: 1, filters: filters.map((f, i) => ({ index: i + 1, type: 'virtual', name: f[0], quality: 'normal', comparator: '=', count: f[1] })) }] } } } });
    const lowAcid = () => cmp(sigFluid(fl.name), '<', fl.thrFluid);
    let A4 = null, D5 = null;
    if (fl) {
      // barrels (50 fluid each) or sulfur (10 acid each) -> acid equivalent, so stock counts what is still unprocessed
      A4 = sulfur ? arith(8, 17, sigItem('sulfur'), '*', 10, sigFluid(fl.name)) : arith(8, 17, sigItem(fl.filled), '*', 50, sigFluid(fl.name));
      D5 = decider(9, 17, [lowAcid()], sulfur ? copy('signal-G').concat(copy('signal-H')).concat(fl.kitI ? copy('signal-I') : []) : copy('signal-G'));
      D4.extra.control_behavior.decider_conditions.conditions.push(Object.assign(lowAcid(), { compare_type: 'or' }));
    }
    // KIT: fixed lot sizes for sections / capsules / mining fluid (only requested while stock is low; valves send surplus home)
    const KIT = constant(5, 17, [['signal-B', c.packed], ['signal-C', c.capsules]].concat(fl ? [['signal-G', fl.kit]].concat(sulfur ? [['signal-H', fl.kitP]].concat(fl.kitI ? [['signal-I', fl.kitI]] : []) : []) : []));
    const [kA, kB] = routeKey(c);
    const BASE = constant(6, 17, [['signal-C', 1], ['signal-K', kA], ['signal-Q', kB]]);   // baseline capsule + route key
    const SND = B.put('aai-signal-sender', 6, 19, { role: 'aai', tags: { channel: nm.channel } });

    // ---- power ----
    const SN = B.put('substation', 0, -5, { role: 'power' });
    const S3 = B.put('substation', -6, 10, { role: 'power' });
    const S4 = B.put('substation', 9, 10, { role: 'power' });
    B.wire(SN, COPPER, S3, COPPER); B.wire(SN, COPPER, S4, COPPER); B.wire(S3, COPPER, S4, COPPER);
    let prevS = S3;
    for (let y = 20; y < 10 + 5 * NR; y += 10) { const S5 = B.put('substation', -6, y, { role: 'power' }); B.wire(prevS, COPPER, S5, COPPER); prevS = S5; }   // one more substation per two refineries
    const S7 = B.put('substation', 15, 10, { role: 'power' });   // east intake inserters + fuel brain
    B.wire(S4, COPPER, S7, COPPER);

    // ---- circuits: stock network (red) = dock + warehouse + pad + buffer tank + converters + brain + deciders ----
    B.wire(LD, C1.R, WH, C1.R); B.wire(WH, C1.R, LP, C1.R); B.wire(LP, C1.R, TANK, C1.R);
    B.wire(TANK, C1.R, D1, CIN.R);
    B.chain([D1, D2, D3, D4, A1, A2], [CIN.R]);
    B.chain([A2, AX, AZ, AA, D1b], [CIN.R]);
    if (A3) B.wire(AX, CIN.R, A3, CIN.R);
    let last = A3 || A2;
    if (A4) { B.wire(last, CIN.R, A4, CIN.R); B.wire(A4, CIN.R, D5, CIN.R); B.wire(A4, COUT.R, D2, CIN.R); last = D5; }
    B.wire(last, CIN.R, KIT, C1.R);
    B.wire(A1, COUT.R, D2, CIN.R); B.wire(A2, COUT.R, D2, CIN.R);
    if (A3) B.wire(A3, COUT.R, D2, CIN.R);
    B.wire(AX, COUT.R, D2, CIN.R); B.wire(AZ, COUT.R, D2, CIN.R); B.wire(AA, COUT.R, D2, CIN.R);
    if (ATANK) B.wire(ATANK, C1.R, WH2 || LD, C1.R);
    if (WH2) { B.wire(WH2, C1.R, LD, C1.R); B.wire(S6pending, COPPER, S3, COPPER); }
    // request network (green) = deciders' outputs + baseline capsule + route key -> AAI sender
    B.chain([D1, D1b, D2, D3, D4].concat(D5 ? [D5] : []), [COUT.G, COUT.G]);
    B.wire(D5 || D4, COUT.G, BASE, C1.G); B.wire(BASE, C1.G, SND, C1.G);
    // pad-local network (green): section / capsule gating
    B.wire(LP, C1.G, iSec, C1.G); B.chain([iSec, iCap], [C1.G]); B.wire(iSec, C1.G, iAm, C1.G); B.wire(iAm, C1.G, iPk, C1.G);

    if (c.debug) {
      const sg = (n) => sigVirt(n), L = sg('signal-L'), fluidSig = sigFluid(IT.liquid);
      const pile = Math.max(60, (R + 3) * c.packed);
      // (a) PAD STATUS on the pad's own (green) wire: its tank, its 100 sections + capsule, its free stacks. First true message wins.
      const pPad = panel(B, 11, 12, [
        { sev: 'bad', cond: [L, '<', 1], text: `NO DESTINATION: receiver dock "${nm.receiver}" not found. Build it / check its name.` },
        { sev: 'warn', cond: [fluidSig, '<', L], text: 'WAITING ON FUEL: the pad tank is below one launch. Refineries are cooking fuel items (or a supply rocket must bring more: see the request panels).' },
        { sev: 'warn', cond: [sg('se-cargo-rocket'), '<', 1], text: 'WAITING ON PAD: loading the 100 sections + capsule into the pad (see the stock panel if they are missing).' },
        { sev: 'info', cond: [sg('signal-E'), '>', 0], text: 'WAITING ON ORE: the pad is not full yet. Check the ore belts and the two warehouses.' },
        { sev: 'ok', text: 'READY: full and fuelled. If it does not launch it is WAITING ON THE RECEIVER: its dock is not empty or a rocket is still inbound.' }]);
      const la = lamp(B, 10, 12, 'bad', [L, '<', 1]);
      const lc = lamp(B, 9, 13, 'warn', [fluidSig, '<', L]);
      B.wire(LP, C1.G, pPad, C1.G); B.chain([pPad, la, lc], [C1.G]);
      // STOCK STATUS on the stock (red) network: what the outpost holds in total (items still to be refined count as fuel)
      const pStock = panel(B, 9, 12, [
        { sev: 'bad', cond: [sigItem(IT.packed), '>', pile], text: `PILE-UP: over ${pile} packed sections in stock. The stock network may be split (see the NET SPLIT panel at the dock) or the unpacker is stuck.` },
        { sev: 'warn', cond: [sigItem(IT.capsule), '<', 1], text: 'STOCK: no capsule. Waiting for a supply rocket.' },
        { sev: 'warn', cond: [sigItem(IT.section), '<', 100], text: 'STOCK: under 100 sections. Waiting for a supply rocket.' },
        { sev: 'warn', cond: [fluidSig, '<', needFuel], text: 'STOCK: fuel below the reserve. The outpost is asking Nauvis (see the request panels).' },
        { sev: 'ok', text: 'Stock within the reserve.' }]);
      const le = lamp(B, 10, 13, 'bad', [sigItem(IT.packed), '>', pile]);
      B.wire(LP, C1.R, pStock, C1.R); B.chain([pStock, le], [C1.R]);
      // (b) WHAT WE ARE WAITING FOR FROM NAUVIS: one tiny panel per request, wired to the request network
      const req = (tx, label, sig, okText) => panel(B, tx, 13, [
        { sev: 'warn', cond: [sg(sig), '>', 0], text: `[img=item/${label}] ASKING NAUVIS` }, { sev: 'ok', text: `[img=item/${label}] ${okText}` }]);
      const rF = req(11, IT.fuel, 'signal-A', 'fuel ok'), rP = req(12, IT.packed, 'signal-B', 'sections ok'), rC = req(13, IT.capsule, 'signal-C', 'capsules ok');
      B.wire(D4, COUT.G, rF, C1.G); B.chain([rF, rP, rC], [C1.G]);
      if (fl) { const rG = req(14, fl.supply === 'sulfur' ? 'sulfur' : fl.filled, 'signal-G', 'mining fluid ok'); B.wire(rC, C1.G, rG, C1.G); }
      const pCap = panel(B, 10, 14, [{ sev: 'bad', cond: [sA, '>', c.fuelItems - 1], text: `FUEL REQUEST AT THE ROCKET LIMIT (${c.fuelItems} items): raise "max fuel items" or lower the reserve; the pad cannot hold more.` }, { sev: 'ok', text: 'Fuel request fits in one rocket.' }]);
      B.wire(le, C1.R, pCap, C1.R);
      // (c) at the dock: dock contents (own network, green) and a split check (stock network, red)
      const lDock = lamp(B, -14, 12, 'warn', [sg('signal-anything'), '>', 0]);
      const pDock = panel(B, -13, 12, [
        { sev: 'warn', cond: [sg('signal-anything'), '>', 0], text: 'SUPPLY DOCK HOLDS CARGO: draining into the warehouse. If this never clears the warehouse is full and Nauvis cannot launch.' },
        { sev: 'ok', text: 'Supply dock empty.' }]);
      B.wire(LD, C1.G, lDock, C1.G); B.wire(lDock, C1.G, pDock, C1.G);
      const lSplit = lamp(B, -12, 12, 'bad', [sg('signal-B'), '<', 1]);
      const pSplit = panel(B, -11, 12, [
        { sev: 'bad', cond: [sg('signal-B'), '<', 1], text: 'NET SPLIT: the dock side cannot see the logic cluster (a red wire is missing or the KIT constant was removed). Stock and requests are wrong.' },
        { sev: 'ok', text: 'Stock network connected.' }]);
      B.wire(LD, C1.R, lSplit, C1.R); B.wire(lSplit, C1.R, pSplit, C1.R);
      // (d) ore warehouses + valves (valve net = warehouse only, green)
      const pV = panel(B, -8, 11, [
        { sev: 'info', cond: [sigItem(IT.capsule), '>', R + 1], text: `VALVE OPEN: surplus [img=item/${IT.capsule}] capsules are going home with the ore.` },
        { sev: 'info', cond: [sigItem(IT.section), '>', 100 * (R + 1)], text: `VALVE OPEN: surplus [img=item/${IT.section}] cargo sections are going home with the ore.` },
        { sev: 'info', cond: [sigItem(IT.packed), '>', c.packed * (R + 1)], text: `VALVE OPEN: surplus [img=item/${IT.packed}] packed sections are going home with the ore.` },
        { sev: 'ok', text: 'Valves closed: stock within the reserve.' }]);
      B.wire(vPak, C1.G, pV, C1.G);
      const sx = (n) => sg(n);
      const pOre = panel(B, 8, -1, [{ sev: 'info', cond: [sx('signal-E'), '>', 0], text: 'Ore: pad is filling from the two warehouses.' }, { sev: 'ok', text: 'Ore: pad full.' }]);
      B.wire(LP, C1.R, pOre, C1.R);
    }
    if (sp) addScaffold(B);

    return {
      builder: B,
      json: B.json(`2/3 ${c.planet} ${c.materialName}: launch outpost${sp ? ' (space)' : ''}`,
        `Launch outpost on ${c.planet}${sp ? ' (space: space belts, space assembler, scaffold included)' : ''}. Feed ${c.materialName} onto the belts (2 north, 2 east); each pair fills a storage warehouse that loads the pad, so mining continues while the rocket is away. ` +
        `Dock "${nm.supplyDock}" takes supply rockets; the outpost keeps ${R} launch(es) in stock and requests more over AAI channel "${nm.channel}". ` +
        `Refineries make liquid fuel${c.prodTier ? ` with ${modName(c.prodTier)} x3 (+${Math.round(c.fuelProd * 100)}% output, ${Math.round((1 - c.fuelSpeed) * 100)}% slower)` : ''}; each supply rocket carries only the fuel the stock is short. ` +
        (fl ? (sulfur ? `${fl.name} is made on site from sulfur + iron plates${fl.water === 'ice' ? ' + melted water ice' : ' + water you pipe into the stub next to the chemical plant'}, stored in the tank north-west of the dock; connect your mining drills to the pipe stub on the tank's east side. `
          : `${fl.name} arrives in barrels, is unbarrelled into the west tank and leaves through the pipe stub on its west side (connect your mining drills there); empty barrels ride home with the ore. `) : '') +
        `Connect power to any substation.`,
        [sigItem('se-rocket-launch-pad'), sigItem(mat)]),
    };
  }

  // =====================================================================================
  //  3 - Nauvis / Nauvis-orbit receiver
  // =====================================================================================
  function genReceiver(c) {
    const nm = names(c), B = new Builder();
    const bulk = c.bulk ? 'bulk-inserter' : 'fast-inserter';
    const orbit = c.dest === 'orbit';
    const belt = orbit ? 'se-space-transport-belt' : c.belt; // ordinary belts cannot be built in space
    const mat = c.materialItem;
    const LD = B.put('cargo-landing-pad', 0, 0, { role: 'ld', tags: { name: nm.receiver } });
    const WH = B.put('aai-warehouse-passive-provider', -7, 1, { role: 'wh' });
    for (let y = 1; y < 7; y++) inserter(B, bulk, -1, y, E, { filter: mat, from: LD, to: WH });
    for (let y = 0; y < 8; y++) inserter(B, bulk, 8, y, W, { filter: mat, from: LD });
    for (let y = 0; y < 12; y++) B.put(belt, 9, y, { dir: S, role: 'belt' });
    // everything that is NOT the ore (recovered rocket sections, capsule, strays) goes to an active-provider storehouse so
    // bots shuttle it into storage and the dock always drains completely (SE only launches to an empty dock)
    const PARTS = B.put('aai-storehouse-active-provider', 2, 9, { role: 'parts' });
    for (const x of [3, 4]) inserter(B, 'fast-inserter', x, 8, N, { filter: mat, blacklist: true, from: LD, to: PARTS });
    const S1 = B.put('substation', -3, -2, { role: 'power' });
    const S2 = B.put('substation', 10, 0, { role: 'power' });
    B.wire(S1, COPPER, S2, COPPER);
    if (c.debug) {
      const sg = (n) => sigVirt(n);
      const slots = 512, stack = Number(c.stack) || 50;
      const oreFull = Math.floor(slots * stack * 0.97), partsFull = 220;
      // dock: anything inside?
      const lD = lamp(B, 0, -1, 'warn', [sg('signal-anything'), '>', 0]);
      const pD = panel(B, 1, -1, [
        { sev: 'warn', cond: [sg('signal-anything'), '>', 0], text: 'DOCK HOLDS CARGO: draining. If it stays on, the ore chest / belt or the parts chest is full and the outpost cannot launch.' },
        { sev: 'ok', text: 'Dock empty: ready for the next rocket.' }]);
      B.wire(LD, C1.G, lD, C1.G); B.wire(lD, C1.G, pD, C1.G);
      // ore chest
      const lO = lamp(B, -6, 0, 'bad', [sigItem(mat), '≥', oreFull]);
      const pO = panel(B, -5, 0, [
        { sev: 'bad', cond: [sigItem(mat), '≥', oreFull], text: `ORE CHEST FULL: nothing is taking the ${c.materialName}. Outpost launches are blocked. Add requesters / consumers or empty the chest.` },
        { sev: 'ok', text: 'Ore chest has room.' }]);
      B.wire(WH, C1.G, lO, C1.G); B.wire(lO, C1.G, pO, C1.G);
      // parts storehouse (recovered sections + capsules, 1 per slot)
      const lP = lamp(B, 1, 9, 'bad', [sigItem(IT.section), '≥', partsFull]);
      const pP = panel(B, 1, 10, [
        { sev: 'bad', cond: [sigItem(IT.section), '≥', partsFull], text: 'PARTS CHEST NEARLY FULL: recovered cargo sections are not being taken away. Give your storage a place for them (they stack to 1).' },
        { sev: 'ok', text: 'Parts chest has room.' }]);
      B.wire(PARTS, C1.G, lP, C1.G); B.wire(lP, C1.G, pP, C1.G);
      const S3 = B.put('substation', 6, 9, { role: 'power' });
      B.wire(S2, COPPER, S3, COPPER);
    }
    if (orbit) {
      const seen = new Set();
      for (const e of B.e) for (let x = e.tx; x < e.tx + e.w; x++) for (let y = e.ty; y < e.ty + e.h; y++) {
        const k = x + ',' + y; if (seen.has(k)) continue; seen.add(k);
        B.tiles.push({ position: { x, y }, name: 'se-space-platform-scaffold' });
      }
    }
    return {
      builder: B,
      json: B.json(`3/3 ${c.planet} ${c.materialName}: receiver (${destLabel(c)})`,
        `Landing dock "${nm.receiver}" in ${destLabel(c)}. Ore goes to a passive-provider warehouse (bots) and onto the east belt; recovered rocket sections / capsules go to the active-provider storehouse (south). ` +
        `Keep the dock empty between rockets (SE only launches to empty docks), so the ore must be consumed.` + (orbit ? ' Build on a clear patch of orbit; scaffold tiles are included.' : ''),
        [sigItem('cargo-landing-pad'), sigItem(mat)]),
    };
  }

  // =====================================================================================
  //  validation, bill of materials, preview data
  // =====================================================================================
  const rectOf = (e) => ({ x0: e.tx, y0: e.ty, x1: e.tx + e.w, y1: e.ty + e.h });
  function validate(B) {
    const errs = [], ents = B.e;
    for (let i = 0; i < ents.length; i++) for (let j = i + 1; j < ents.length; j++) {
      const a = rectOf(ents[i]), b = rectOf(ents[j]);
      if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) errs.push(`overlap: #${ents[i].n} ${ents[i].name} x #${ents[j].n} ${ents[j].name}`);
    }
    const inside = (e, px, py) => px >= e.tx && px < e.tx + e.w && py >= e.ty && py < e.ty + e.h;
    for (const e of ents) {
      if (!/inserter$/.test(e.name)) continue;
      const reach = e.long ? 2 : 1, v = { 0: [0, -1], 4: [1, 0], 8: [0, 1], 12: [-1, 0] }[e.dir];
      const pick = [e.x + v[0] * reach, e.y + v[1] * reach], drop = [e.x - v[0] * reach, e.y - v[1] * reach];
      if (e.from && !inside(e.from, pick[0], pick[1])) errs.push(`inserter #${e.n} pickup misses ${e.from.name}`);
      if (e.to && !inside(e.to, drop[0], drop[1])) errs.push(`inserter #${e.n} drop misses ${e.to.name}`);
    }
    for (const w of B.wires) {
      const a = w[4], b = w[5], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (w[1] === COPPER) { if (d > 18) errs.push(`copper wire too long #${a.n}-#${b.n}`); continue; }
      const reach = Math.min(REACH[a.name] || 9, REACH[b.name] || 9);
      const slack = (Math.max(a.w, a.h) + Math.max(b.w, b.h)) / 2 * 0.5;
      if (d - slack > reach) errs.push(`circuit wire likely too long: ${a.name} - ${b.name}`);
    }
    const subs = ents.filter((e) => e.name === 'substation');
    for (const e of ents) {
      if (!NEEDS_POWER.has(e.name)) continue;
      const r = rectOf(e);
      if (!subs.some((s) => r.x0 < s.x + SUB_SUPPLY && r.x1 > s.x - SUB_SUPPLY && r.y0 < s.y + SUB_SUPPLY && r.y1 > s.y - SUB_SUPPLY)) errs.push(`unpowered: #${e.n} ${e.name}`);
    }
    return errs;
  }
  function bom(B) {
    const m = {};
    for (const e of B.e) m[e.name] = (m[e.name] || 0) + 1;
    if (B.tiles.length) m['se-space-platform-scaffold (tile)'] = B.tiles.length;
    return m;
  }
  function preview(B) {
    return {
      ents: B.e.map((e) => ({ n: e.n, name: e.name, tx: e.tx, ty: e.ty, w: e.w, h: e.h, dir: e.dir, role: e.role || '' })),
      wires: B.wires.filter((w) => w[1] !== COPPER).map((w) => ({ a: w[4].n, b: w[5].n, green: w[1] === 2 || w[1] === 4 })),
    };
  }

  /** Planning figures for the chosen fuel / module setup (shown in the tool). */
  function fuelPlan(cfg) {
    const c = defaults(cfg), L = c.launchFuel || 60000;
    const perSec = c.refineries * c.fuelK * c.fuelSpeed;                 // liquid fuel per second, all refineries
    return { K: c.fuelK, prod: c.fuelProd, speed: c.fuelSpeed, perSec, launchFuel: L, known: c.launchFuel > 0,
      itemsPerLaunch: Math.ceil(L / c.fuelK), secPerLaunch: L / perSec, itemsPerSec: c.refineries * c.fuelSpeed };
  }

  /** Configuration warnings the layout cannot fix on its own. */
  function warnings(cfg) {
    const c = defaults(cfg), out = [], R = c.reserve;
    if (c.debug) out.push('Debug lamps and display panels are included: red = problem, yellow = waiting / blocked, blue = information. Panels show the most important active reason.');
    const fuelSlots = Math.ceil(c.fuelItems / 10);
    const whN = fuelSlots + c.packed + c.capsules + 1 + 100;
    if (whN > 512) out.push(`Nauvis requester warehouse needs ~${whN} slots (max 512): lower max fuel items or packed sections per rocket.`);
    if (fuelSlots + c.packed + c.capsules > 470) out.push('A supply rocket would be nearly full (>470 of 500 slots).');
    if (fuelSlots + 250 > 512) out.push(`The outpost warehouse may need ~${fuelSlots + 250} slots at peak (fuel ${fuelSlots} + sections, packed and capsules in stock) but holds 512. If it fills, the supply dock cannot empty and Nauvis stops shipping: lower max fuel items.`);
    const fp = fuelPlan(c);
    if (c.prodTier) out.push(`Refinery modules: 3 x ${modName(c.prodTier)} give +${Math.round(c.fuelProd * 100)}% liquid fuel per fuel item (${c.fuelK} instead of 50) but run at ${Math.round(c.fuelSpeed * 100)}% speed${c.fuelSpeed <= 0.2001 ? ' (the game floor)' : ''}: ${c.refineries} refineries make ${Math.round(fp.perSec)} liquid fuel/s from ${(fp.itemsPerSec).toFixed(2)} fuel items/s.`);
    out.push(`${c.launchFuel ? 'This launch needs' : 'A launch of 60,000 liquid fuel (example) needs'} about ${fp.itemsPerLaunch.toLocaleString('en-US')} fuel items and ${(fp.secPerLaunch / 60).toFixed(1)} min of refining. The outpost asks Nauvis for exactly what is missing, up to ${c.fuelItems.toLocaleString('en-US')} items per rocket.`);
    if (c.launchFuel && R * c.launchFuel / c.fuelK + c.margin > c.fuelItems) out.push(`The first fill (${R} launch${R > 1 ? 'es' : ''} of fuel) takes ${Math.ceil((R * c.launchFuel / c.fuelK + c.margin) / c.fuelItems)} supply rockets; after that one rocket per launch is enough.`);
    if (c.fluid) {
      const f = c.fluid, sl = f.slots;
      if (f.supply === 'sulfur') {
        out.push(`Mining fluid: ${c.materialName} needs ${f.per} ${f.name} per unit mined, so one full ore rocket needs about ${(f.need * 10).toLocaleString('en-US')} fluid = ${f.need.toLocaleString('en-US')} sulfur + ${Math.ceil(f.need / 5).toLocaleString('en-US')} iron plates${f.kitI ? ' + ' + Math.ceil(f.need / 5).toLocaleString('en-US') + ' water ice' : ''}. Each supply rocket carries ${f.kit} sulfur, ${f.kitP} plates${f.kitI ? ', ' + f.kitI + ' ice' : ''} (${sl} slots).`);
        if (f.water === 'pipe') out.push('Acid needs 100 water per 50 acid: bring water to the pipe stub beside the chemical plant (offshore pump or your own supply). Choose "water ice" if the planet has none.');
        if (f.need > f.kit * 3) out.push(`Acid supply needs ~${Math.ceil(f.need / f.kit)} supply rockets per ore rocket; raise sulfur per supply rocket or make sulfur on the planet.`);
      } else {
        out.push(`Mining fluid: ${c.materialName} needs ${f.per} ${f.name} per unit mined, so one full ore rocket needs about ${f.need.toLocaleString('en-US')} barrels (${(f.need * 50).toLocaleString('en-US')} fluid). Each supply rocket carries ${f.kit} (${sl} slots).`);
        if (f.need > f.kit * 3) out.push(`Barrel supply needs ~${Math.ceil(f.need / f.kit)} supply rockets per ore rocket; consider making ${f.name} on the planet instead, or raise barrels per supply rocket.`);
      }
      if (fuelSlots + c.packed + c.capsules + sl > 470) out.push('Fuel + sections + mining-fluid supplies would nearly fill a supply rocket (>470 slots): lower the count.');
      if (f.supply === 'barrels' && whN + sl > 512) out.push(`Nauvis requester warehouse needs ~${whN + sl} slots with the barrels (max 512).`);
    }
    if (c.space) out.push('Space outpost: space belts, a space assembler for the unpacker, space pipes and scaffold tiles are used. Chemical plants do not work in space, so mining fluid comes as barrels. Build it on a clear patch of orbit / asteroid belt.');
    return out;
  }

  // =====================================================================================
  //  book + encoding
  // =====================================================================================
  function build(cfg) {
    const c = defaults(cfg), nm = names(c);
    const gens = [['sender', 'Nauvis supply sender', genSender], ['outpost', 'Launch outpost', genOutpost], ['receiver', `Receiver (${destLabel(c)})`, genReceiver]];
    const parts = gens.map(([key, title, fn]) => {
      const r = fn(c);
      return { key, title, json: r.json, builder: r.builder, errors: validate(r.builder), bom: bom(r.builder), preview: preview(r.builder) };
    });
    const book = {
      blueprint_book: {
        blueprints: parts.map((p, i) => ({ index: i, blueprint: p.json })),
        item: 'blueprint-book', active_index: 0, version: VERSION,
        label: `${c.planet} ${c.materialName} rocket route -> ${destLabel(c)}`,
        description: `1 Nauvis supply sender | 2 ${c.planet} launch outpost | 3 receiver. Docks: "${nm.supplyDock}", "${nm.receiver}". AAI channel "${nm.channel}".`,
        icons: [{ signal: sigItem('se-rocket-launch-pad'), index: 1 }, { signal: sigItem(c.materialItem), index: 2 }],
      },
    };
    return { cfg: c, names: nm, parts, book, warnings: warnings(c), plan: fuelPlan(c) };
  }

  // ---- encoding: "0" + base64(zlib(json)) ----
  function adler32(buf) { let a = 1, b = 0; for (let i = 0; i < buf.length; i++) { a = (a + buf[i]) % 65521; b = (b + a) % 65521; } return ((b << 16) | a) >>> 0; }
  function storedZlib(buf) { // no-compression zlib stream, used only when CompressionStream is unavailable
    const parts = [new Uint8Array([0x78, 0x01])];
    for (let i = 0; i < buf.length || i === 0; i += 65535) {
      const len = Math.min(65535, buf.length - i), last = i + len >= buf.length ? 1 : 0;
      parts.push(new Uint8Array([last, len & 255, len >> 8, ~len & 255, (~len >> 8) & 255]), buf.subarray(i, i + len));
      if (last) break;
    }
    const ad = adler32(buf);
    parts.push(new Uint8Array([ad >>> 24, (ad >>> 16) & 255, (ad >>> 8) & 255, ad & 255]));
    let n = 0; for (const p of parts) n += p.length;
    const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  function b64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function encode(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    let z;
    if (typeof process !== 'undefined' && process.versions && process.versions.node && typeof require === 'function') {
      z = require('zlib').deflateSync(Buffer.from(raw), { level: 9 });
    } else if (typeof CompressionStream !== 'undefined') {
      const cs = new CompressionStream('deflate');
      const w = cs.writable.getWriter(); w.write(raw); w.close();
      z = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    } else z = storedZlib(raw);
    return '0' + b64(z);
  }

  return { build, encode, validate, warnings, names, defaults, fuelPlan, VERSION };
});

