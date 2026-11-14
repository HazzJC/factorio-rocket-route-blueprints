# Design notes and test results

How the three blueprints work, why they are built the way they are, and what was and was not tested.
The tool is `src/tool.src.html` plus the generator `src/bpgen.js`; both are described in the README.

## What changed from v1

| | v1 | v2 |
|---|---|---|
| Fuel asked for | fixed item count | **shortfall only**: `ceil((reserve x launch fuel - stock) / K) + 80 items`, never more than one rocket carries. K = liquid per fuel item (50, or more with modules) |
| Productivity | none | pick 3 refinery modules (productivity 1-9). The blueprint requests them into the refineries. The tool shows the bonus, the speed you give up and the restock time |
| Capsules / packed sections | asked in fixed lots, surplus stayed | asked only when stock is below the reserve; **three valve inserters** send any surplus home in the next ore rocket |
| Ore path | belts straight into the pad | belts -> **two storage warehouses** (north, east) -> pad, so mining continues while a rocket is away |
| Space outpost | no | yes: space belts, space assembler, space pipes, scaffold tiles (mining fluid as barrels; chemical plants are not legal in space) |
| Refineries | 1-4 | 1-6 |
| "What is it waiting on" | one panel + a few lamps | pad panel (reads the pad's own wire), stock panel, one request panel per item, valve panel, dock / net-split panels, requester-chest panel at Nauvis, link panel |

Reading the panels: the pad panel names the first true reason in this order: no destination, waiting on fuel, waiting on pad (100 sections + capsule),
waiting on ore, ready (then it is waiting on the receiver: dock not empty or a rocket still inbound). Yellow ASKING NAUVIS panels show what is still outstanding.

## Why capsules and sections used to pile up (from the SE source, scripts/launchpad.lua and landingpad.lua)

* A dock that has a rocket in flight to it counts as not empty, so only one rocket is ever inbound per dock.
* Every landing puts **one capsule plus about `floor(100 x reusability x 0.9..1.1)` loose sections** into the destination dock.
  So each supply rocket brings its own kit. If a refill needs more than one supply rocket, every extra rocket adds a capsule and about 55 sections to the outpost
  while the outpost still uses only one set per ore launch. Fixed lots made it worse. v2 asks for lots only when stock is low and sends the surplus home through the valves.
* In a real save the bigger piles also came from other things the rig does not reproduce: receiver provider warehouses 512/512 full of ore (docks stay non-empty),
  a split stock network, and shared AAI channels carrying mall signals. v2 keeps the route key and the debug panels for those.

## Test: 90 game-minutes, 7 routes in parallel, on a copy of a real save

Run with `python test/stress.py --slot 0 --minutes 90 --speed 100 --routes A,B,C,D,E,F,G --faults D:noconsume:30:42,G:nofuel:30:42`
(headless Factorio 2.0.77 + SE 0.7.57 + the full mod set, speed x100, about 17 min wall time).
Real: launch pads, landing docks, AAI link, warehouses, all inserters, belts, combinators and the SE launch logic, **logistic robots** (25 per roboport) fetching
the sender's requests and carrying the receiver's parts, refineries with modules, the sulfur chemical plants and unbarrelling.
Fake: power (energy interfaces), Nauvis liquid fuel (tank topped up), the stock of items the Nauvis bots fetch (infinite), ore (put on the real belts by script),
ore consumers (script empties the receiver ore chest).

Routes: A moon, 3 refineries; B moon, iridium with barrels, productivity 3; C moon, 6 refineries, productivity 6, reserve 1; D space (asteroid belt), 4 refineries;
E space, 6 refineries, reserve 1; F moon, iridium with **sulfur + water ice** (chemical plants), productivity 2; G moon, productivity 9, reserve 3.
Fault injection: receiver stops consuming ore for D (12 min), Nauvis fuel supply cut for G (12 min).

Results, final generator:

* **120 ore launches and 149 supply launches** in 90 min across the routes (A 8/12, B 7/9, C 7/9, D 29/33, E 24/37, F 22/23, G 23/26 ore/supply); 985,550 ore reached the receivers.
* Warehouse stock at the outposts, sampled every 3 min (30 samples per route), **bounded, no upward trend**:
  capsules 0-5 (reserve+1 is the valve level), loose sections 0-57, packed sections 0-71 (G: reserve 3, valve at 80; others at most 59 against a valve at 60).
  No supply dock stayed blocked: 5 of 210 samples saw cargo in a dock, all draining.
* Each supply rocket carried about one launch of fuel plus the margin: A 1,820 items for a 89,856 launch (50/item), B about 1,140 for 69,633 (62/item),
  G 180-200 for 14,482 (80/item with productivity 9). Steady state is one supply rocket per ore launch where fuel is the limit (A, B, C, D); E (6 refineries, short cycle) sends extra small rockets.
  Capsules and packed sections ride only when stock is low (about 1 supply rocket in 2 carried a packed lot, only the first two carried a capsule).
* Fault runs recovered on their own: with the receiver stalled the outpost pad panel shows "ready ... waiting on the receiver" and the receiver panel "dock holds cargo";
  after the stall the launches resumed. When Nauvis lost fuel the sender kept waiting, then shipped again.
* The same rig on the **v1 design** (4 routes, 90 min): capsule stock at route A crept up (average 3.7, 4.8, 5.1 per third, max 6), packed sections reached 72 on G,
  against a flat 2.8 / 2.8 / 2.9 for v2. In this clean rig v1 does not pile up as badly as in a real save, because the receiver always consumes the ore here.

What the test found and fixed:

* The stock network counted fuel items that were not refined yet as liquid fuel, so the old "ready" message could be wrong. The pad panel now reads the pad's own wire.
* A panel that falls back to "always true" read a signal that can go negative on the stock network, so it went blank. Fixed with a constant that is always true.
* The valve lamp watched "anything" on the warehouse wire, so it was lit whenever the warehouse held anything. Now it names the item that is over its limit.
* 5-6 refineries were not all powered (a substation is now added per two refineries).
* Test rig: space needs scaffold under power interfaces and roboports; the SE launch event names the destination dock, not the pad.

## Not tested (be careful)

* Real power: energy interfaces gave unlimited power. Real power draw (refineries with modules, about 25 bulk inserters per outpost) is untested.
* The Nauvis liquid-fuel pipeline and its pressure; the rig topped the tank up. Likewise infinite sections/capsules/fuel in the Nauvis provider chest: a real supply of cargo sections is not tested.
* Real mining rates: ore arrived at belt speed, rockets filled in minutes. A route that mines slowly just launches less often.
* The receiver side after the dock: ore was deleted by script. A full ore chest blocks the route (panels show it; tested only as a 12 min stall).
* Biters on the outpost, solar flares, meteors; the outposts were on peaceful surfaces.
* Runs longer than 90 game-minutes, more than 7 routes, and the shared AAI channel case (the route key was only checked in v1 tests).
* Space outposts were tested at the Calidus asteroid belts; other space zones and clear-patch checks are up to you. Sulfur mode is planet only.

## Setup notes

1. Place the receiver, then the outpost (read "fuel required" from its launch pad window, type it into the tool, copy the book again), then the Nauvis sender.
2. Cover the Nauvis requester chest, the refinery modules and the receiver provider chests with roboports.
3. Productivity modules slow the refineries (3 x productivity 3 = 40% speed). Add refineries if the restock time shown in the tool is too long.

## The stale wire bug (found on a real save)

Symptom: a Nauvis sender loaded its rocket with about a dozen capsules, and never launched. Its request signals read in the hundreds of thousands.

Cause: the AAI signal receiver was wired directly to the launch pad's green network. That wire is in no current blueprint; it came from an earlier version of the sender that was pasted over an existing one (a paste keeps old wires).
With it, the route-key filter's output fed back into its own input and added the request again every tick, so every request signal climbed without limit. The pad then asked for thousands of capsules and loaded what the bots brought, and the launch condition (packed sections >= request) could never be met.

Reproduced in the stress rig: the earlier design with a stale wire reached B = 143,940 after 2 minutes and loaded 79 capsules with zero launches. The current sender with the same stale wire stays at B <= 20, capsules <= 2 and keeps launching.

Fix in the generator: the route filter reads green only and writes red only, and the whole pad side (decider, inserters, tank, pad) is one red network, so the filter can never read its own output. The link panel shows STALE WIRE if the receiver is joined to the pad anyway.

To repair an existing sender without rebuilding it, run this once in the game console (it only removes wires between AAI receivers and launch pads; tested on a copy of a save):

```
/c for _, s in pairs(game.surfaces) do for _, rx in pairs(s.find_entities_filtered{name="aai-signal-receiver"}) do local c = rx.get_wire_connector(defines.wire_connector_id.circuit_green, false) if c then for _, k in pairs(c.connections) do if k.target.owner.name == "se-rocket-launch-pad" then c.disconnect_from(k.target, k.origin) end end end end end
```

Once the signals are sane, a loaded pad launches at once and sends its surplus to the outpost. Outposts from the first tool version have no valves, so that surplus stays in the outpost warehouse until removed by hand.
When replacing an old sender with a new blueprint, deconstruct the old one first.

## Interface and belt rendering

* Belts in the preview are cut from the game's own sheets (`make_belts.py`) into 8-frame atlases. The preview picks the right piece per tile (straight, the eight curves, start and end rollers) from which neighbouring belts feed it, and animates them at each tier's relative speed.
* Atlas rows: 0-3 straight (E, W, N, S), 4-11 curves named `<from side>_to_<flow>`, 12-19 start/end caps, each at the end of the flow it belongs to.
* Checked: all four curve orientations on all four belt tiers in a synthetic loop, 60 animated belts on the outpost, the animation toggle, no console errors, the three blueprint tabs, orbit and space variants, a 390 px wide layout.
* Not checked: Firefox and Safari, a real touch device. The AAI storehouse has no captured sprite, so the preview reuses the warehouse sprite scaled to its footprint.
