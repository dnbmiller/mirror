# Skybucket

A 2.5D physics flying game. You pilot a lift platform with a jet at each end and an open bucket on its deck. Vents out in the badlands erupt ore. Catch it in the bucket, fly it home without spilling, and land on the pad to cash it in.

## Maps

Pick a map on the setup screen before you launch.

- **Badlands:** open hills with five vents. The farther vents throw richer ore. From shift 2 the wind picks up (watch the windsock and the HUD), pushing both the platform and loose cargo.
- **The Long Cave:** a 280 m tunnel with rolling hills underneath and rock outcrops hanging from the roof, down to about 12 m of clearance. One rich vent sits at the far end. There's no wind, and the tank is bigger (260 instead of 120) for the long round trip.

The pause button (❚❚ in the top-right of the HUD, or `P`/`Esc`) has **Back to setup**, which takes you to the setup screen to change the map or settings. So does the game-over screen.

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
