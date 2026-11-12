// Falling Doors: a mineshaft whose ceiling doors slam down in sequence once you're inside.
// The exit from the vault opens when the bucket holds enough ore.
Skybucket.registerLevel({
  id: 'mine', name: 'Falling Doors',
  blurb: 'A mineshaft with steel doors slotted in its ceiling. Once you are inside they slam down one after another, so race them to the vault. The exit opens when your bucket holds 50 cr of ore.',
  intro: 'Race the falling doors to the vault. The exit opens with 50 cr in the bucket.',
  world: { x0: -60, x1: 270 }, fuel: 180, wind: 0, sun: 1.1,
  quotas: [100, 250, 500, 850, 1300], quotaStep: 500,
  cave: { x0: 44, x1: 212, y0: -32, y1: 4 },
  // doors[0] seals the entrance behind you; the rest fall in sequence, `interval` s apart
  doors: { xs: [74, 85, 105, 125, 145], trigger: 80, resetX: 30, first: 1, interval: 0.5, exit: { x: 187, need: 50 } },
  // a mining town at dusk: grey slate, headframes and chimneys on the horizon
  theme: {
    sky: ['#1a1f2b', '#454d60', '#a8907a'], fog: '#7a767c', hemi: ['#b0b8c8', '#3a3430', 0.75],
    sun: { light: '#ffc89a', glow: '#ffb880', x: -60, y: 45 },
    rock: { bands: ['#4a4c52', '#5a5c60', '#3e4046', '#55545a'], bandsPerTile: 8, warp: 0.4, cracks: 0.7, grain: 0.55, bump: 2.4 },
    top: { colors: ['#5a544a', '#6a6252', '#4a463e'], streak: 0.3, bump: 1.3 },
    caveTint: '#7a7a84',
    ridges: [
      { z: -80, base: 2, amp: 22, freq: 0.03, color: '#3a3c46', style: 'jagged' },
      { z: -170, base: 8, amp: 40, freq: 0.017, color: '#555866', style: 'smooth' },
    ],
    backdrop: { style: 'industrial', colors: ['#6a6a78', '#4a4a56', '#2a2a32'], haze: '#a89a8a', cloud: '#8a8486' },
    props: { tuft: 0.8, boulder: 0.08, shrub: 0.02 },
    colors: { tuft: ['#7a7250', '#6a6446'], boulder: ['#5a5a60', '#6a6a6e'], shrub: ['#4a5236', '#5a603e'], spire: ['#4a4a50', '#5a5a60'], crystal: ['#5ff2ff', '#ffd06a'] },
    caveProps: { boulder: 0.07, spire: 0.03, crystal: 0.025 },
  },
  ground: [
    [-70, 90], [-52, 90], [-48, 40], [-40, 18], [-28, 9], [-16, 3], [-8, 0], [8, 0], [14, 1], [22, 2], [28, 1],
    [40, -5], [52, -11], [64, -17], [72, -20], [85, -20], [97, -19.5], [110, -20], [122, -20.5], [135, -20],
    [148, -20], [154, -23], [162, -26], [176, -26], [184, -23], [190, -22], [204, -22], [206, -10], [207, 4],
    [230, 6], [240, 30], [244, 90], [270, 90], [270, -60], [-70, -60],
  ],
  solids: [
    // the rock above the shaft: its top is the surface you fly home over, its underside the shaft ceiling
    { depth: 18, front: 4, roof: true, pts: [
      [40, 6.5], [60, 7], [100, 6], [140, 7], [170, 6], [190, 5], [190, -11], [184, -11], [180, -6], [170, -5],
      [160, -6], [154, -9], [148, -8], [135, -8], [122, -8.5], [110, -8], [97, -7.5], [85, -8], [72, -8],
      [64, -5], [52, 1], [44, 5],
    ] },
  ],
  vents: [
    { x: 169, y: -26, mix: [0.7, 0.3, 0], burst: [3, 5] },
  ],

  // Doors wait in ceiling slots. Passing the entrance seals door 0 behind you; the rest fall in
  // sequence. Door states: up (in its slot) -> warn (shaking) -> falling -> down -> rising -> up.
  // A door that shuts in front of you holds the rest of the chain, lifts after DOOR_JAM seconds,
  // and drops behind you once you're through. The exit lifts when the bucket holds enough ore.
  create(K, map) {
    const { THREE, S, game, cargo, rand, clamp, G } = K;
    const D = map.doors;
    const DOOR_W = 1.2, DOOR_EMBED = 3, DOOR_WARN = 0.7, DOOR_JAM = 6, DOOR_PEEK = 0.25;
    const mine = { doors: [], exit: null, armed: true, t: 0 };
    let slam = 0, slamX = 0;

    function placeDoor(d) {
      const x0 = d.x - DOOR_W / 2, x1 = d.x + DOOR_W / 2, y0 = d.y, y1 = d.y + d.h;
      K.setSeg(d.segs[0], x1, y0, x0, y0); K.setSeg(d.segs[1], x1, y1, x1, y0);
      K.setSeg(d.segs[2], x0, y1, x1, y1); K.setSeg(d.segs[3], x0, y0, x0, y1);
      d.verts[0].x = x0; d.verts[0].y = y0; d.verts[1].x = x1; d.verts[1].y = y0;
    }
    // top surface of the rock above the shaft at x: a raised door must fit inside it
    function surfaceAt(x) {
      let top = -Infinity;
      for (const sd of map.solids) {
        if (!sd.roof) continue;
        for (let i = 0; i < sd.pts.length; i++) {
          const a = sd.pts[i], b = sd.pts[(i + 1) % sd.pts.length];
          if (a[0] === b[0] || x < Math.min(a[0], b[0]) || x > Math.max(a[0], b[0])) continue;
          top = Math.max(top, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]));
        }
      }
      return top;
    }
    function makeDoor(x, exit) {
      const floor = Math.max(K.groundHeightAt(x - DOOR_W / 2), K.groundHeightAt(x), K.groundHeightAt(x + DOOR_W / 2));
      const ceil = K.roofAt(x), gap = ceil - floor;
      // tall enough to reach the floor, short enough that it never pokes out of the hill when raised
      const embed = clamp(surfaceAt(x) - ceil - gap - 0.3, 0.3, DOOR_EMBED);
      if (surfaceAt(x) - ceil < gap + 0.3) console.warn(`Door at x=${x}: the rock above is too thin to hide it`);
      const d = { x, floor, upY: ceil - DOOR_PEEK, h: gap + embed, embed, exit, state: exit ? 'down' : 'up',
        vy: 0, fallAt: null, fallWhenPassed: false, downT: 0, hitShip: false, crushed: false };
      d.y = exit ? floor : d.upY;
      d.touch = () => { d.hitShip = true; }; // the engine calls this when the platform touches the door
      d.segs = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([nx, ny]) => K.makeSeg({ nx, ny, body: d }));
      d.verts = [{ x: 0, y: 0, body: d }, { x: 0, y: 0, body: d }];
      K.DYN_SEGS.push(...d.segs); K.DYN_VERTS.push(...d.verts);
      placeDoor(d);
      return d;
    }
    mine.doors = D.xs.map(x => makeDoor(x, false));
    mine.exit = makeDoor(D.exit.x, true);
    const all = () => mine.doors.concat(mine.exit);

    function resetMine() {
      for (const d of mine.doors) { Object.assign(d, { state: 'up', y: d.upY, vy: 0, fallAt: null, fallWhenPassed: false, downT: 0, crushed: false }); placeDoor(d); }
      Object.assign(mine.exit, { state: 'down', y: mine.exit.floor, vy: 0 }); placeDoor(mine.exit);
      mine.armed = true;
    }
    function scheduleDoors(from, t) {
      for (let j = from; j < mine.doors.length; j++) {
        const d = mine.doors[j];
        if (d.state === 'up' || d.state === 'warn') { d.fallAt = t + (j - from) * D.interval; d.fallWhenPassed = false; }
      }
    }
    function hold(from) {
      for (let j = from; j < mine.doors.length; j++) {
        const n = mine.doors[j];
        if (n.state === 'up' || n.state === 'warn') { n.state = 'up'; n.fallAt = null; }
      }
    }

    // ---- meshes
    const doorTex = K.canvasTex(64, 512, (g, w, h) => {
      g.fillStyle = '#5d646c'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, w, 2); }
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${120 + Math.random() * 60 | 0},70,40,${Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * h, rand(2, 8), rand(2, 10)); }
      // hazard stripes along the bottom edge
      for (let i = -4; i < 8; i++) {
        g.fillStyle = i % 2 ? '#1b1b1b' : '#f2b31b';
        g.beginPath(); g.moveTo(i * 12, h); g.lineTo(i * 12 + 12, h); g.lineTo(i * 12 + 36, h - 30); g.lineTo(i * 12 + 24, h - 30); g.fill();
      }
    });
    const doorMat = new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.6, metalness: 0.5 });
    const exitLampMat = new THREE.MeshBasicMaterial({ color: 0xff3b2e });
    for (const d of all()) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, d.h, 7.2), doorMat);
      m.castShadow = true; m.receiveShadow = true;
      K.levelGroup.add(m);
      d.mesh = m;
      // slot rails in the ceiling so you can see where the doors are waiting
      for (const sx of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 7.4), K.darkMetal);
        rail.position.set(d.x + sx * (DOOR_W / 2 + 0.15), d.upY + DOOR_PEEK - 0.2, 0.2);
        K.levelGroup.add(rail);
      }
    }
    const exitLamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), exitLampMat);
    exitLamp.position.set(mine.exit.x - 1.6, mine.exit.upY - 0.5, 3.4);
    K.levelGroup.add(exitLamp);

    return {
      mine,
      // every physics step: move the doors and handle crushes
      step(dt) {
        mine.t += dt;
        for (const d of mine.doors) {
          if (d.state === 'up' && d.fallAt !== null && mine.t >= d.fallAt - DOOR_WARN) d.state = 'warn';
          if (d.state === 'warn' && mine.t >= d.fallAt) { d.state = 'falling'; d.vy = 2; d.fallAt = null; }
          if (d.state === 'falling') {
            if (d.hitShip) {
              // landed on the platform: crush once, then rest on it until it moves away
              if (!d.crushed && game.state === 'play' && S.alive) { d.crushed = true; K.damageShip(Math.max(10, (d.vy - 1) * 7)); }
              d.vy = 0;
            } else {
              d.vy = Math.min(16, d.vy + G * 1.6 * dt);
              d.y -= d.vy * dt;
              if (d.y <= d.floor) {
                d.y = d.floor; d.state = 'down'; d.downT = 0;
                // shut in front of you: hold the rest of the chain until you're through this one
                const i = mine.doors.indexOf(d);
                if (i > 0 && S.x < d.x) hold(i + 1);
                slam = Math.max(slam, d.vy); slamX = d.x;
              }
              // ore under a falling door is crushed
              for (const o of cargo) {
                if (!o.gone && Math.abs(o.x - d.x) < DOOR_W / 2 + o.r && o.y < d.y + 0.2 && o.y > d.y - o.r - 0.2) o.crush = true;
              }
            }
            placeDoor(d);
          } else if (d.state === 'rising') {
            d.y = Math.min(d.upY, d.y + 4 * dt);
            if (d.y >= d.upY) { d.state = 'up'; d.fallWhenPassed = true; }
            placeDoor(d);
          }
          d.hitShip = false;
        }
        const e = mine.exit;
        if (e.state === 'rising') {
          e.y = Math.min(e.upY, e.y + 3 * dt);
          if (e.y >= e.upY) e.state = 'up';
          placeDoor(e);
        }
        e.hitShip = false;
      },
      update(dt, info) {
        const doors = mine.doors, e = mine.exit;
        // back near the pad: everything resets for the next run
        if (S.x < D.resetX && !mine.armed) resetMine();
        // through the entrance: seal it behind you and start the chain
        if (mine.armed && S.alive && game.state === 'play' && S.x > D.trigger && S.y < 0) {
          mine.armed = false;
          doors[0].fallAt = mine.t + 0.4;
          scheduleDoors(1, mine.t + D.first);
          K.banner('', 'The doors are coming down. Get to the vault!', 2.2);
        }
        doors.forEach((d, i) => {
          if (d.state === 'down') {
            d.downT += dt;
            if (S.alive && S.x < d.x && (i === 0 || S.x > doors[i - 1].x) && d.downT > DOOR_JAM) {
              d.state = 'rising';
              hold(i + 1);
            } else if (S.alive && S.x < d.x && S.x > d.x - 14 && d.downT > 1.2 && d.downT < 1.2 + dt * 1.5 && i > 0) {
              K.banner('', `Too slow. That door lifts again in ${DOOR_JAM - 1} seconds.`, 2);
            }
          }
          if (d.state === 'up' && d.fallWhenPassed && S.x > d.x + 3.6) {
            d.fallWhenPassed = false;
            d.fallAt = mine.t + 0.2;
            scheduleDoors(i + 1, mine.t + D.interval);
          }
          if (d.state === 'warn') {
            if (Math.random() < dt * 25) K.smokeP(d.x + rand(-0.8, 0.8), d.upY - 0.1, rand(-3, 3.5), rand(-0.4, 0.4), -rand(0.5, 2), 0, rand(0.6, 1.2), 0.4, 1.5, [0.55, 0.48, 0.42], 0.5, 3);
            if (Math.abs(S.x - d.x) < 40 && Math.random() < dt * 10) K.audio.thud(0.06, 300, 0.12);
          }
        });
        // the exit lifts once the bucket holds enough ore, while you're in the vault
        if (e.state === 'down' && S.alive && S.x > e.x - 40 && S.x < e.x && S.y < e.upY && info.bucketValue >= D.exit.need) {
          e.state = 'rising';
          K.popText('Exit open', e.x, e.floor + 6);
          K.banner('', 'Exit open. Climb the shaft and fly home over the top.', 2.4);
          [523, 659, 784].forEach((f, i) => setTimeout(() => K.audio.tone(f, 0.22, 'triangle', 0.12), i * 100));
        }
        if (slam) {
          const near = clamp(1 - Math.abs(S.x - slamX) / 60, 0, 1);
          K.audio.thud(0.15 + near * 0.6, 120, 0.7);
          game.shake = Math.max(game.shake, near * 0.6);
          for (let k = 0; k < 16; k++) K.smokeP(slamX + rand(-3, 3), K.groundHeightAt(slamX) + 0.3, rand(-3, 3.5), rand(-4, 4), rand(0.3, 1.5), 0, rand(0.8, 1.6), 0.6, 2.6, [0.6, 0.52, 0.45], 0.5, 0.3);
          slam = 0;
        }
      },
      visuals() {
        for (const d of all()) {
          const warn = d.state === 'warn';
          d.mesh.position.set(d.x + (warn ? rand(-0.06, 0.06) : 0), d.y + d.h / 2 + (warn ? -0.15 : 0), 0.2);
        }
        exitLampMat.color.setHex(mine.exit.state === 'down' ? (Math.sin(game.time * 5) > 0 ? 0xff3b2e : 0x5a1410) : 0x5dff7a);
      },
      cargoHazard(o) {
        if (!o.crush) return false;
        K.sparkBurst(o.x, o.y, K.TYPES[o.t].color, 14, 5);
        return true;
      },
      minimap(g, MM) {
        g.fillStyle = '#f2b31b';
        for (const d of all()) if (d.state !== 'up') g.fillRect(MM.tx(d.x) - 1.5, MM.ty(d.y + d.h - d.embed), 3, (d.h - d.embed) * MM.s);
      },
      noProps: x => all().some(d => Math.abs(x - d.x) < 2), // keep door slots clear
      onStart: resetMine,
      onRespawn: resetMine,
    };
  },
});
