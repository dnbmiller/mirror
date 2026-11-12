# Skybucket design notes

This document records how Skybucket came together and how it works. It covers the original pitch, a summary of the design conversation that shaped it, and a reference for every system and map with its tuning values. `README.md` is the short player-facing guide. This is the longer version for anyone changing the game.

## The pitch

> A 3D / 2.5D physics sim game where the gameplay is a platform with jets on both sides that fly the platform. Like the old crate-carrying games, but instead of a crate there is a bucket used to collect stuff and fly it back home.

The result is a browser game with no build step (`index.html` + `engine.js` + `scenery.js` + one file per level in `levels/`, Three.js r128 from cdnjs). A twin-jet lift platform with an open bucket catches ore thrown up by vents, carries it home without spilling, and lands on a pad to cash it in. Physics are 2D in the play plane and the rendering is 3D, which gives the 2.5D look.

## How the design evolved

The game was built up in short rounds. Each round was one request, then implementation, then headless testing, then a commit. In order:

1. **First build.** A bucket fixed on top of a platform can't scoop ore off the ground, so ore comes from **vents** that erupt it into the air and you catch it. That decision set the core loop. The first build had one map (Badlands, five vents), three ore types, fuel, hull, three ships, delivery quotas ("shifts"), wind from shift 2, a minimap, synthesised audio and touch controls.
2. **Swap the thruster buttons.** Left arrow now fires the left jet and right fires the right ("Direct" scheme, the default). The original lean-to-steer mapping stays behind `C`.
3. **Delivery only took one piece, and there was no sense of how full the bucket was.** Cause: while landed, the landing-leg contact flickered between physics steps, which kept resetting the "settled" timer. One piece got through at 60 fps and none at 120 Hz. Fix: feet count as planted for 0.15 s after their last contact, and the whole bucket unloads at once. Bucket value and load gauges were added, and a zoom slider went on the setup screen.
4. **Phone HUD too big.** On narrow screens, the shift and bucket panels merge into one bar (shift in the left third, bucket in the right two-thirds). The home pointer is dropped there and wind moves into the shift section.
5. **Remove the floating tag over the bucket.** It added nothing and got in the way. The HUD gauges carry that information, and a one-time chime plays when the load covers the quota.
6. **Zoom, a cave map, map select, back-to-setup.** The old farthest zoom became the new 100%, with a 50–150% range. **The Long Cave** was added. Maps became data (`MAPS`), selectable on the setup screen. A ❚❚ pause button gives a way back to setup mid-run.
7. **Lava in the cave.** Pools fill the floor's dips, cracks in the roof drip blobs, and lava does triple damage.
8. **Easter egg.** A drip caught on gold forges it, doubling its value at the same weight.
9. **Dry Springs.** Water from a pipe by the pad must be carried out and poured into a dry vent to make it erupt.
10. **Falling Doors.** A mineshaft whose ceiling doors slam shut in sequence once you're inside. The exit opens when the bucket holds enough ore. The timing was tightened twice at the designer's request: from 3.4 s apart to 0.8 s, then to "start at 2 s, 0.5 s apart" to make it properly tricky.
11. **The Water Wheel.** A paddle wheel blocks a cave. You fly in a bay between paddles to get through, the stream that turns it also supplies water, and pushing a paddle speeds it up. It was then enlarged to 40 m with the entrance at about 8 o'clock.
12. **Flip upright.** It's easy to end up stuck on your back, so a pause-screen button (and the `F` key) sets the platform level in the nearest clear spot.
13. **Flip on F, and this document.**
14. **Gale.** A basic map whose gale is a headwind both ways. The wind's direction follows the leg of the trip (out or home), not the platform's instantaneous motion, so it reads as weather turning rather than a drag force.
15. **Tumbleweeds, and levels as separate files.** Gale got tumbleweeds that blow through on the wind and can snag on the bucket. The code was restructured so each level is its own file, independent except for the shared engine (settings, physics, rendering, HUD and shared features). See "Level architecture" below.
16. **Squalls.** Rain in squalls, using the same physical droplets as Dry Springs, over a landscape with more outcrops to shelter under. The rain drips off the rock and soaks into the ground. This was the first level built entirely on the new level structure. It needed only three small engine additions: `setSkyShade`, `spawnWater` in the kit, and a per-map `soak` time.
17. **Scenery.** A review of what making the levels more beautiful would cost led to four steps: per-level themes, detailed rock textures with edge dressing, painted backdrops, and craggy visible outlines. Post-processing effects such as glow were skipped as too costly for phones. All four were built in a new `scenery.js`, and each level got its own environment.

### Decisions made along the way

These are judgement calls taken during the rounds above, with the reason for each:

- **Delivery unloads everything at once.** This avoids any dependence on frame rate or on sitting perfectly still.
- **"Triple damage" needed a base for gentle contact.** Touching rock gently does no damage, so lava has its own burn rate (12/s × 3) as well as tripling crash damage and drip hits.
- **Lava-forged gold only doubles once per piece.** This prevents stacking. A drip that lands on gold is absorbed, so it shields the platform.
- **Water is physical.** It's made of near-frictionless droplets that slosh, spill, add weight and soak into the ground. Pad unloading takes ore only, so leftover water stays in the bucket.
- **Falling Doors never softlocks.** A door that shuts ahead of you holds the rest of the chain, lifts after 6 s, and drops behind you once you're through. The first door seals the entrance behind you, so the way home is an exit shaft.
- **The water wheel needs active flying.** A platform sitting in a bay with the jets off wedges in and gets turned upside down. That's intended: you fly the bay, the wheel doesn't carry a passenger. At 40 m the wheel went to eight paddles, because six left 60° bays big enough to drift through. It also got double the inertia, so a push still adds about a third rather than doubling its speed.
- **The wheel entrance needed widening and a ledge.** A 40° entrance gave only a fraction of a second when a bay lined up, so it was widened to 60° (about 7 to 9 o'clock). The alcove floor first sloped into the paddles and ground up any platform waiting there, so it now has a flat ledge.
- **Flip upright avoids lava.** It never leaves you in, beside or above a lava pool, because an upright platform that just slides back in isn't recovered.
- **The gale turns on cargo, not on direction of travel.** Ore aboard means you're heading home, so the wind swings to blow from home. It swings back on delivery, on respawn, or after 4 s with an empty bucket (so a spilled load means a headwind back out to the vents). The turn passes through calm over about 2.4 s and is announced. Testing showed light and medium loads get home even at the strongest gale. Near the weight limit it's marginal, because hovering a near-full bucket leaves only about 55 N for a headwind. That trade-off was kept.
- **Wind speed shows as knots ×10 of push strength.** Badlands now tops out around 26 kn, and the gale runs about 30–50 kn, which reads as gale force.
- **Tumbleweeds snag by position, not exact contact.** The first rule only snagged on a contact with the bucket itself. But the jet pods stick out past the bucket, so a tumbleweed arriving side-on clipped the pod corner and hopped over the bucket, and snags almost never happened. Now any hit from above deck level tangles in the bucket, pod tops and struts. A hit from below (underside, legs) bounces off with a real impulse exchange. A snagged weed adds 0.5 kg and `sail` × wind of push. Measured: one weed raised a hovering platform's 2 s downwind drift from 4.0 m to 6.6 m. Up to three can snag. Tipping past about 70° or spinning faster than 2.4 rad/s throws them off, and the ground crew clears them at the pad.
- **Levels are separate files with hooks.** Mechanics used to be wired into the shared loops with `if (MAP.lava)`-style checks, so every new level grew the core. Now the engine only knows a fixed set of hooks. Moving collision pieces carry a small `body` interface (`velAt`, `impulse`, `touch`), so the engine handles doors and wheels without knowing what they are. Shared features that more than one level uses (water and pipes, dry vents, cave backdrops) stay in the engine as data-driven options. The restructure was checked by rerunning every earlier test, and all the numbers came out identical (lava damage, door timings, wheel run, gale trips with tumbleweeds off).
- **Rain is physical only where it matters.** Rain across the whole view would be far too many bodies to simulate. So the visible rain is cheap line streaks, each of which stops at the first rock below it. Only drops in an 18 m column around the platform are real water, at up to 24 drops/s in a full squall (plus 4 per shift, capped at 40, with at most 110 drops at once). A drop only spawns where there's open sky straight above it, so sheltering under rock really keeps the bucket dry. Water lingers 1.2 s before soaking in here (`soak`), long enough for it to run off the sloped rock tops and drip off the edges. Measured: 6 s of a squall in the open put 18 drops (2.2 kg) in the bucket. Under a cap it put in none.
- **Scenery is generated, not shipped.** Textures and backdrops are painted in code: tileable value noise for the rock strata, grain, cracks and bump maps, and canvas painting for the backdrops. This keeps the download at a few hundred KB, keeps opening the page from disk working (browsers refuse image files there), and avoids art licensing. A level's first load takes about 0.12 s on desktop and 0.05 s on the phone path, and repeat visits are instant from the cache. A theme can still point its backdrop at a real image for hand-painted art.
- **Visuals may not mislead the physics.** The visible rock outline only wanders up to 0.3 m inside the collision outline (0.1 m outside), and stays exact on the pad and around vents. Tall props only grow behind the flight line (z < −2.6), so they never hide the platform. Low grass is allowed along the front edge, where it frames the surface you fly along.
- **Fixed while adding scenery: mine doors stuck out of the hill.** With the new textures, a dark slab became visible on the hilltop above the mine entrance. It was the entrance door, which since Falling Doors was built had been taller than the rock above it, so its top (and collision) stood 6 m out of the hill. Three other doors also poked out by up to 0.7 m. Each door's hidden length is now worked out from the rock thickness above it. The entrance door and its trigger moved 18 m in, to where the rock is thick enough. The start delay for the doors ahead went from 2 s to 1 s to keep the race exactly as tight: in testing, 10–12 m/s entries are still crushed, 14 m/s clears every door, and 18 m/s still hits the ramp.

## Core game

### Loop

Fly out from the home pad, catch ore from a vent in the bucket, fly back without spilling, and land gently on the pad. The bucket unloads, the tank refuels at 28/s and the hull repairs at 6/s. Delivered credits (cr) fill the shift quota. Meeting it starts the next shift with a higher quota, and on Badlands stronger wind. You have three ships. Hull at 0, or running dry away from the pad, costs one ship.

### The platform

| Property | Value | Notes |
| --- | --- | --- |
| Mass, moment of inertia | 8 kg, 42 kg·m² | `SHIP_M`, `SHIP_I` |
| Thrust per jet | 85 N, 2.8 m off-centre | `THRUST`, `JET_X` |
| Payload at hover | about 9.3 kg | `MAX_PAYLOAD = 2·THRUST/g − SHIP_M`; the HUD load bar |
| Fuel burn | 1.05 per jet-second at full | `BURN`; tank size is per map |
| Gyro assist | up to 48 N·m levelling torque | toggled with `G`; weaker than one jet, so it never fights you hard |
| Crash damage | above 3.5 m/s on the hull (×11), above 5.5 m/s on the feet (×8) | landing legs soak more |

**Controls**

| Input | Action |
| --- | --- |
| `←` / `A` | Left jet (Direct scheme, the default). In the Steer scheme it leans left instead. |
| `→` / `D` | Right jet (Direct). In Steer it leans right. |
| `↑` / `W` / `Space`, or both arrows | Both jets |
| `-` / `=` / mouse wheel | Zoom (50–150%) |
| `F` | Flip upright |
| `G` | Gyro assist |
| `C` | Swap control scheme |
| `M` | Mute |
| `P` / `Esc` / ❚❚ | Pause |

On touch screens, two thumb pads (L and R) appear only while flying.

### Cargo

| Type | Radius | Mass | Value | Notes |
| --- | --- | --- | --- | --- |
| Gem | 0.26 m | 0.45 kg | 10 cr | |
| Crystal | 0.34 m | 1.0 kg | 25 cr | |
| Gold | 0.42 m | 2.2 kg | 60 cr | 120 cr once lava-forged |
| Water | 0.20 m | 0.12 kg | 0 | friction 0.03, so it sloshes and pours |

Ore left resting on the ground crumbles after 5 s. Water soaks in after 0.5 s. At most 46 ore pieces and 70 water drops exist at once.

### HUD and screens

- **Corner meters:** fuel and hull.
- **Shift panel:** the quota bar.
- **Ships panel:** remaining ships, the ❚❚ pause button and the minimap. The minimap shows terrain, vents (blue when a dry vent is primed), ore, lava pools and closed doors.
- **Bucket panel:** piece and water count, value against what's left of the quota (turns green when covered), and load against lift capacity (turns red above 85%), plus the home direction and wind.
- **Phone layout:** at 760 px wide or less, the shift and bucket panels merge into one compact bar.
- **Setup screen:** map choice, zoom slider, Launch, controls scheme, gyro and sound, plus the controls reference.
- **Pause screen:** Resume, Flip upright (F), and Back to setup.
- **Saved settings:** map choice, zoom, controls, gyro, sound and the best score for each map are saved in `localStorage`.

### Camera

The camera follows the platform with look-ahead in the direction of travel. Its distance is `(32 + speed term) × 2 / zoom` m, where zoom 1 is the default. Shadow extents and fog distances follow the camera distance. The camera cuts instead of sweeping when you respawn or teleport.

### Flip upright

The flip sets the platform level and stops all motion. It searches rings out to 16 m (straight up first, then to either side) for a spot where the hull overlaps no rock (point-in-polygon), no segment and no door or paddle edge. It settles that spot down onto the surface below and rejects anything beside or over lava. Then play resumes.

## Maps

All maps share the home pad at x = 0. Each map is one entry in `MAPS`:

- `ground`: the polygon whose top edge is the surface.
- `solids`: extra rock, such as floating islands or a roof that overhangs a cave.
- `vents`
- `quotas` and `quotaStep`
- `fuel`, `wind` and `sun`
- optional feature blocks: `cave`, `lava`, `pipe`, `doors`, `wheel`

| Map | Tank | Wind | First quota | Feature |
| --- | --- | --- | --- | --- |
| Badlands | 120 | from shift 2 | 150 | Five vents; richer ore farther out |
| The Long Cave | 260 | none | 180 | 280 m tunnel, one rich vent at the end, lava |
| Dry Springs | 140 | light, from shift 2 | 120 | Carry water from a pipe to a dry vent |
| Falling Doors | 180 | none | 100 | Timed door gauntlet, gated exit |
| The Water Wheel | 170 | none | 120 | Ride a 40 m wheel into the cave; water from its stream |
| Gale | 170 | gale, always a headwind | 120 | Wind turns when you pick up ore; tumbleweeds snag on the bucket |
| Squalls | 150 | none | 120 | Rain squalls fill the bucket; shelter under outcrops |

### Badlands

Open hills with floating rocks. Vents at x = 46, 96.5, 154, 213 and 268, with the ore mix shifting from mostly gems to mostly gold the farther out they are. Wind gust strength grows each shift and pushes both the platform and loose cargo.

### The Long Cave

A tunnel from x = 26 to 312 under a roof solid, with outcrops hanging to about 12 m above the floor (the tightest gap is 11.6 m). A single vent at x = 285 throws mostly crystals and gold.

**Lava** (`LAVA_MULT = 3`):

- **Pools:** four pools fill the floor's dips (around x = 44, 92, 148 and 214).
- **Cracks:** nine roof cracks each swell a glowing bead for 1.1 s, then drop a drip every 4–9 s while you're within 45 m.
- **Damage:** a crash on a lava floor does 3× normal damage. A drip hit does 8 × 3 = 24. Touching a pool burns 12 × 3 = 36 hull per second.
- **Ore:** ore that touches lava melts.
- **Easter egg:** a drip that lands on gold is absorbed and forges it (`forgeGold`).

### Dry Springs

A water tower by the pad pours 10 drops a second from a pipe at x = 16. The only vent (x = 150, in a basin) is `dry`: it drinks water poured within 3.2 m of it. Every 10 drops buys one eruption, and it stores up to 40. Its crater shades from dusty brown to blue as it fills.

### Falling Doors

A ramp leads into a 12 m tall shaft under a roof solid. Doors sit at x = 74, 85, 105, 125 and 145 (`doors`):

- **The trap:** passing x = 80 seals door 0 behind you.
- **The sequence:** the doors ahead start falling 1 s later, 0.5 s apart. Each shakes and drops dust for 0.7 s first, then falls at 1.6 g.
- **Crushing:** a door that lands on the platform crushes it once (at least 10 damage, scaling with the door's speed), then rests on it until it slides out. Ore under a door is crushed.
- **Jams:** a door that shuts ahead of you holds the rest of the chain, lifts after 6 s, and drops behind you once you're through.
- **The exit:** the exit panel at x = 187 lifts once the bucket holds 50 cr while you're in the vault. A shaft leads up to the surface.
- **Reset:** everything resets when you're back west of x = 30.
- **Difficulty:** at these timings you need to dive in at about 14 m/s and reach about 22 m/s. Slower and the doors beat you; faster and you hit the ramp.

### The Water Wheel

A wheel with radius 20 m and eight paddles, centred at (75, 20) (`wheel`).

- **Speed:** the stream keeps it turning clockwise at 0.28 rad/s, about one turn every 22 s.
- **Enclosure:** the rock hugs it 0.6–0.7 m outside the rim, except for two openings. The entrance spans 185–245°, which is about 7 to 9 o'clock, under an overhang with a flat waiting ledge. The cave mouth spans 340–20°.
- **The ride:** about 12 s from the entrance to the cave side. The stream (10 drops/s from a nozzle above the top) fills the bucket as you pass under it.
- **Inside:** the cave holds a dry vent (as on Dry Springs) at x = 112, and a chimney at the back leads up to the hilltop.
- **Pushing:** paddle contacts pass angular impulse to the wheel (`WHEEL_I = 24000`), and it eases back to base speed (`WHEEL_RELAX`). A sustained push takes it from 0.28 to about 0.37 rad/s. Pushing against the turn slows it. The speed is clamped between +0.05 and 2.2 × base.

### Gale

Open rolling hills with vents at x = 110 (mostly gems) and 189 (richer). Tumbleweeds (`weeds`): 3 in the air on shift 1, plus 1 per shift up to 8. Each has radius 0.85 m and mass 0.5 kg. They're dragged toward 3 × wind speed and bounce and hop off the ground. Hits from above deck level snag (up to `catchMax` 3); see the decision above for the rest. The `gale` block sets the strength: `base` 3.2 plus `perShift` 0.4 per shift after the first, capped at `max` 5, with ±1.3 of `gust` on top. Strength is in m/s² of push on the platform (×0.75) and on loose cargo (×0.35). `game.leg` is `out` or `home`, and `galeDir` eases between −1 and +1 over about 2.4 s. Blowing dust particles make the wind visible.

### Squalls

Rolling ground with vents at x = 70, 142 and 198, and five outcrops to shelter under: a rock arm off the hill near the pad (x 42–58), mushroom caps on stems by the first and last vents, a floating slab (x 114–135) and an overhang off the hill past the second vent. Each squall cycle runs: calm for 12–18 s, minus 1 s per shift (at least 6 s), then a 3.5 s warning, then the squall for 9–13 s plus 1.2 s per shift, then 3 s easing off. The intensity eases between drizzle (0.08) and a full squall (1). It drives the sky shade, dims the sun, sets how many rain streaks show, and sets the drop rate. The ground crew drains water from the bucket at the pad on this map only.

## Scenery and themes

`scenery.js` builds everything you see that isn't gameplay. It runs on each level load, after the level's own `create`, and draws only from the level's `theme`; collision is untouched. Theme fields (all optional; anything missing comes from the Badlands defaults):

| Field | What it sets |
| --- | --- |
| `sky` | Three CSS colours: top, middle and horizon of the sky gradient |
| `fog`, `hemi` | Fog colour; ambient light `[sky colour, ground colour, intensity]` |
| `sun` | `{ light, glow, x, y }` for the sun's light and glow, or `null` for no sun |
| `rock` | Strata texture: `bands` (palette), `bandsPerTile`, `warp`, `cracks`, `grain`, `bump` |
| `top` | Ground-top texture: `colors`, `streak` (grass-like grain), `bump` |
| `caveTint` | Colour of a cave's back wall |
| `ridges` | Background ridges: `{ z, base, amp, freq, color, style }`, where style is `smooth`, `jagged`, `mesa` or `hills` |
| `backdrop` | Painted backdrop: `style` (`mountains`, `mesas`, `volcano`, `hills`, `industrial`, `storm`), `colors`, `haze`, `cloud`, plus `trees` or `rain` for some styles. Or `image` for a real picture, with the painting as a fallback |
| `props`, `caveProps` | Props per metre of upward-facing surface, outside and under a roof: `tuft`, `boulder`, `shrub`, `spire` (pines, cacti or stalagmites), `crystal` |
| `colors` | Colour choices for each prop kind |
| `edge` | How far (m) the visible outline may wander inside the collision outline (default 0.3) |

Generated textures are 512 px (256 on phones), and backdrops 2048 × 512 (1024 × 256 on phones). Props are drawn as instanced meshes, one draw call per kind. A level can veto props in places with a `noProps(x, y)` hook; the cave uses it to keep lava pools clear, and the mine to keep door slots clear. On a level switch the engine now frees the old level's geometries, materials and textures; shared ones are marked `keep`.

## Level architecture

```
index.html          page shell, styles, HUD markup; loads engine.js, then levels/*.js, then Skybucket.boot()
engine.js           shared: physics, rendering, HUD, audio, ship, cargo, vents, water/pipes, cave backdrops,
                    moving-piece collision, flip, game flow
levels/*.js         Skybucket.registerLevel({ ...map data, create(K, map) })
```

A level is plain data that the engine understands (terrain, vents, quotas, fuel, wind, and the optional `cave`, `pipe` and dry vents), plus an optional `create(K, map)`. `create` runs each time the level loads. It builds the level's own state and meshes, and returns any of these hooks:

| Hook | When it runs |
| --- | --- |
| `step(dt)` | Every physics step, before the platform moves (move doors, turn wheels) |
| `afterShip(dt)` | Every physics step, after the platform moves (lava burn, drips, tumbleweeds) |
| `update(dt, info)` | Once per frame. `info` holds the bucket value, mass, counts and whether you're on the pad |
| `visuals(dt)` | Once per frame, before rendering (place meshes) |
| `wind(t)` | Replaces the default wind |
| `impactMult(x, y)` | Multiplier for crash damage at a contact point (lava ×3) |
| `cargoHazard(o)` | Return true to destroy a piece of cargo (the level plays its own effect) |
| `unsafeSpot(x, y)` | Return true to stop Flip upright from setting you down there |
| `minimapBase(g, MM)`, `minimap(g, MM)` | Draw on the minimap once per load, or every HUD update |
| `noProps(x, y)` | Return true to keep scenery props out of a spot |
| `onStart()`, `onRespawn()`, `onDeliver(load)` | Game events |
| `levelUpNote()` | Extra text for the shift-up banner |

The kit `K` gives a level:

- **Scene objects:** `THREE`, `scene`, `levelGroup` (cleared on every load), `camera`, `camTarget`, `sun`, `hemi`, `setSkyShade(a)`.
- **Shared materials.**
- **Helpers:** `clamp`, `rand`, `lerp`, `canvasTex`, and others.
- **Constants:** `G`, `PDT`, `TYPES`, `HULL`, `PTS`, `SHIP_M`, and others.
- **Live state:** `S` (the platform), `game`, `cargo`, `map`, `vents`.
- **World queries:** `querySegs`, `closest`, `groundHeightAt`, `roofAt`, `raycast`, `hullHit(x, y, r)`.
- **Moving collision:** `makeSeg`, `setSeg`, `DYN_SEGS`, `DYN_VERTS`. A piece's `body` can supply `velAt(x, y, out)`, `impulse(x, y, Jx, Jy)` and `touch()`.
- **Effects and events:** `damageShip`, `drainHull`, `flashHull`, `spawnCargo`, `spawnWater`, `removeCargo`, `banner`, `popText`, `fireP`, `smokeP`, `sparkBurst`, `audio`.

Anything a level adds to `K.levelGroup`, `K.DYN_SEGS` or `K.DYN_VERTS` is cleared automatically when another level loads.

## Engine reference

### Physics

- **Stepping:** fixed 240 Hz steps (`PDT`), up to 14 per frame, with semi-implicit Euler integration.
- **The platform:** one rigid body. Its hull is capsule segments (`HULL`, radius 0.07) and its terrain probes are 18 sample points (`PTS`, radius 0.1).
- **Terrain:** polygons stored as segments in an 8 m uniform grid along x.
- **Contacts:** sequential impulses with restitution and friction. Position correction avoids double-counting parallel contacts. Rock corners are also tested against the hull, so a pillar tip can't poke into the bucket.
- **Cargo:** circles colliding with terrain, with each other and with the hull. Their impulses feed back into the platform, which is why a load sliding to one side tips you.
- **Moving pieces** (doors, wheel paddles): they live in `DYN_SEGS` and `DYN_VERTS`, outside the grid, and are updated in place every step. A segment can be two-sided and have thickness (`twoSided`, `th`), and contacts carry the surface's velocity (`surfaceVel`). That's how paddles carry the platform and cargo, and how platform impulses turn the wheel.

### Audio

Everything is synthesised with Web Audio: filtered noise for each jet (panned left and right), and tones for ore clinks, delivery, level-up, vent rumble, door slams and lava sizzle. It starts on the first key or tap.

### Testing

The game exposes a test hook, `window.__skybucket`. It gives access to the game and ship state, cargo, vents, the current level's hooks and state (`level`), `physicsStep`, `updateGame`, `spawnCargo` and `loadMap`.

Every change was checked in headless Chromium (Playwright), with the CDN script routed to a local copy of Three.js. Tests drive the physics deterministically and fly scripted autopilots. These tests set several of the tuning values in this document:

- The cave's tank size came from measuring one-way fuel use (78 in 81 s).
- The Falling Doors timings were checked against autopilot runs at different speeds.
- The water wheel's entrance width came from an autopilot that couldn't get in at 40°.
- The lava numbers were measured directly (36/s burn, 24 per drip, about 3× crash damage).

Desktop (1280 × 720) and phone (390 × 844) screenshots were checked after each visual change.

## Ideas not yet built

- A Falling Doors variant with a gentler opening, or a longer gap after a jam.
- More dry-vent or wheel layouts, such as a wheel that turns the other way and carries you out instead of in.
- Gating the Easter egg behind a hint somewhere in the game world.
