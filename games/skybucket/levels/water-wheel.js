// The Water Wheel: a 40 m wheel blocks a cave; ride a bay over the top (where its stream fills
// the bucket) into the cave, and pour the water into the dry vent.
Skybucket.registerLevel({
  id: 'wheel', name: 'The Water Wheel',
  blurb: 'A 40 m water wheel fills the mouth of a cave in the hillside. Fly in under the overhang at its 8 o\'clock side, ride a bay up and over the top where the stream fills your bucket, then hop off inside and pour the water into the dry vent. Push a paddle to turn the wheel faster. Leave by the chimney at the back.',
  intro: 'Enter the wheel low on its left side, ride a bay into the cave and water the dry vent. Exit by the chimney.',
  world: { x0: -60, x1: 180 }, fuel: 170, wind: 0, sun: 1.2,
  quotas: [120, 300, 600, 1000, 1500], quotaStep: 600,
  cave: { x0: 50, x1: 130, y0: -5, y1: 47 },
  pipe: { x: 76, y: 40.6, rate: 10, roof: true },
  // clockwise: a bay entered at about 8 o'clock rises over the top and comes down on the cave side
  wheel: { x: 75, y: 20, r: 20, n: 8, hub: 2, base: -0.28 },
  // a lush river valley in the late afternoon: mossy rock, deep grass and tall pines
  theme: {
    sky: ['#2a65a0', '#7fb2d6', '#f0cc96'], fog: '#a4c0c4', hemi: ['#c8e0f0', '#3a4a30', 0.85],
    sun: { light: '#ffe2b0', glow: '#ffd890', x: 120, y: 80 },
    rock: { bands: ['#5e6a5c', '#6f7a68', '#55604f', '#677260'], bandsPerTile: 8, warp: 0.6, cracks: 0.4, grain: 0.45, bump: 2.2 },
    top: { colors: ['#3f6a2e', '#4f7a36', '#36602a'], streak: 0.75, bump: 1.7 },
    caveTint: '#6f7f72',
    ridges: [
      { z: -80, base: 0, amp: 18, freq: 0.025, color: '#3f5f46', style: 'hills' },
      { z: -170, base: 6, amp: 34, freq: 0.015, color: '#6f8f8a', style: 'smooth' },
    ],
    backdrop: { style: 'hills', colors: ['#8fb0b4', '#6a9070', '#4f7a4a'], trees: ['#7a9ea0', '#46703f', '#2f5a2e'], haze: '#cfe0e0', cloud: '#ffffff' },
    props: { tuft: 2.4, shrub: 0.07, spire: 0.05, boulder: 0.04 },
    colors: { tuft: ['#4f8a32', '#3f7a2a', '#6a9a3e'], shrub: ['#3f6a2e', '#4f7a36'], spire: ['#26502c', '#2f5a32'], boulder: ['#6f7a68', '#5e6a5c'] },
    caveProps: { boulder: 0.06, spire: 0.03, crystal: 0.02 },
  },
  ground: [
    [-70, 90], [-52, 90], [-48, 40], [-40, 18], [-28, 9], [-16, 3], [-8, 0], [8, 0], [14, 1], [24, 2], [40, 2.5],
    [55, 3.4], [61, 3.4], ...Skybucket.arcPts(75, 20, 20.6, 245, 340, 5), [98, 13], [108, 12.5], [116, 12.5], [122, 13], [126, 14],
    [128, 20], [128, 48], [132, 50], [150, 52], [160, 70], [162, 90], [180, 90], [180, -60], [-70, -60],
  ],
  solids: [
    // the hill: wraps the wheel from the cave mouth over the top down to the 8 o'clock entrance,
    // roofs the cave, and leaves a chimney at the back
    { depth: 18, front: 4, roof: true, pts: [
      [48, 46], [75, 48], [100, 47], [118, 46], [118, 26], [110, 27], [100, 27],
      ...Skybucket.arcPts(75, 20, 20.7, 20, 185, 5), [50, 19], [46, 26], [44, 40],
    ] },
  ],
  vents: [
    { x: 112, y: 12.5, mix: [0.6, 0.3, 0.1], burst: [3, 5], dry: true },
  ],

  // The wheel is kinematic: the stream keeps it turning at `base` rad/s (negative = clockwise).
  // Its paddles are moving collision pieces: they report their surface velocity, so a bay carries
  // the platform, ore and water around, and they feel the platform's pushes (as angular impulse),
  // which nudge the wheel faster or slower before it eases back to base speed.
  create(K, map) {
    const { THREE, clamp } = K;
    const WHEEL_I = 24000, WHEEL_RELAX = 0.6, PADDLE_TH = 0.18;
    const Wd = map.wheel;
    const W = {
      cx: Wd.x, cy: Wd.y, r: Wd.r, n: Wd.n, hub: Wd.hub, base: Wd.base, w: Wd.base, angle: 0, spin: 0,
      velAt(x, y, out) { out.svx = -W.w * (y - W.cy); out.svy = W.w * (x - W.cx); },
      impulse(x, y, Jx, Jy) { W.spin += (x - W.cx) * Jy - (y - W.cy) * Jx; },
    };
    const segs = [], verts = [];
    for (let k = 0; k < W.n * 2; k++) segs.push(K.makeSeg({ body: W, twoSided: true, th: PADDLE_TH })); // paddles, then hub chords
    for (let k = 0; k < W.n; k++) verts.push({ x: 0, y: 0, body: W, th: PADDLE_TH });
    K.DYN_SEGS.push(...segs); K.DYN_VERTS.push(...verts);
    function placeWheel() {
      for (let k = 0; k < W.n; k++) {
        const a = W.angle + k * Math.PI * 2 / W.n, c = Math.cos(a), s = Math.sin(a), a2 = a + Math.PI * 2 / W.n;
        K.setSeg(segs[k], W.cx + c * W.hub, W.cy + s * W.hub, W.cx + c * W.r, W.cy + s * W.r, true);
        K.setSeg(segs[W.n + k], W.cx + c * W.hub, W.cy + s * W.hub, W.cx + Math.cos(a2) * W.hub, W.cy + Math.sin(a2) * W.hub, true);
        verts[k].x = W.cx + c * W.r; verts[k].y = W.cy + s * W.r;
      }
    }
    placeWheel();

    // ---- meshes
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5434, roughness: 0.85 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.5, metalness: 0.7 });
    const len = W.r - W.hub;
    for (let k = 0; k < W.n; k++) {
      const a = k * Math.PI * 2 / W.n;
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(len, PADDLE_TH * 2, 6), wood);
      paddle.position.set(Math.cos(a) * (W.hub + len / 2), Math.sin(a) * (W.hub + len / 2), 0);
      paddle.rotation.z = a;
      paddle.castShadow = true; paddle.receiveShadow = true;
      g.add(paddle);
    }
    for (const z of [-3.15, 3.15]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(W.r, 0.16, 8, 64), iron);
      rim.position.z = z; g.add(rim);
      const inner = new THREE.Mesh(new THREE.TorusGeometry(W.hub, 0.14, 6, 24), iron);
      inner.position.z = z; g.add(inner);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(W.hub, W.hub, 6.6, 18), iron);
    hub.rotation.x = Math.PI / 2; g.add(hub);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 14, 10), iron);
    axle.rotation.x = Math.PI / 2; axle.position.z = -6; g.add(axle);
    g.position.set(W.cx, W.cy, 0);
    K.levelGroup.add(g);

    return {
      wheel: W,
      step(dt) {
        W.w += W.spin / WHEEL_I;
        W.spin = 0;
        W.w += (W.base - W.w) * Math.min(1, WHEEL_RELAX * dt);
        W.w = clamp(W.w, W.base * 2.2, 0.05);
        W.angle += W.w * dt;
        placeWheel();
      },
      visuals() { g.rotation.z = W.angle; },
    };
  },
});
