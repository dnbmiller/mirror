# Skybucket

A 2.5D physics flying game. You pilot a lift platform with a jet at each end and an open bucket on its deck. Vents out in the badlands erupt ore. Catch it in the bucket, fly it home without spilling, and land on the pad to cash it in.

For how the game came together, the decisions behind each map and the full tuning reference, see [DESIGN.md](DESIGN.md).

## Maps

Pick a map on the setup screen before you launch.

- **Badlands:** open hills with five vents. The farther vents throw richer ore. From shift 2 the wind picks up (watch the windsock and the HUD), pushing both the platform and loose cargo.
- **The Long Cave:** a 280 m tunnel with rolling hills underneath and rock outcrops hanging from the roof, down to about 12 m of clearance. One rich vent sits at the far end. There's no wind, and the tank is bigger (260 instead of 120) for the long round trip.
  - **Lava** fills the four dips in the cave floor, and nine glowing cracks in the roof drip blobs of lava every few seconds while you're nearby. A crack swells and brightens just before it lets go. Lava does triple damage. A crash onto a lava floor costs 3× the normal hull damage, a drip hit costs 24 (8 × 3), and sitting in a pool burns 36 hull per second (12 × 3). Ore that falls in melts. The multiplier and base values are `LAVA_MULT`, `DRIP_BASE` and `LAVA_BURN_BASE`. Pools and cracks are listed in the map's `lava` entry.

- **Dry Springs:** the only vent has run dry. A pipe from the water tower by the pad pours water constantly. Hover under it to fill the bucket, fly out to the vent and tip the bucket so the water pours into the crater. The vent drinks it, turns from dusty brown to blue, and erupts once for every 10 drops (it holds up to 40). Water is made of slippery droplets that slosh and spill if you fly roughly, and it adds weight (0.12 kg a drop, about 4 kg for a full bucket). Water that lands anywhere else soaks into the ground. Unloading at the pad only takes the ore, so leftover water stays in the bucket for the next trip. Light wind from shift 2.

- **Falling Doors:** a mineshaft under the hills. Five steel doors wait in slots in its ceiling, with hazard-striped edges showing. The moment you're through the entrance, the first door slams down behind you. The other four start dropping 1 s later, 0.5 s apart, so you have to dive in fast and race under each before it lands. The window is narrow: enter the ramp too slowly and the doors beat you, too fast and you hit the ramp. A door shakes and sheds dust just before it falls. If one comes down on you, it crushes for heavy damage and rests on the platform until you slide out. Ore under a door is crushed. If a door shuts in front of you, the rest of the chain waits. After 6 s that door lifts, and it drops behind you once you're through. At the end is a vault with a gem vent. The exit panel there stays shut, with its lamp blinking red, until your bucket holds 50 cr of ore. Then it lifts, and you climb the exit shaft and fly home over the top. Everything resets once you're back by the pad. Tuning is in the map's `doors` entry.

- **The Water Wheel:** a 40 m water wheel with eight paddles fills the mouth of a cave in the hillside. The rock hugs the wheel all round, except for two openings: the entrance, low on the left at about 8 o'clock under an overhang, and the cave mouth at 3 o'clock. The stream from a nozzle above it keeps the wheel turning clockwise, about one turn every 22 s. Wait on the flat ledge in the entrance alcove, dart into a bay as it lines up with the opening, and stay level while the paddle behind carries you up and over (about 12 s). Passing under the stream fills your bucket. Fly off into the cave, then pour the water into the dry vent, as on Dry Springs (10 drops per eruption). Thrusting against a paddle in the direction it's turning speeds the wheel up by about a third; pushing the other way slows it. It eases back to normal speed once you let go. Paddle tips hit hard, and if you just sit in a bay without flying it wedges you and turns you over. Leave by the chimney at the back of the cave and fly home over the hill.

- **Gale:** a plain map of open hills with two vents, and a gale that is always a headwind. On the way out it blows from the vents toward home. Once you have ore aboard it dies down and swings round to blow from home, so you fight it on the way back too. Delivering, losing a ship, or flying with an empty bucket for 4 s swings it back. It starts at about 30 kn and strengthens each shift, up to about 50 kn. Light and medium loads always make it home. Near the jets' weight limit there's almost no spare thrust to beat a headwind, so it pays to carry less per trip in the later shifts. Tumbleweeds blow through on the wind, more each shift. One that hits the platform from above deck level tangles in the bucket and rides along, adding its weight and catching the wind (about 60% more push per weed). Tip hard or spin to shake it off, or land at the pad and the ground crew pulls it off. Hits from below just bounce off and knock you about.

- **Squalls:** rain sweeps in as squalls between calm spells, with a few seconds' warning (thunder, a darkening sky and a banner). Squalls get longer and heavier each shift. The raindrops near you are real water, so an open bucket fills up and gets heavy: hovering in the open through a full squall adds about 4–5 kg. Shelter under the rock outcrops (an arm off the hillside, mushroom-shaped caps on stems, a floating slab, an overhang), where no rain falls. The rain that lands on the rock runs off, drips over the edges and soaks into the ground. Tip the bucket to pour water out, or land on the pad and the ground crew drains it.

The pause button (❚❚ in the top-right of the HUD, or `P`/`Esc`) has **Flip upright**, which sets the platform level in the nearest clear spot (not in rock, a door, a paddle or next to lava) and resumes, for when you end up stuck on your back. It also has **Back to setup**, which takes you to the setup screen to change the map or settings. So does the game-over screen.

## Secrets (spoilers)

- **Lava-forged gold:** in the cave, catch a lava drip on a piece of gold (in the bucket or in mid-air) and it doubles in value, from 60 to 120 cr, without getting any heavier. It glows molten orange after that. A drip that lands on gold is absorbed, so it doesn't hurt the platform. Each piece can only be forged once. The setup screen doesn't mention this. It's in `forgeGold`.

## Running

Open `index.html` in a browser. There's no build step: the page loads `engine.js` and the level files in `levels/` as plain scripts. Three.js (r128) loads from cdnjs, so the first load needs a network connection.

To serve it locally instead of opening the file directly:

```sh
cd games/skybucket && python3 -m http.server 8000
# then open http://localhost:8000
```

## Controls

| Key | Direct scheme (default) | Steer scheme |
| --- | --- | --- |
| `←` / `A` | Left jet (tilts you right) | Lean left (fires the right jet) |
| `→` / `D` | Right jet (tilts you left) | Lean right (fires the left jet) |
| `↑` / `W` / `Space` | Both jets | Both jets |

Holding both arrows also fires both jets. `-`/`=` or the mouse wheel zoom the camera, from 50% (pulled far out) to 150% (close in). There's also a zoom slider on the setup screen. `F` flips the platform upright (same as the pause-screen button). `G` toggles gyro assist, `C` swaps control scheme, `M` mutes, `P`/`Esc` pauses. On touch screens two thumb pads appear in the bottom corners, one per jet.

## Rules

- **Cargo:** gems (10 cr, 0.45 kg), crystals (25 cr, 1 kg) and gold (60 cr, 2.2 kg). Vents farther from home throw richer, heavier ore. A full bucket of gold weighs about as much as the jets can lift.
- **Bucket readout:** the HUD shows the bucket's value against what's left of the shift's quota, and its load in kg against what the jets can lift. The value bar turns green, with a chime, once the load covers the quota. The load bar turns red when it gets heavy for the jets.
- **Delivering:** set down gently on the home pad with both feet. Everything in the bucket is unloaded into the silo at once, and the platform refuels and repairs while it sits there.
- **Damage:** hard landings and hull scrapes cost hull. The landing legs absorb more than the hull. At zero hull the platform is lost. Running dry away from the pad also costs a ship. You have three.
- **Shifts:** meeting a quota starts the next shift with a higher quota. On the Badlands each shift also brings stronger wind.
- Ore left lying on the ground crumbles after about five seconds.

## How it works

```
index.html          page, styles, HUD markup, and the list of level scripts to load
engine.js           everything shared: physics, rendering, HUD, audio, game flow
scenery.js          how levels look: themes, generated textures, painted backdrops, props
levels/*.js         one file per level: its map data, its theme, plus any mechanics of its own
```

- **Physics:** a custom 2D rigid-body sim on the z = 0 plane, stepped at 240 Hz. The platform is one rigid body (mass, moment of inertia, two off-centre thrust points). Its hull is a set of capsule segments, and the terrain is polygons stored as segments in a uniform grid. Contacts use sequential impulses with friction and restitution. Cargo pieces are circles that collide with the terrain, with each other and with the hull segments. Their impulses go back into the platform, so a load sliding to one side of the bucket really does tip you. Moving pieces (doors, wheel paddles) report their own surface velocity and feel the platform's pushes.
- **Rendering:** Three.js. The terrain polygons are extruded into 3D slabs and the camera looks across them with a slight downward tilt, which gives the 2.5D look. Exhaust, dust and smoke are GPU point sprites.
- **Scenery:** each level has a `theme` that sets its sky, fog and light; the colours of its rock strata and ground; its background ridges and a painted backdrop (mountains, mesas, volcanoes, hills, an industrial skyline or a storm front); and the props along its surfaces (grass, boulders, shrubs, pines or cacti, stalagmites, crystals). The rock and ground textures (with surface bump) and the backdrop are generated in code when a level first loads, about 0.1 s, and cached. There are no image files, so opening the page from disk still works. The visible rock outline is roughened slightly inside the collision outline, so edges look craggy without changing how anything flies. Phones get smaller textures and fewer props. A theme can name a real image for its backdrop (`backdrop: { image: 'path.jpg' }`), with the painted one as a fallback. Image textures need the page served over http rather than opened from disk.
- **Audio:** synthesised with the Web Audio API, so there are no asset files.

Shared tuning constants (`THRUST`, `SHIP_M`, `SHIP_I`, `BURN`, the `TYPES` table) are near the top of `engine.js`. Best scores are saved separately for each level.

## Adding a level

1. Create `levels/my-level.js` and call `Skybucket.registerLevel({...})` with the map data:
   - `id` and `name`.
   - `blurb` (shown on the setup screen) and `intro` (shown at launch).
   - `world` x-range, `fuel` tank size, `wind` strength, `sun` brightness.
   - `quotas` and `quotaStep`.
   - The `ground` polygon (its top edge is the surface), any extra rock `solids`, and `vents`.
   - Optional shared features: a `cave` backdrop, a water `pipe`, and `dry: true` vents that need water.
   - A `theme` for how it looks (see DESIGN.md). Anything left out falls back to the Badlands dusk look.
2. Add a `<script src="levels/my-level.js">` line to `index.html`. The setup screen lists levels in script order.
3. If the level needs mechanics of its own, give it a `create(K, map)` function. It builds the level's state and meshes from the kit `K` and returns the hooks it wants. Anything it adds to `K.levelGroup` or `K.DYN_SEGS` is cleared automatically when another level loads. The existing levels are working examples: `long-cave.js` (lava), `falling-doors.js` (moving doors), `water-wheel.js` (a rotating body) and `gale.js` (custom wind and tumbleweeds).

See `DESIGN.md` for the full list of hooks and kit functions.
