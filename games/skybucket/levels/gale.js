// Gale: open hills with a gale that is a headwind both ways, and tumbleweeds blowing through.
Skybucket.registerLevel({
  id: 'gale', name: 'Gale',
  blurb: 'Open hills, two vents, and a gale that is always in your face. It blows from the vents on the way out, then turns to blow from home once you have ore aboard. Tumbleweeds ride the wind and snag on the bucket. It strengthens every shift.',
  intro: 'Headwind out, headwind home: the gale turns when you pick up ore.',
  world: { x0: -60, x1: 260 }, fuel: 170, wind: 0, sun: 1.25,
  quotas: [120, 300, 600, 1000, 1500], quotaStep: 600,
  // wind strength in m/s^2 of push on the platform's frame: base + perShift per shift after the first, capped
  gale: { base: 3.2, perShift: 0.4, max: 5, gust: 1.3 },
  // tumbleweeds in the air at once: base + perShift per shift after the first, up to max.
  // A snagged weed adds its mass and `sail` x wind of extra push on the platform.
  weeds: { r: 0.85, m: 0.5, base: 3, perShift: 1, max: 8, catchMax: 3, sail: 0.3 },
  // a dusty desert canyon: banded sandstone, mesas, scrub and cacti
  theme: {
    sky: ['#5a4030', '#b8845a', '#efc58c'], fog: '#c9a274', hemi: ['#ffe0b0', '#6a4a2a', 0.85],
    sun: { light: '#ffd8a0', glow: '#ffcf90', x: -20, y: 60 },
    rock: { bands: ['#a8603a', '#c4784a', '#8a4e30', '#d0905e', '#b46c42'], bandsPerTile: 10, warp: 0.45, cracks: 0.45, grain: 0.4, bump: 2.2 },
    top: { colors: ['#c8a46a', '#d4b47a', '#b8945a'], streak: 0.4, bump: 1.2 },
    ridges: [
      { z: -80, base: 0, amp: 20, freq: 0.025, color: '#8a5a3a', style: 'mesa' },
      { z: -170, base: 4, amp: 26, freq: 0.014, color: '#a87a52', style: 'mesa' },
    ],
    backdrop: { style: 'mesas', colors: ['#b0704a', '#8e5236'], haze: '#e8c08c', cloud: '#f0d4a8' },
    props: { tuft: 0.7, shrub: 0.05, boulder: 0.06, spire: 0.02 },
    colors: { tuft: ['#b8a060', '#a08a4e'], shrub: ['#8a7a4a', '#7a6a3e'], boulder: ['#9a5e3a', '#b4744a'], spire: ['#5f7a3a', '#6a8a42'] },
  },
  ground: [
    [-70, 90], [-52, 90], [-48, 40], [-40, 18], [-28, 9], [-16, 3], [-8, 0], [8, 0], [16, 2], [28, 5], [40, 4],
    [52, 8], [64, 6], [76, 2], [88, 4], [98, 1], [106, -1], [114, -1], [122, 2], [134, 7], [146, 12], [156, 9],
    [166, 4], [176, 1], [184, -2], [194, -2], [202, 1], [214, 6], [226, 20], [234, 60], [238, 90], [260, 90],
    [260, -60], [-70, -60],
  ],
  solids: [],
  vents: [
    { x: 110, y: -1, mix: [0.6, 0.35, 0.05], burst: [3, 4] },
    { x: 189, y: -2, mix: [0.2, 0.45, 0.35], burst: [3, 5] },
  ],

  // The gale is always a headwind: its direction follows the leg of the trip, not the platform's
  // motion. Ore aboard turns it to blow from home; delivering, respawning, or 4 s with an empty
  // bucket turn it back. Tumbleweeds blow through on the wind; one that hits the bucket snags on it.
  create(K, map) {
    const { THREE, S, game, rand, clamp, lerp, G } = K;
    const GA = map.gale, WD = map.weeds;
    let leg = 'out', galeDir = -1, emptyT = 0;

    function setLeg(next, announce) {
      if (leg === next) return;
      leg = next;
      if (announce && game.state === 'play') {
        K.banner('The wind has turned', next === 'home' ? 'Headwind all the way home.' : 'Headwind all the way out.', 2.2);
        K.audio.thud(0.35, 400, 1.2);
      }
    }

    // ---- tumbleweeds
    const weeds = [];
    const wireMat = new THREE.MeshBasicMaterial({ color: 0xb08a55, wireframe: true });
    const wireDark = new THREE.MeshBasicMaterial({ color: 0x7d5f37, wireframe: true });
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x6b5233, roughness: 1, transparent: true, opacity: 0.55 });
    const geoOuter = new THREE.IcosahedronGeometry(1, 1), geoInner = new THREE.IcosahedronGeometry(0.78, 1), geoCore = new THREE.IcosahedronGeometry(0.5, 0);
    const near = [];
    let snagNoticeShown = false;

    function weedMesh() {
      const g = new THREE.Group();
      const a = new THREE.Mesh(geoOuter, wireMat), b = new THREE.Mesh(geoInner, wireDark), c = new THREE.Mesh(geoCore, coreMat);
      b.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      g.add(a, b, c);
      g.scale.setScalar(WD.r);
      K.levelGroup.add(g);
      return g;
    }
    function spawnWeed(at) {
      const dir = Math.sign(game.wind) || galeDir;
      const x = K.camTarget.x - dir * rand(50, 66); // just off-screen, upwind
      const air = Math.random() < 0.45;
      const w = { x, y: K.groundHeightAt(x) + WD.r + (air ? rand(4, 15) : 0.2), z: rand(-1.2, 1.2),
        vx: game.wind * rand(2, 3), vy: air ? rand(-1, 2) : rand(1, 4), ang: 0, caught: false, lx: 0, ly: 0, mesh: weedMesh() };
      weeds.push(Object.assign(w, at)); // `at` lets a test place one exactly
      return w;
    }
    function dropWeed(i) { K.levelGroup.remove(weeds[i].mesh); weeds.splice(i, 1); }
    function release(w) {
      // shaken loose: thrown off the top of the bucket and back into the wind
      w.caught = false;
      const c = Math.cos(S.a), s = Math.sin(S.a);
      w.x = S.x - (w.ly + 1.4) * s; w.y = S.y + (w.ly + 1.4) * c;
      w.vx = S.vx - s * 4 + game.wind; w.vy = S.vy + c * 4;
    }
    const caughtCount = () => weeds.reduce((n, w) => n + (w.caught ? 1 : 0), 0);

    function stepWeeds(dt) {
      const c = Math.cos(S.a), s = Math.sin(S.a);
      for (const w of weeds) {
        if (w.caught) {
          // rides on the bucket: its weight and the wind on it push the platform about
          S.vx += game.wind * WD.sail * dt;
          S.vy -= G * WD.m / K.SHIP_M * dt;
          continue;
        }
        // light and leafy: the wind drags it along and gravity barely holds it down
        w.vx += (game.wind * 3 - w.vx) * 1.4 * dt;
        w.vy -= G * 0.55 * dt;
        w.x += w.vx * dt; w.y += w.vy * dt;
        // bounce and hop off the ground
        for (const g of K.querySegs(w.x - WD.r, w.x + WD.r, w.y - WD.r, w.y + WD.r, near)) {
          const d2 = K.closest(w.x, w.y, g);
          if (d2 >= WD.r * WD.r) continue;
          const d = Math.sqrt(d2);
          let nx = g.nx, ny = g.ny;
          if (d > 1e-6) { nx = (w.x - K.cq.x) / d; ny = (w.y - K.cq.y) / d; }
          w.x += nx * (WD.r - d); w.y += ny * (WD.r - d);
          const vn = w.vx * nx + w.vy * ny;
          if (vn < 0) { w.vx -= 1.55 * vn * nx; w.vy -= 1.55 * vn * ny; if (ny > 0.5) w.vy += rand(1, 3.5); }
        }
        // the platform: snag on the bucket, bounce off everything else
        if (game.state !== 'play') continue;
        const hit = K.hullHit(w.x, w.y, WD.r);
        if (!hit) continue;
        const rx = hit.x - S.x, ry = hit.y - S.y;
        const rvx = w.vx - (S.vx - S.w * ry), rvy = w.vy - (S.vy + S.w * rx);
        const vn = rvx * hit.nx + rvy * hit.ny;
        w.x += hit.nx * hit.pen; w.y += hit.ny * hit.pen;
        if (vn >= 0) continue;
        // judged by where the weed is, not the exact contact: a big ball of brush that hits from above
        // deck level tangles in the bucket, pod tops and struts; one that hits from below bounces off
        const dx = w.x - S.x, dy = w.y - S.y, wlx = dx * c + dy * s, wly = -dx * s + dy * c;
        const onBucket = wly > 0.8;
        if (onBucket && caughtCount() < WD.catchMax) {
          w.caught = true;
          w.lx = clamp(wlx, -1.7, 1.7); w.ly = clamp(wly, 0.9, 2.4);
          K.audio.thud(0.25, 2600, 0.25);
          K.smokeP(w.x, w.y, 0, game.wind, 1, 0, 0.8, 0.6, 1.6, [0.7, 0.6, 0.45], 0.4, 0);
          if (!snagNoticeShown) {
            snagNoticeShown = true;
            K.banner('Tumbleweed snagged', 'It adds weight and catches the wind. Tip hard to shake it off, or land at the pad.', 3);
          }
          continue;
        }
        // bounce: equal and opposite impulse on the light weed and the heavy platform
        const rn = rx * hit.ny - ry * hit.nx;
        const J = -1.4 * vn / (1 / WD.m + 1 / K.SHIP_M + rn * rn / K.SHIP_I);
        w.vx += J * hit.nx / WD.m; w.vy += J * hit.ny / WD.m;
        S.vx -= J * hit.nx / K.SHIP_M; S.vy -= J * hit.ny / K.SHIP_M; S.w -= rn * J / K.SHIP_I;
        K.audio.thud(clamp(-vn / 30, 0.05, 0.3), 900, 0.2);
      }
      // tip hard or spin to shake snagged weeds loose
      if (Math.abs(S.w) > 2.4 || Math.abs(K.wrapAngle(S.a)) > 1.2) for (const w of weeds) if (w.caught) release(w);
    }

    return {
      get leg() { return leg; }, get galeDir() { return galeDir; }, set galeDir(v) { galeDir = v; }, setLeg, weeds, spawnWeed,
      wind(t) {
        const amp = Math.min(GA.max, GA.base + GA.perShift * (game.level - 1));
        const gust = GA.gust * (Math.sin(t * 0.9) * 0.6 + Math.sin(t * 2.3 + 1.1) * 0.4);
        return galeDir * Math.max(0, amp + gust);
      },
      afterShip(dt) { stepWeeds(dt); },
      update(dt, info) {
        // ore aboard turns the gale against you on the way home; delivering or flying empty turns it back
        if (leg === 'out' && info.bucketValue > 0 && S.x > 20) setLeg('home', true);
        if (leg === 'home') {
          emptyT = info.bucketValue > 0 ? 0 : emptyT + dt;
          if (emptyT > 4) setLeg('out', true);
        } else emptyT = 0;
        galeDir += clamp((leg === 'home' ? 1 : -1) - galeDir, -dt / 1.2, dt / 1.2);

        // keep enough weeds blowing through; the ground crew pulls snagged ones off at the pad
        const want = Math.abs(game.wind) > 1 ? Math.min(WD.max, WD.base + WD.perShift * (game.level - 1)) : 0;
        if (weeds.filter(w => !w.caught).length < want && Math.random() < dt * 1.5) spawnWeed();
        for (let i = weeds.length - 1; i >= 0; i--) {
          const w = weeds[i];
          if ((w.caught && (info.onPad || !S.alive)) || (!w.caught && (Math.abs(w.x - K.camTarget.x) > 95 || w.y < -50))) {
            if (w.caught && info.onPad) K.smokeP(w.x, w.y, 0, 0, 1, 0, 0.8, 0.6, 1.6, [0.7, 0.6, 0.45], 0.4, 0);
            if (w.caught && !S.alive) { w.caught = false; continue; }
            dropWeed(i);
          }
        }
      },
      visuals(dt) {
        const c = Math.cos(S.a), s = Math.sin(S.a);
        for (const w of weeds) {
          if (w.caught) {
            w.x = S.x + w.lx * c - w.ly * s; w.y = S.y + w.lx * s + w.ly * c;
            w.mesh.position.set(w.x, w.y, 0.3);
            w.mesh.rotation.z = S.a + w.ang;
          } else {
            w.ang -= w.vx * dt / WD.r;
            w.mesh.position.set(w.x, w.y, w.z);
            w.mesh.rotation.set(w.ang * 0.3, 0, w.ang);
          }
        }
      },
      minimap(g, MM) {
        g.fillStyle = '#c9a46a';
        for (const w of weeds) g.fillRect(MM.tx(w.x) - 1.5, MM.ty(w.y) - 1.5, 3, 3);
      },
      levelUpNote: () => 'The gale is getting stronger.',
      onDeliver() { setLeg('out', false); },
      onStart() { leg = 'out'; galeDir = -1; emptyT = 0; snagNoticeShown = false; while (weeds.length) dropWeed(0); },
      onRespawn() { leg = 'out'; galeDir = -1; emptyT = 0; for (const w of weeds) if (w.caught) w.caught = false; },
    };
  },
});
