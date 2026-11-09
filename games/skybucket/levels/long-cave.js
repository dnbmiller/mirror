// The Long Cave: a 280 m tunnel with one rich vent at the far end, lava pools in the dips and
// lava dripping from cracks in the roof.
Skybucket.registerLevel({
  id: 'cave', name: 'The Long Cave',
  blurb: 'A 280 m tunnel of rolling hills and hanging rock, with one rich vent at the far end. Lava pools in the dips and drips from cracks in the roof, for triple damage. No wind, more fuel.',
  intro: 'The only vent is at the far end. Stay out of the lava: it does triple damage.',
  world: { x0: -60, x1: 330 }, fuel: 260, wind: 0, sun: 0.75,
  quotas: [180, 450, 850, 1400, 2100], quotaStep: 800,
  cave: { x0: 26, x1: 312 },
  // pools fill the floor's dips up to `level`; cracks drip from the roof directly above x
  lava: {
    pools: [{ x: 44, level: -1 }, { x: 92, level: -1.5 }, { x: 148, level: -2.8 }, { x: 214, level: -0.8 }],
    cracks: [58, 80, 118, 132, 156, 186, 206, 230, 248],
  },
  ground: [
    [-70, 90], [-52, 90], [-48, 40], [-40, 18], [-28, 9], [-16, 3], [-8, 0], [8, 0], [14, 1], [24, 2], [34, 0],
    [44, -2], [54, 3], [62, 8], [70, 5], [80, -1], [92, -3], [102, 2], [110, 9], [116, 11], [122, 6], [134, 0],
    [146, -4], [158, -3], [168, 4], [176, 12], [182, 13], [188, 7], [200, 1], [214, -2], [226, -1], [236, 5],
    [246, 8], [256, 3], [268, -4], [280, -6], [290, -6], [300, -2], [306, 10], [310, 40], [312, 90], [340, 90],
    [340, -60], [-70, -60],
  ],
  solids: [
    // the cave roof: its lower edge is the ceiling, with outcrops hanging down to about 12 m above the floor
    { depth: 18, front: 4, roof: true, pts: [
      [26, 100], [26, 30], [30, 22], [38, 20], [48, 19], [56, 21], [64, 22], [72, 20], [76, 13], [80, 11], [84, 18],
      [94, 19], [104, 22], [112, 24], [120, 23], [128, 17], [132, 14], [136, 16], [144, 19], [152, 15], [156, 9],
      [160, 10], [164, 17], [172, 23], [176, 26], [184, 27], [190, 24], [198, 20], [204, 13], [208, 12], [212, 18],
      [220, 20], [228, 14], [232, 16], [240, 22], [248, 23], [256, 20], [262, 24], [270, 28], [280, 30], [292, 30],
      [300, 26], [304, 22], [340, 22], [340, 100],
    ] },
  ],
  vents: [
    { x: 285, y: -6, mix: [0.15, 0.4, 0.45], burst: [4, 6] },
  ],

  // Lava pools fill the floor's dips and drips fall from roof cracks. Everything lava does is a
  // normal amount times LAVA_MULT: crash damage on a lava floor, a drip hit, and the pool burn.
  // Easter egg: a drip caught on gold forges it, doubling its value at the same weight.
  create(K, map) {
    const { THREE, S, game, cargo, rand, clamp, G } = K;
    const LAVA_MULT = 3, LAVA_BURN_BASE = 12, DRIP_BASE = 8, DRIP_R = 0.32;

    // ---- data
    const pools = map.lava.pools.map(d => {
      let x0 = d.x, x1 = d.x;
      while (K.groundHeightAt(x0 - 0.1) < d.level) x0 -= 0.1;
      while (K.groundHeightAt(x1 + 0.1) < d.level) x1 += 0.1;
      return { x0, x1, level: d.level };
    });
    const cracks = map.lava.cracks.map(x => ({ x, y: K.roofAt(x), state: 'idle', t: rand(1, 6) }));
    const drips = [];
    const lavaAt = (x, y) => pools.find(p => x > p.x0 && x < p.x1 && y < p.level) || null;

    // ---- meshes
    const lavaTex = K.canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#c2280c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * w, y = Math.random() * h, r = rand(8, 34);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,236,140,0.95)'); gr.addColorStop(0.45, 'rgba(255,140,30,0.7)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      g.strokeStyle = 'rgba(40,10,8,0.55)'; g.lineWidth = 2;
      for (let i = 0; i < 26; i++) {
        let x = Math.random() * w, y = Math.random() * h;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 5; k++) { x += rand(-22, 22); y += rand(-22, 22); g.lineTo(x, y); }
        g.stroke();
      }
    });
    lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
    lavaTex.repeat.set(1 / 7, 1 / 7);
    const lavaMat = new THREE.MeshBasicMaterial({ map: lavaTex, side: THREE.DoubleSide });
    const crackMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
    const crackGlowMat = new THREE.SpriteMaterial({ map: K.sunSprite.material.map, color: 0xff6a1a,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 });
    const dripGeo = new THREE.SphereGeometry(DRIP_R, 12, 8);
    const dripMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
    const lights = [];
    for (const p of pools) {
      // flat molten surface across the play depth
      const top = new THREE.ShapeGeometry(new THREE.Shape([
        new THREE.Vector2(p.x0, -4), new THREE.Vector2(p.x1, -4), new THREE.Vector2(p.x1, 3.8), new THREE.Vector2(p.x0, 3.8)]));
      top.rotateX(-Math.PI / 2);
      const tm = new THREE.Mesh(top, lavaMat);
      tm.position.y = p.level;
      K.levelGroup.add(tm);
      // cross-section on the terrain's front face, so the pool reads as filling the dip
      const pts = [new THREE.Vector2(p.x0, p.level), new THREE.Vector2(p.x1, p.level)];
      for (let x = p.x1; x > p.x0; x -= 0.5) pts.push(new THREE.Vector2(x, K.groundHeightAt(x)));
      const fm = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), lavaMat);
      fm.position.z = 4.02;
      K.levelGroup.add(fm);
      const light = new THREE.PointLight(0xff6a20, 2.4, 26, 2);
      light.position.set((p.x0 + p.x1) / 2, p.level + 2.5, 1.5);
      K.levelGroup.add(light);
      lights.push(light);
    }
    for (const k of cracks) {
      const g = new THREE.Group();
      g.position.set(k.x, k.y, 0);
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(rand(1, 2.2), 0.12, 0.2), crackMat);
        seg.position.set(rand(-0.5, 0.5), -0.03, rand(-2.5, 2.5));
        seg.rotation.y = rand(-1.2, 1.2);
        g.add(seg);
      }
      k.glow = new THREE.Sprite(crackGlowMat.clone());
      k.glow.scale.setScalar(3); k.glow.position.set(0, -0.2, 1.2);
      g.add(k.glow);
      k.bead = new THREE.Mesh(dripGeo, dripMat);
      k.bead.position.y = -0.15; k.bead.scale.setScalar(0.001);
      g.add(k.bead);
      K.levelGroup.add(g);
    }

    function clearDrips() {
      for (const d of drips) K.levelGroup.remove(d.mesh);
      drips.length = 0;
    }
    function forgeGold(o) {
      if (o.forged) return;
      o.forged = true;
      o.value *= 2;
      const m = o.mesh.material;
      m.color.setHex(0xffb060); m.emissive.setHex(0xff5a14); m.emissiveIntensity = 0.7;
      K.sparkBurst(o.x, o.y, 0xffc93a, 22, 6);
      K.popText(`Lava-forged gold · ${o.value} cr`, o.x, o.y + 0.9);
      [880, 1109, 1319, 1760].forEach((f, i) => setTimeout(() => K.audio.tone(f, 0.22, 'triangle', 0.1), i * 70));
    }
    let burnT = 0;
    function burn(dt) {
      if (game.state !== 'play') return;
      K.drainHull(LAVA_BURN_BASE * LAVA_MULT * dt);
      burnT -= dt;
      if (burnT <= 0) {
        burnT = 0.3;
        game.shake = Math.max(game.shake, 0.35);
        K.audio.thud(0.28, 1500, 0.35);
        K.flashHull();
        for (let i = 0; i < 6; i++) K.fireP(S.x + rand(-3, 3), S.y - 0.6, rand(-1, 1), rand(-1, 1), rand(2, 5), 0, rand(0.3, 0.6), 0.7, 0.2, true);
      }
    }
    function stepDrips(dt) {
      for (const d of drips) {
        if (d.dead) continue;
        d.vy -= G * dt; d.y += d.vy * dt;
        // gold catches drips before the hull does
        for (const o of cargo) {
          if (o.gone || o.t !== 2) continue;
          const R = DRIP_R + o.r;
          if ((d.x - o.x) ** 2 + (d.y - o.y) ** 2 < R * R) { d.dead = 'gold'; forgeGold(o); break; }
        }
        if (d.dead) continue;
        if (K.hullHit(d.x, d.y, DRIP_R)) {
          d.dead = 'ship';
          if (game.state === 'play') { K.damageShip(DRIP_BASE * LAVA_MULT); K.audio.thud(0.3, 1600, 0.4); }
          continue;
        }
        if (lavaAt(d.x, d.y)) { d.dead = 'pool'; continue; }
        if (d.y > d.y0 - 1) continue; // still clearing the crack it fell from
        for (const g of K.querySegs(d.x - DRIP_R, d.x + DRIP_R, d.y - DRIP_R, d.y + DRIP_R, near)) {
          if (K.closest(d.x, d.y, g) < DRIP_R * DRIP_R) { d.dead = 'rock'; break; }
        }
      }
    }
    const near = [];

    return {
      pools, cracks, drips, lavaAt,
      impactMult: (x, y) => lavaAt(x, y + 0.01) ? LAVA_MULT : 1,
      afterShip(dt) {
        if (S.alive) {
          const c = Math.cos(S.a), s = Math.sin(S.a);
          for (const p of K.PTS) {
            if (lavaAt(S.x + p.x * c - p.y * s, S.y + p.x * s + p.y * c - K.PR)) { burn(dt); break; }
          }
        }
        if (drips.length) stepDrips(dt);
      },
      cargoHazard(o) {
        if (!lavaAt(o.x, o.y - o.r)) return false;
        if (o.t === K.WATER) { K.smokeP(o.x, o.y, o.z, 0, 1, 0, 0.6, 0.3, 0.9, [0.8, 0.8, 0.8], 0.4); return true; }
        K.sparkBurst(o.x, o.y, 0xff7a2e, 12, 4);
        K.smokeP(o.x, o.y, o.z, 0, 2, 0, 1.2, 0.5, 2, [0.35, 0.3, 0.3], 0.6);
        if (Math.abs(o.x - S.x) < 30) K.audio.thud(0.15, 1800, 0.3);
        return true;
      },
      // never set a flipped platform down beside or over a pool, where a slope or a slip would put it in
      unsafeSpot: (x, y) => pools.some(p => x + 5.6 > p.x0 && x - 5.6 < p.x1 && y - p.level < 8),
      update(dt) {
        // cracks swell and drop drips near the platform
        for (const k of cracks) {
          k.t -= dt;
          if (k.state === 'idle') {
            k.glow.material.opacity = 0.45 + Math.sin(game.time * 2 + k.x) * 0.1;
            k.glow.scale.setScalar(3);
            if (k.t <= 0) {
              if (Math.abs(S.x - k.x) < 45) { k.state = 'warn'; k.t = 1.1; } else k.t = 1;
            }
          } else {
            const grow = 1 - k.t / 1.1;
            k.bead.scale.setScalar(Math.max(0.001, grow));
            k.glow.material.opacity = 0.55 + grow * 0.45;
            k.glow.scale.setScalar(3 + grow * 3);
            if (Math.random() < dt * 8) K.fireP(k.x + rand(-0.4, 0.4), k.y - 0.1, rand(-1, 1), 0, -rand(0.5, 2), 0, rand(0.3, 0.6), 0.25, 0.1, true);
            if (k.t <= 0) {
              const mesh = new THREE.Mesh(dripGeo, dripMat);
              K.levelGroup.add(mesh);
              drips.push({ x: k.x, y: k.y - DRIP_R - 0.1, y0: k.y, vy: 0, mesh, dead: false });
              k.bead.scale.setScalar(0.001);
              k.state = 'idle'; k.t = rand(4, 9);
            }
          }
        }
        for (let i = drips.length - 1; i >= 0; i--) {
          const d = drips[i];
          if (d.dead) {
            const n = d.dead === 'ship' ? 26 : 14;
            for (let k = 0; k < n; k++) K.fireP(d.x, d.y, rand(-0.5, 0.5), rand(-4, 4), rand(1, 5), rand(-1, 1), rand(0.3, 0.7), 0.5, 0.1, true);
            K.smokeP(d.x, d.y, 0, 0, 1.5, 0, 1, 0.6, 2.2, [0.3, 0.26, 0.26], 0.5);
            K.levelGroup.remove(d.mesh);
            drips.splice(i, 1);
            continue;
          }
          d.mesh.position.set(d.x, d.y, 0);
          d.mesh.scale.set(1, 1 + Math.min(1, -d.vy / 10), 1);
          if (Math.random() < 0.6) K.fireP(d.x, d.y + 0.2, rand(-0.2, 0.2), 0, d.vy * 0.3, 0, 0.25, 0.35, 0.05, false);
          if (d.y < -60) { K.levelGroup.remove(d.mesh); drips.splice(i, 1); }
        }
        // pools glow and spit embers
        lavaTex.offset.x = (lavaTex.offset.x + dt * 0.012) % 1;
        lavaTex.offset.y = Math.sin(game.time * 0.2) * 0.05;
        pools.forEach((p, i) => {
          lights[i].intensity = 2.1 + Math.sin(game.time * 3 + i * 2) * 0.35 + Math.random() * 0.25;
          if (Math.abs(S.x - p.x0) < 70 && Math.random() < dt * (p.x1 - p.x0) * 0.5) {
            K.fireP(rand(p.x0, p.x1), p.level + 0.05, rand(-3, 3.5), rand(-0.4, 0.4), rand(1, 3.5), 0, rand(0.5, 1.1), 0.3, 0.05, Math.random() < 0.3);
          }
        });
        // forged gold keeps a molten glow
        for (const o of cargo) {
          if (o.gone || !o.forged) continue;
          o.mesh.material.emissiveIntensity = 0.6 + Math.sin(game.time * 4 + o.x) * 0.2;
          if (Math.random() < dt * 3) K.fireP(o.x + rand(-0.2, 0.2), o.y + 0.2, o.z, 0, rand(0.5, 1.5), 0, rand(0.3, 0.6), 0.25, 0.05, true);
        }
      },
      minimapBase(g, MM) {
        g.fillStyle = '#ff5a14';
        for (const p of pools) g.fillRect(MM.tx(p.x0), MM.ty(p.level), (p.x1 - p.x0) * MM.s, Math.max(3, (p.level - K.groundHeightAt((p.x0 + p.x1) / 2)) * MM.s));
      },
      onStart() {
        clearDrips();
        for (const k of cracks) { k.state = 'idle'; k.t = rand(1, 6); k.bead.scale.setScalar(0.001); }
      },
    };
  },
});
