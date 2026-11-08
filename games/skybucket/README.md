# Skybucket

A 2.5D physics flying game. You pilot a lift platform with a jet at each end and an open bucket on its deck. Vents out in the badlands erupt ore. Catch it in the bucket, fly it home without spilling, and land on the pad to cash it in.

## Maps

Pick a map on the setup screen before you launch.

- **Badlands:** open hills with five vents. The farther vents throw richer ore. From shift 2 the wind picks up (watch the windsock and the HUD), pushing both the platform and loose cargo.
- **The Long Cave:** a 280 m tunnel with rolling hills underneath and rock outcrops hanging from the roof, down to about 12 m of clearance. One rich vent sits at the far end. There's no wind, and the tank is bigger (260 instead of 120) for the long round trip.
  - **Lava** fills the four dips in the cave floor, and nine glowing cracks in the roof drip blobs of lava every few seconds while you're nearby. A crack swells and brightens just before it lets go. Lava does triple damage. A crash onto a lava floor costs 3× the normal hull damage, a drip hit costs 24 (8 × 3), and sitting in a pool burns 36 hull per second (12 × 3). Ore that falls in melts. The multiplier and base values are `LAVA_MULT`, `DRIP_BASE` and `LAVA_BURN_BASE`. Pools and cracks are listed in the map's `lava` entry.

- **Dry Springs:** the only vent has run dry. A pipe from the water tower by the pad pours water constantly. Hover under it to fill the bucket, fly out to the vent and tip the bucket so the water pours into the crater. The vent drinks it, turns from dusty brown to blue, and erupts once for every 10 drops (it holds up to 40). Water is made of slippery droplets that slosh and spill if you fly roughly, and it adds weight (0.12 kg a drop, about 4 kg for a full bucket). Water that lands anywhere else soaks into the ground. Unloading at the pad only takes the ore, so leftover water stays in the bucket for the next trip. Light wind from shift 2.

- **Falling Doors:** a mineshaft under the hills. Five steel doors wait in slots in its ceiling, with hazard-striped edges showing. The moment you're through the entrance, the first door slams down behind you. The other four drop one after another, 3.4 s apart, so you have to race under each before it lands. A door shakes and sheds dust just before it falls. If one comes down on you, it crushes for heavy damage and rests on the platform until you slide out. Ore under a door is crushed. If a door shuts in front of you, the rest of the chain waits. After 6 s that door lifts, and it drops behind you once you're through. At the end is a vault with a gem vent. The exit panel there stays shut, with its lamp blinking red, until your bucket holds 50 cr of ore. Then it lifts, and you climb the exit shaft and fly home over the top. Everything resets once you're back by the pad. Tuning is in the map's `doors` entry.

The pause button (❚❚ in the top-right of the HUD, or `P`/`Esc`) has **Back to setup**, which takes you to the setup screen to change the map or settings. So does the game-over screen.

## Secrets (spoilers)

- **Lava-forged gold:** in the cave, catch a lava drip on a piece of gold (in the bucket or in mid-air) and it doubles in value, from 60 to 120 cr, without getting any heavier. It glows molten orange after that. A drip that lands on gold is absorbed, so it doesn't hurt the platform. Each piece can only be forged once. The setup screen doesn't mention this. It's in `forgeGold`.

## Running

Open `index.html` in a browser. It is a single file with no build step. Three.js (r128) loads from cdnjs, so the first load needs a network connection.

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

Holding both arrows also fires both jets. `-`/`=` or the mouse wheel zoom the camera, from 50% (pulled far out) to 150% (close in). There's also a zoom slider on the setup screen. `G` toggles gyro assist, `C` swaps control scheme, `M` mutes, `P`/`Esc` pauses. On touch screens two thumb pads appear in the bottom corners, one per jet.

## Rules

- **Cargo:** gems (10 cr, 0.45 kg), crystals (25 cr, 1 kg) and gold (60 cr, 2.2 kg). Vents farther from home throw richer, heavier ore. A full bucket of gold weighs about as much as the jets can lift.
- **Bucket readout:** the HUD shows the bucket's value against what's left of the shift's quota, and its load in kg against what the jets can lift. The value bar turns green, with a chime, once the load covers the quota. The load bar turns red when it gets heavy for the jets.
- **Delivering:** set down gently on the home pad with both feet. Everything in the bucket is unloaded into the silo at once, and the platform refuels and repairs while it sits there.
- **Damage:** hard landings and hull scrapes cost hull. The landing legs absorb more than the hull. At zero hull the platform is lost. Running dry away from the pad also costs a ship. You have three.
- **Shifts:** meeting a quota starts the next shift with a higher quota. On the Badlands each shift also brings stronger wind.
- Ore left lying on the ground crumbles after about five seconds.

## How it works

Everything is in `index.html`:

- **Physics:** a custom 2D rigid-body sim on the z = 0 plane, stepped at 240 Hz. The platform is one rigid body (mass, moment of inertia, two off-centre thrust points). Its hull is a set of capsule segments, and the terrain is polygons stored as segments in a uniform grid. Contacts use sequential impulses with friction and restitution. Cargo pieces are circles that collide with the terrain, with each other and with the hull segments. Their impulses go back into the platform, so a load sliding to one side of the bucket really does tip you.
- **Rendering:** Three.js. The terrain polygons are extruded into 3D slabs and the camera looks across them with a slight downward tilt, which gives the 2.5D look. Exhaust, dust and smoke are GPU point sprites.
- **Audio:** synthesised with the Web Audio API, so there are no asset files.

Tuning constants (`THRUST`, `SHIP_M`, `SHIP_I`, `BURN`, the `TYPES` table) are near the top of the script. Each map is an entry in `MAPS`: its `ground` polygon, extra rock `solids` (floating islands or the cave roof), `vents`, `quotas`, fuel tank size and wind strength. Add an entry and a button with a matching `data-map` on the setup screen to make a new map. Best scores are saved separately for each map.
