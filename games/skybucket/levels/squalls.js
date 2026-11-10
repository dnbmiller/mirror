// Squalls: rain comes in squalls between calm spells. Raindrops near the platform are real water
// that fills an open bucket and weighs it down; rock outcrops along the route give shelter, and the
// rain that lands on them runs off, drips over the edges and soaks into the ground.
Skybucket.registerLevel({
  id: 'squalls', name: 'Squalls',
  blurb: 'Rain sweeps in as squalls between calm spells. It fills an open bucket and weighs it down, so shelter under the rock outcrops, or tip the water out. Squalls grow longer and heavier every shift.',
  intro: 'Squalls fill your bucket with rain. Shelter under the outcrops, or tip the water out.',
  world: { x0: -60, x1: 260 }, fuel: 150, wind: 0, sun: 1.05,
  quotas: [120, 300, 600, 1000, 1500], quotaStep: 600,
  soak: 1.2, // water lingers long enough to run off the outcrops before soaking in
  // squall timing in seconds; heavier and longer each shift (perShift), drop rate in drops/s near the platform
  rain: { calm: [12, 18], squall: [9, 13], perShift: 1.2, rate: 24, rateMax: 40, cap: 110 },
  ground: [
    [-70, 90], [-52, 90], [-48, 40], [-40, 18], [-28, 9], [-16, 3], [-8, 0], [8, 0], [16, 1.5], [26, 3], [34, 6],
    [40, 7], [48, 4], [58, 1], [66, -1], [74, -1], [82, 1], [92, 2], [100, 2], [110, 4], [120, 2], [130, 0],
    [138, -2], [146, -2], [154, 1], [166, 5], [176, 4], [186, 1], [194, -1], [202, -1], [210, 2], [222, 8],
    [232, 30], [238, 80], [242, 90], [260, 90], [260, -60], [-70, -60],
  ],
  solids: [
    // a rock arm reaching out from the hill past the pad
    { depth: 9, front: 3.2, pts: [[36, 6.2], [40, 6.6], [42, 14], [56, 15.5], [58, 17.5], [44, 18.5], [36, 16]] },
    // a mushroom cap on a stem beside the first vent
    { depth: 9, front: 3.2, pts: [[86, 0.8], [88, 1], [88.5, 12.5], [96, 13], [98, 15], [90, 16.5], [80, 16], [77, 14], [85.5, 12.5]] },
    // a floating slab between the first two vents
    { depth: 9, front: 3.2, pts: [[116, 13], [132, 12.5], [135, 14.5], [124, 16], [114, 15]] },
    // an overhang off the hill past the second vent
    { depth: 9, front: 3.2, pts: [[164, 4], [168, 5.2], [168, 15], [160, 17], [148, 16.5], [150, 14], [162, 13.5]] },
    // a mushroom cap beside the far vent
    { depth: 9, front: 3.2, pts: [[212, 3.6], [214, 4.6], [214.5, 15], [221, 16], [223, 18], [214, 19.5], [205, 19], [203, 17], [211.5, 15]] },
  ],
  vents: [
    { x: 70, y: -1, mix: [0.7, 0.3, 0], burst: [2, 4] },
    { x: 142, y: -2, mix: [0.4, 0.45, 0.15], burst: [3, 4] },
    { x: 198, y: -1, mix: [0.2, 0.45, 0.35], burst: [3, 5] },
  ],

  create(K, map) {
    const { THREE, S, game, cargo, rand, clamp, lerp } = K;
    const RN = map.rain;
    // phase: calm -> warn (sky darkens, thunder) -> squall -> easing -> calm
    let phase = 'calm', t = rand(6, 10), intensity = 0.08, target = 0.08, acc = 0;

    // ---- visual rain: streaks across the whole view that stop at the first rock below them
    const N = 520, LEN = 1.3;
    const pos = new Float32Array(N * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xa9c8e6, transparent: true, opacity: 0.55, depthWrite: false }));
    lines.frustumCulled = false;
    K.levelGroup.add(lines);
    const streaks = Array.from({ length: N }, () => ({ x: 0, y: -999, z: 0, stop: -999, live: false }));
    function respawn(st, spread) {
      st.x = K.camTarget.x + rand(-65, 65);
      st.y = K.camTarget.y + (spread ? rand(-30, 40) : rand(30, 40));
      st.z = rand(-7, 3.5);
      const hit = K.raycast(st.x, st.y, 0, -1, 90);
      st.stop = hit ? hit.y : -60;
      // a streak that starts inside rock (under cover) never shows
      st.live = !(hit && hit.t < 0.01) && !insideRock(st.x, st.y);
    }
    const polys = [map.ground, ...map.solids.map(sd => sd.pts)];
    function insideRock(x, y) {
      return polys.some(pts => {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
      });
    }
    // is there open sky straight above this point?
    const openSky = (x, y) => !insideRock(x, y) && !K.raycast(x, y, 0, 1, 120);

    const rainDrops = () => cargo.reduce((n, o) => n + (!o.gone && o.rain ? 1 : 0), 0);
    const shiftBoost = () => game.level - 1;

    return {
      get phase() { return phase; }, get intensity() { return intensity; },
      update(dt, info) {
        // ---- squall cycle
        t -= dt;
        if (t <= 0) {
          if (phase === 'calm') {
            phase = 'warn'; t = 3.5; target = 0.25;
            if (game.state === 'play') K.banner('Squall coming', 'Find shelter under the rock, or tip the water out after.', 2.6);
            K.audio.thud(0.5, 55, 2.5);
          } else if (phase === 'warn') {
            phase = 'squall'; t = rand(RN.squall[0], RN.squall[1]) + shiftBoost() * RN.perShift; target = 1;
            K.audio.thud(0.6, 45, 3);
          } else if (phase === 'squall') {
            phase = 'easing'; t = 3; target = 0.3;
          } else {
            phase = 'calm'; t = Math.max(6, rand(RN.calm[0], RN.calm[1]) - shiftBoost()); target = 0.08;
          }
        }
        intensity = lerp(intensity, target, 1 - Math.exp(-dt * 1.2));
        K.setSkyShade(intensity * 0.55);
        K.sun.intensity = map.sun * (1 - intensity * 0.55);
        if (phase === 'squall' && Math.random() < dt * 0.15) K.audio.thud(0.35, 50, 2.5); // distant thunder

        // ---- physical drops near the platform, only where the sky is open above them
        const rate = Math.min(RN.rateMax, RN.rate + shiftBoost() * 4) * Math.max(0, (intensity - 0.15) / 0.85);
        acc += rate * dt;
        let n = rainDrops();
        while (acc >= 1) {
          acc--;
          if (n >= RN.cap) continue;
          const x = S.x + rand(-9, 9), y = S.y + rand(10, 15);
          if (!openSky(x, y)) continue;
          const o = K.spawnWater(x, y);
          o.vx = 0; o.vy = rand(-14, -10); o.rain = true;
          n++;
        }

        // ---- the ground crew drains the bucket at the pad
        if (info.onPad) for (const o of cargo) if (!o.gone && o.t === K.WATER && o.inBucket) K.removeCargo(o);
      },
      visuals(dt) {
        if (!dt) return;
        const want = Math.round(N * clamp(intensity, 0, 1));
        for (let i = 0; i < N; i++) {
          const st = streaks[i], o = i * 6;
          if (st.y <= st.stop || !st.live) {
            // landed: a little splash, then start again at the top (only as many streaks as the rain needs)
            if (st.live && st.stop > -59 && Math.random() < 0.06) K.smokeP(st.x, st.stop + 0.1, st.z, 0, 0.6, 0, 0.35, 0.25, 0.6, [0.75, 0.85, 0.95], 0.3, 0);
            if (i < want) { respawn(st, !st.started); st.started = true; } else st.live = false;
          }
          if (!st.live) { pos[o + 1] = pos[o + 4] = -999; continue; }
          st.y -= 24 * dt;
          pos[o] = st.x; pos[o + 1] = st.y + LEN; pos[o + 2] = st.z;
          pos[o + 3] = st.x - 0.08; pos[o + 4] = Math.max(st.y, st.stop); pos[o + 5] = st.z;
        }
        geo.attributes.position.needsUpdate = true;
      },
      levelUpNote: () => 'Squalls are getting heavier.',
      onStart() { phase = 'calm'; t = rand(6, 10); target = intensity = 0.08; },
      destroy() { K.setSkyShade(0); },
    };
  },
});
