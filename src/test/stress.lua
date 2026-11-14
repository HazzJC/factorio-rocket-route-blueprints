-- Rocket-route stress test (runs on a COPY of the save through fkit.harness).
-- Several routes in parallel: Nauvis sender -> outpost (moon / planet / space) -> receiver in Nauvis Orbit.
-- Real: launch pads, landing pads, AAI link, warehouses, inserters, belts, circuits, logistic robots + roboports.
-- Faked: power (energy interfaces), the liquid fuel pipe on Nauvis (tank topped up), the stock of items bots fetch on Nauvis,
--        ore sources (script puts ore on the real belts), ore consumers at the receiver (script empties its ore chest).
local CFG = helpers.json_to_table(require("cfg"))
local FORCE, ROUTES = nil, {}
local ST = {phase = "init", t0 = 0}
local function app(file, s) helpers.write_file(file, s .. "\n", true) end
local function jl(t) return helpers.table_to_json(t) end
local function try(f, ...) local ok, v = pcall(f, ...) if ok then return v end return nil, v end

local function prep(s, cx, cy, hw, hh, floor)
  s.request_to_generate_chunks({cx, cy}, math.ceil(math.max(hw, hh) / 32) + 2)
  s.force_generate_chunk_requests()
  local area = {{cx - hw, cy - hh}, {cx + hw, cy + hh}}
  for _, e in pairs(s.find_entities_filtered{area = area}) do if e.valid and e.type ~= "character" then e.destroy() end end
  if floor then
    local tiles = {}
    for x = math.floor(cx - hw), math.ceil(cx + hw) do for y = math.floor(cy - hh), math.ceil(cy + hh) do tiles[#tiles + 1] = {name = floor, position = {x, y}} end end
    s.set_tiles(tiles)
  end
  return area
end

local function place(s, str, cx, cy, area)
  local inv = game.create_inventory(1)
  local st = inv[1]
  local r = st.import_stack(str)
  local ghosts = st.build_blueprint{surface = s, force = FORCE, position = {cx, cy}, build_mode = defines.build_mode.forced}
  for pass = 1, 4 do
    for _, g in pairs(s.find_entities_filtered{area = area, type = {"tile-ghost"}}) do pcall(function() g.revive{raise_revive = true} end) end
    for _, g in pairs(s.find_entities_filtered{area = area, type = {"entity-ghost"}}) do pcall(function() g.revive{raise_revive = true} end) end
  end
  local left = 0
  for _ in pairs(s.find_entities_filtered{area = area, type = {"entity-ghost", "tile-ghost"}}) do left = left + 1 end
  local filled = 0
  for _, p in pairs(s.find_entities_filtered{area = area, type = "item-request-proxy"}) do
    local t = p.proxy_target
    for _, ip in pairs(p.insert_plan or {}) do
      for _, at in pairs((ip.items and ip.items.in_inventory) or {}) do
        local ok = pcall(function() t.get_inventory(at.inventory)[at.stack + 1].set_stack{name = ip.id.name, count = at.count or 1} end)
        if ok then filled = filled + 1 end
      end
    end
    p.destroy()
  end
  inv.destroy()
  return {import = r, ghosts = #ghosts, left = left, modules = filled}
end


local function floor_under(s, pos, w, h)
  local x0, y0 = math.floor(pos.x - w / 2 + 0.01), math.floor(pos.y - h / 2 + 0.01)
  local tiles = {}
  for x = x0, x0 + w - 1 do for y = y0, y0 + h - 1 do
    local t = s.get_tile(x, y)
    if t and t.name == "se-space" then tiles[#tiles + 1] = {name = "se-space-platform-scaffold", position = {x, y}} end
  end end
  if #tiles > 0 then s.set_tiles(tiles) end
end
local function mk(s, name, pos, w, h)
  floor_under(s, pos, w or 1, h or 1)
  local e = s.create_entity{name = name, position = pos, force = FORCE}
  if not e then app("samples.txt", jl{ev = "CREATE FAILED", name = name, pos = pos, surface = s.name}) end
  return e
end

local function power(s, area)
  local seen, n = {}, 0
  for _, p in pairs(s.find_entities_filtered{area = area, type = "electric-pole"}) do
    local id = p.electric_network_id or -1
    if not seen[id] then
      seen[id] = true
      for _, d in ipairs{{4, 0}, {-4, 0}, {0, 4}, {0, -4}, {6, 2}, {-6, 2}, {2, 6}, {2, -6}, {7, 7}, {-7, -7}} do
        local pos = {x = math.floor(p.position.x + d[1]) + 1, y = math.floor(p.position.y + d[2]) + 1}
        floor_under(s, pos, 2, 2)
        if s.can_place_entity{name = "electric-energy-interface", position = pos, force = FORCE} then
          local e = s.create_entity{name = "electric-energy-interface", position = pos, force = FORCE}
          if e then e.power_production = 1e9; e.electric_buffer_size = 1e12; n = n + 1; break end
        end
      end
    end
  end
  return n
end

-- bp tile coordinates -> world position, relative to an anchor entity (found by name nearest the build point)
local function anchor_of(s, area, name, cx, cy)
  local best, bd
  for _, e in pairs(s.find_entities_filtered{area = area, name = name}) do
    local d = (e.position.x - cx) ^ 2 + (e.position.y - cy) ^ 2
    if not bd or d < bd then best, bd = e, d end
  end
  return best
end
local function at(a, atx, aty, aw, ah, tx, ty, w, h) return {x = a.position.x + (tx + w / 2) - (atx + aw / 2), y = a.position.y + (ty + h / 2) - (aty + ah / 2)} end
local function find(s, name, pos) return s.find_entities_filtered{name = name, position = pos, radius = 0.6}[1] end

local function rig(s, a, atx, aty, aw, ah, kind)
  -- roboport + bots + substation + power, near an anchor; returns the objects
  local rp = mk(s, "roboport", at(a, atx, aty, aw, ah, -20, -6, 4, 4), 4, 4)
  local sub = mk(s, "substation", at(a, atx, aty, aw, ah, -15, -6, 2, 2), 2, 2)
  local eei = mk(s, "electric-energy-interface", at(a, atx, aty, aw, ah, -15, -3, 2, 2), 2, 2)
  if eei then eei.power_production = 1e9; eei.electric_buffer_size = 1e12 end
  if rp then rp.get_inventory(defines.inventory.roboport_robot).insert{name = "logistic-robot", count = CFG.bots} end
  local o = {rp = rp, sub = sub}
  if kind == "sender" then
    o.prov = mk(s, "aai-warehouse-passive-provider", at(a, atx, aty, aw, ah, -20, 0, 6, 6), 6, 6)
    o.prov2 = mk(s, "aai-warehouse-passive-provider", at(a, atx, aty, aw, ah, -27, 0, 6, 6), 6, 6)
    o.prov3 = mk(s, "aai-warehouse-passive-provider", at(a, atx, aty, aw, ah, -34, 0, 6, 6), 6, 6)
  else
    o.store = mk(s, "storage-chest", at(a, atx, aty, aw, ah, -20, 0, 1, 1), 1, 1)
    o.store2 = mk(s, "storage-chest", at(a, atx, aty, aw, ah, -19, 0, 1, 1), 1, 1)
  end
  return o
end

local function setup()
  FORCE = game.forces.player
  game.speed = CFG.speed
  helpers.write_file("samples.txt", "", false)
  for i, rc in ipairs(CFG.routes) do
    local R = {cfg = rc, id = rc.id, launches = 0, supply_launches = 0, returned = {}, voided = 0, cmax = {}}
    ROUTES[i] = R
    local ss, os_, rs = game.surfaces[rc.sender.surface], game.surfaces[rc.outpost.surface], game.surfaces[rc.recv.surface]
    if not (ss and os_ and rs) then error("missing surface for " .. rc.id) end
    for _, sf in pairs({ss, os_, rs}) do sf.peaceful_mode = true end
    local floorO = (not rc.space) and CFG.floor or nil
    -- sender (Nauvis)
    local a1 = prep(ss, rc.sender.x, rc.sender.y, 40, 40, CFG.floor)
    R.send_place = place(ss, rc.strings.sender, rc.sender.x, rc.sender.y, a1)
    R.sa = anchor_of(ss, a1, "se-rocket-launch-pad", rc.sender.x, rc.sender.y)
    R.send_power = power(ss, a1)
    for _, sid in ipairs(CFG.stale or {}) do
      if sid == rc.id then -- reproduce a pasted-over old sender: a stale green wire from the AAI receiver to the pad
        local rx = ss.find_entities_filtered{name = "aai-signal-receiver", area = a1}[1]
        local g = defines.wire_connector_id.circuit_green
        local ok = rx and R.sa and rx.get_wire_connector(g, true).connect_to(R.sa.get_wire_connector(g, true), false, defines.wire_origin.player)
        app("samples.txt", jl{ev = "stale-wire", id = rc.id, ok = ok and true or false})
      end
    end
    R.send_rig = rig(ss, R.sa, 0, 0, 10, 10, "sender")
    -- outpost
    local a2 = prep(os_, rc.outpost.x, rc.outpost.y, 48, 48, floorO)
    R.out_place = place(os_, rc.strings.outpost, rc.outpost.x, rc.outpost.y, a2)
    R.oa = anchor_of(os_, a2, "se-rocket-launch-pad", rc.outpost.x, rc.outpost.y)
    R.out_power = power(os_, a2)
    do local c = {} for _, e in pairs(os_.find_entities_filtered{area = a2}) do c[e.name] = (c[e.name] or 0) + 1 end R.out_counts = c end
    -- receiver (orbit)
    local a3 = prep(rs, rc.recv.x, rc.recv.y, 40, 40, nil)
    R.recv_place = place(rs, rc.strings.receiver, rc.recv.x, rc.recv.y, a3)
    R.ra = anchor_of(rs, a3, "cargo-landing-pad", rc.recv.x, rc.recv.y)
    R.recv_power = power(rs, a3)
    R.recv_rig = rig(rs, R.ra, 0, 0, 8, 8, "recv")
    R.ss, R.os, R.rs = ss, os_, rs
    -- handles
    local oa = R.oa
    local function o(name, tx, ty, w, h) return find(os_, name, at(oa, 0, 0, 10, 10, tx, ty, w, h)) end
    R.o = {lp = oa, wh = o("aai-warehouse", -7, 4, 6, 6), wha = o("aai-warehouse", 2, -7, 6, 6), whb = o("aai-warehouse", 11, 2, 6, 6),
      dock = o("cargo-landing-pad", -16, 4, 8, 8), tank = o("zith-storage-tank-5x5", 4, 10, 5, 5),
      panel = o("display-panel", 9, 12, 1, 1), ppad = o("display-panel", 11, 12, 1, 1), pcap = o("display-panel", 10, 14, 1, 1), pvalve = o("display-panel", -8, 11, 1, 1),
      pf = o("display-panel", 11, 13, 1, 1), pp = o("display-panel", 12, 13, 1, 1), pc = o("display-panel", 13, 13, 1, 1), pdock = o("display-panel", -13, 12, 1, 1), psplit = o("display-panel", -11, 12, 1, 1)}
    R.o.refs = os_.find_entities_filtered{name = {"se-fuel-refinery", "se-fuel-refinery-spaced"}, area = a2}
    local sa = R.sa
    R.s = {lp = sa, wh = find(ss, "aai-warehouse-requester", at(sa, 0, 0, 10, 10, -7, 4, 6, 6)), tank = find(ss, "zith-storage-tank-5x5", at(sa, 0, 0, 10, 10, 4, 10, 5, 5)),
      panel = find(ss, "display-panel", at(sa, 0, 0, 10, 10, 9, -1, 1, 1)), pchest = find(ss, "display-panel", at(sa, 0, 0, 10, 10, -9, 5, 1, 1)), plink = find(ss, "display-panel", at(sa, 0, 0, 10, 10, 10, 7, 1, 1))}
    local ra = R.ra
    R.r = {dock = ra, wh = find(rs, "aai-warehouse-passive-provider", at(ra, 0, 0, 8, 8, -7, 1, 6, 6)), parts = find(rs, "aai-storehouse-active-provider", at(ra, 0, 0, 8, 8, 2, 9, 4, 4)),
      panel = find(rs, "display-panel", at(ra, 0, 0, 8, 8, 1, -1, 1, 1))}
    -- ore belt "faucets": the real belts of the outpost (north y=-9/-10 flow east, east x=18/19 flow north)
    R.belts = {}
    for _, b in pairs(os_.find_entities_filtered{area = a2, type = "transport-belt"}) do
      local rx, ry = b.position.x - oa.position.x, b.position.y - oa.position.y
      if CFG.legacy then
        if (ry < -6 and ry > -8 and math.abs(rx) < 5) or (rx > 6 and rx < 8 and math.abs(ry) < 5) then R.belts[#R.belts + 1] = b end
      elseif (ry < -13 and ry > -15 and math.abs(rx) < 5) or (rx > 13 and rx < 15 and math.abs(ry) < 5) then R.belts[#R.belts + 1] = b end
    end
    for _, b in pairs(os_.find_entities_filtered{area = a2, type = "underground-belt"}) do end
    app("samples.txt", jl{ev = "placed", id = rc.id, send = R.send_place, out = R.out_place, recv = R.recv_place, power = {R.send_power, R.out_power, R.recv_power},
      pads = {s = R.sa and R.sa.position, o = R.oa and R.oa.position, r = R.ra and R.ra.position}, belts = #R.belts, refineries = #R.o.refs,
      counts = R.out_counts, found = {sender_wh = R.s.wh ~= nil, out_wh = R.o.wh ~= nil, wha = R.o.wha ~= nil, whb = R.o.whb ~= nil, dock = R.o.dock ~= nil, tank = R.o.tank ~= nil, panel = R.o.panel ~= nil,
        recv_wh = R.r.wh ~= nil, parts = R.r.parts ~= nil, prov = R.send_rig.prov ~= nil, rp = R.send_rig.rp ~= nil}})
  end
  ST.phase = "run"; ST.t0 = game.tick
end

local function fault(R, kind)
  for _, f in ipairs(CFG.faults or {}) do
    if f.id == R.id and f.kind == kind then
      local m = (game.tick - ST.t0) / 3600
      if m >= f.from and m < f.to then return true end
    end
  end
  return false
end

local function feed(R)
  local rc = R.cfg
  -- infinite Nauvis side: liquid fuel in the sender tank, items in the bot provider chest
  local st = R.s.tank
  if st and st.valid and not fault(R, "nofuel") then st.fluidbox[1] = {name = "se-liquid-rocket-fuel", amount = 149000} end
  local function topup(prov, list)
    if not (prov and prov.valid) then return end
    for name, target in pairs(list) do
      local have = prov.get_item_count(name)
      if have < target then prov.insert{name = name, count = target - have} end
    end
  end
  topup(R.send_rig.prov, CFG.stock1)
  local s2 = {}
  for k, v in pairs(CFG.stock2) do s2[k] = v end
  topup(R.send_rig.prov2, s2)
  local s3 = {}
  if rc.fluid_item then s3[rc.fluid_item] = 600 end
  for _, n in pairs(rc.extra_items or {}) do s3[n[1]] = n[2] end
  topup(R.send_rig.prov3, s3)
  -- ore on the real belts (keep the belts saturated: lanes top up when they have room)
  for _, b in pairs(R.belts) do
    if b.valid then
      for lane = 1, 2 do
        local tl = b.get_transport_line(lane)
        if #tl < 3 and tl.can_insert_at_back() then tl.insert_at_back{name = rc.ore, count = 4} end
      end
    end
  end
end

local function consume(R)
  -- receiver side: ore consumers (script) + void/count the parts the bots carried to the storage chests
  local rc = R.cfg
  local wh = R.r.wh
  if wh and wh.valid and not fault(R, "noconsume") then
    local n = wh.get_item_count(rc.ore)
    if n > 0 then wh.remove_item{name = rc.ore, count = n}; R.consumed = (R.consumed or 0) + n end
  end
  for _, c in pairs({R.recv_rig.store, R.recv_rig.store2}) do
    if c and c.valid then
      local inv = c.get_inventory(defines.inventory.chest)
      for _, it in pairs(inv.get_contents()) do R.returned[it.name] = (R.returned[it.name] or 0) + it.count end
      inv.clear()
    end
  end
end

local function txt(e) if e and e.valid then return e.display_panel_text end end
local function fl(e, name) if e and e.valid then return math.floor(e.get_fluid_count(name)) end end
local function cnt(e, n) if e and e.valid then return e.get_item_count(n) end end

local function sample(final)
  local t = (game.tick - ST.t0) / 3600
  for _, R in ipairs(ROUTES) do
    local o, s, r, rc = R.o, R.s, R.r, R.cfg
    local rec = {alive = o.lp and o.lp.valid, ev = final and "final" or "sample", min = math.floor(t * 10) / 10, id = R.id, launches = R.launches, supply = R.supply_launches, consumed = R.consumed or 0,
      wh = {cap = cnt(o.wh, "se-space-capsule"), sec = cnt(o.wh, "se-cargo-rocket-section"), pk = cnt(o.wh, "se-cargo-rocket-section-packed"), fuel = cnt(o.wh, "rocket-fuel"), bar = rc.fluid_filled and cnt(o.wh, rc.fluid_filled) or nil},
      pad = {ore = cnt(o.lp, rc.ore), cap = cnt(o.lp, "se-space-capsule"), sec = cnt(o.lp, "se-cargo-rocket-section"), pk = cnt(o.lp, "se-cargo-rocket-section-packed"), stacks = nil},
      whab = {a = cnt(o.wha, rc.ore), b = cnt(o.whb, rc.ore)},
      dock = {cap = cnt(o.dock, "se-space-capsule"), sec = cnt(o.dock, "se-cargo-rocket-section"), pk = cnt(o.dock, "se-cargo-rocket-section-packed"), fuel = cnt(o.dock, "rocket-fuel")},
      liquid = {tank = fl(o.tank, "se-liquid-rocket-fuel")},
      spad = {cap = cnt(s.lp, "se-space-capsule"), sec = cnt(s.lp, "se-cargo-rocket-section"), pk = cnt(s.lp, "se-cargo-rocket-section-packed"), fuel = cnt(s.lp, "rocket-fuel"), chest_fuel = cnt(s.wh, "rocket-fuel")},
      recv = {ore = cnt(r.wh, rc.ore), dock = r.dock and r.dock.valid and #r.dock.get_inventory(defines.inventory.chest).get_contents() or nil, parts_cap = cnt(r.parts, "se-space-capsule"), parts_sec = cnt(r.parts, "se-cargo-rocket-section"), parts_pk = cnt(r.parts, "se-cargo-rocket-section-packed")},
      sig = try(function()
        local r, g = defines.wire_connector_id.circuit_red, defines.wire_connector_id.circuit_green
        local F = {type = "fluid", name = "se-liquid-rocket-fuel"}
        local Lq = {type = "virtual", name = "signal-L"}
        local E = {type = "virtual", name = "signal-E"}
        local C = {type = "virtual", name = "se-cargo-rocket"}
        return {Fr = o.lp.get_signal(F, r), Fg = o.lp.get_signal(F, g), Lr = o.lp.get_signal(Lq, r), Lg = o.lp.get_signal(Lq, g), Er = o.lp.get_signal(E, r), Eg = o.lp.get_signal(E, g), Cr = o.lp.get_signal(C, r), Cg = o.lp.get_signal(C, g)}
      end),
      req = try(function()
        local r, g = defines.wire_connector_id.circuit_red, defines.wire_connector_id.circuit_green
        local function v(n, w) return o.lp and 0 end
        local S = s.lp
        local function sg(n, w) return S.get_signal({type = "virtual", name = n}, w) end
        return {Br = sg("signal-B", r), Bg = sg("signal-B", g), Cr = sg("signal-C", r), Cg = sg("signal-C", g), Dr = sg("signal-D", r), Dg = sg("signal-D", g), Ar = sg("signal-A", r), Ag = sg("signal-A", g),
          cap = S.get_item_count("se-space-capsule"), pk = S.get_item_count("se-cargo-rocket-section-packed")}
      end),
      L = try(function() return o.lp.get_signal({type = "virtual", name = "signal-L"}, defines.wire_connector_id.circuit_red) end),
      returned = R.returned}
    app("samples.txt", jl(rec))
    local p = {ev = "panels", min = rec.min, id = R.id, out = txt(o.panel), pad = txt(o.ppad), cap = txt(o.pcap), valve = txt(o.pvalve), f = txt(o.pf), p = txt(o.pp), c = txt(o.pc), dock = txt(o.pdock), split = txt(o.psplit),
      send = txt(s.panel), chest = txt(s.pchest), link = txt(s.plink), recv = txt(r.panel)}
    app("samples.txt", jl(p))
  end
end

local function on_launch(ev)
  local d = ev or {}
  local nm = nil
  if not ST.keys then ST.keys = true
    local ks, k2 = {}, {}
    for k in pairs(d) do ks[#ks + 1] = k end
    if type(lp) == "table" then for k in pairs(lp) do k2[#k2 + 1] = k end end
    app("samples.txt", jl{ev = "launch-event-keys", keys = ks, lpkeys = k2, name = nm, contents = d.launched_contents})
  end
  for _, R in ipairs(ROUTES) do
    local c = R.cfg
    local m = (game.tick - ST.t0) / 3600
    local dest = d.landing_pad_name
    if dest == c.names.receiver then R.launches = R.launches + 1; app("samples.txt", jl{ev = "launch", kind = "ore", id = R.id, min = m, contents = d.launched_contents})
    elseif dest == c.names.supplyDock then R.supply_launches = R.supply_launches + 1; app("samples.txt", jl{ev = "launch", kind = "supply", id = R.id, min = m, contents = d.launched_contents}) end
  end
end

script.on_init(function() end)
local registered = false
script.on_event(defines.events.on_tick, function(ev)
  if ev.tick < 5 then return end
  if ST.phase == "init" then
    ST.phase = "busy"
    local ok, err = pcall(setup)
    if not ok then app("samples.txt", jl{ev = "SETUP ERROR", err = tostring(err)}); helpers.write_file("result.txt", "SETUP ERROR " .. tostring(err) .. "\n#END\n", false); ST.phase = "dead"; return end
    local eid = remote.call("space-exploration", "get_on_cargo_rocket_launched_event")
    script.on_event(eid, on_launch)
    return
  end
  if ST.phase ~= "run" then return end
  local dt = ev.tick - ST.t0
  if dt % 30 == 0 then for _, R in ipairs(ROUTES) do (function() local ok, err = pcall(feed, R) if not ok then app('samples.txt', jl{ev = 'FEED ERROR', err = tostring(err)}) end end)() end end
  if dt % 120 == 60 then for _, R in ipairs(ROUTES) do (function() local ok, err = pcall(consume, R) if not ok then app('samples.txt', jl{ev = 'CONSUME ERROR', err = tostring(err)}) end end)() end end
  if dt % CFG.sample == 0 and dt > 0 then
    local ok, err = pcall(sample, false)
    if not ok then app("samples.txt", jl{ev = "SAMPLE ERROR", err = tostring(err)}) end
    helpers.write_file("progress.txt", string.format("min %.1f", dt / 3600), false)
  end
  if dt >= CFG.ticks then
    pcall(sample, true)
    local tot = {}
    for _, R in ipairs(ROUTES) do tot[#tot + 1] = {id = R.id, launches = R.launches, supply = R.supply_launches, returned = R.returned, consumed = R.consumed} end
    helpers.write_file("result.txt", jl{ev = "done", ticks = dt, routes = tot} .. "\n#END\n", false)
    ST.phase = "done"
  end
end)
