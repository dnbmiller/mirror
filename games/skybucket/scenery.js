// Skybucket scenery: how each level looks. Visual only: nothing here touches collision or physics.
//
// A level's `theme` (see DESIGN.md) sets its sky, fog and light; generated rock and ground textures
// (tileable, with a bump map for surface detail); a painted backdrop and background ridges; props and
// grass along the top edges; and how rough the visible rock outline is. Everything is generated in
// code and cached per level, so there are no image files to download. A theme can name a real image
// for its backdrop instead (`backdrop.image`), with the painted one as a fallback.
(() => {
'use strict';

const LOW = Math.min(screen.width, screen.height) < 820 || /Mobi|Android/i.test(navigator.userAgent);
const TEX = LOW ? 256 : 512;                         // rock and ground texture size
const BACK_W = LOW ? 1024 : 2048, BACK_H = BACK_W / 4; // painted backdrop size
const PROP_DENSITY = LOW ? 0.55 : 1;
const cache = new Map();                             // generated canvases, per level id

// ---------------------------------------------------------------- theme defaults (the original dusk look)
const DEFAULT = {
  sky: ['#0b1a33', '#35507a', '#e59a68'],
  fog: '#b88a8a',
  hemi: ['#b9d3ff', '#4a3530', 0.75],
  sun: { light: '#ffd2a6', glow: '#ffd296', x: 60, y: 70 },
  rock: { bands: ['#4c3b44', '#6e5548', '#8a6c56', '#5d4a4c'], bandsPerTile: 8, warp: 0.6, cracks: 0.5, grain: 0.35, bump: 2.2 },
  top: { colors: ['#7d6b43', '#8f7c4e', '#6a5a38'], streak: 0.5, bump: 1.4 },
  caveTint: '#9a8a92',
  ridges: [
    { z: -80, base: 2, amp: 22, freq: 0.03, color: '#4c3f55', style: 'smooth' },
    { z: -170, base: 8, amp: 40, freq: 0.016, color: '#6e5a6f', style: 'jagged' },
  ],
  backdrop: { style: 'mountains', colors: ['#9a7b84', '#b48f8f', '#cfa79a'], haze: '#e0a988', cloud: '#f2c4a8' },
  edge: 0.3, // how far (m) the visible rock outline may wander inside the collision outline
  props: { tuft: 1.6, boulder: 0.05, shrub: 0.04 },
  colors: { tuft: ['#a0894c', '#86733e', '#b49a58'], boulder: ['#6d5a52', '#857064', '#5c4c47'], shrub: ['#5d6a3a', '#717c45'],
    spire: ['#5a4a46', '#6b5850'], crystal: ['#5ff2ff', '#ff4fd8'] },
  caveProps: { boulder: 0.05, spire: 0.035, crystal: 0.03 },
};
function themeOf(map) {
  const t = Object.assign({}, DEFAULT, map.theme || {});
  t.colors = Object.assign({}, DEFAULT.colors, (map.theme || {}).colors || {});
  return t;
}

// ---------------------------------------------------------------- noise
function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function lattice(seed) { const r = rng(seed), t = new Float32Array(65536); for (let i = 0; i < t.length; i++) t[i] = r(); return t; }
// value noise that tiles with period P (lattice cells); P doubles per octave and must stay <= 256
function vnoise(t, x, y, P) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const x0 = ((xi % P) + P) % P, y0 = ((yi % P) + P) % P, x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = t[y0 * 256 + x0], b = t[y0 * 256 + x1], c = t[y1 * 256 + x0], d = t[y1 * 256 + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbmT(t, x, y, P, oct) {
  let s = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < oct; o++) { s += amp * vnoise(t, x, y, P); norm += amp; x *= 2; y *= 2; P *= 2; amp *= 0.5; }
  return s / norm;
}
const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mod = (a, n) => ((a % n) + n) % n;
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// a bump map's slopes turned into a normal map (tiles, like the height field)
function normalCanvas(H, N, strength) {
  const c = canvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const dx = (H[j * N + mod(i + 1, N)] - H[j * N + mod(i - 1, N)]) * strength;
    const dy = (H[mod(j + 1, N) * N + i] - H[mod(j - 1, N) * N + i]) * strength;
    const l = Math.hypot(dx, dy, 1), o = (j * N + i) * 4;
    d[o] = (-dx / l * 0.5 + 0.5) * 255; d[o + 1] = (dy / l * 0.5 + 0.5) * 255; d[o + 2] = (1 / l * 0.5 + 0.5) * 255; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------- rock (terrain front faces)
// horizontal strata in the theme's palette, warped, with grain, cracks and a bump map
function rockCanvases(R, seed, N) {
  const t = lattice(seed), t2 = lattice(seed + 7), t3 = lattice(seed + 13);
  const pal = R.bands.map(rgb), L = pal.length;
  const bands = L * Math.max(1, Math.round(R.bandsPerTile / L)); // a whole number of palette cycles per tile
  const c = canvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    const v = j / N;
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const warp = (fbmT(t, u * 4, v * 4, 4, 3) - 0.5) * R.warp;
      const b = (v + warp * 0.18) * bands, k = Math.floor(b), f = b - k;
      const c0 = pal[mod(k, L)], c1 = pal[mod(k + 1, L)], s = smooth(0.82, 1, f);
      const detail = fbmT(t2, u * 16, v * 16, 16, 4);
      const grain = vnoise(t3, u * 128, v * 128, 128);
      const ridge = 1 - Math.abs(fbmT(t3, u * 8, v * 8, 8, 3) * 2 - 1);
      const crack = smooth(1 - R.cracks * 0.06, 1, ridge);
      const shade = 0.7 + detail * 0.5 + (grain - 0.5) * R.grain * 0.5 - crack * 0.45 - smooth(0.9, 1, f) * 0.08;
      const o = (j * N + i) * 4;
      d[o] = Math.min(255, (c0[0] + (c1[0] - c0[0]) * s) * shade);
      d[o + 1] = Math.min(255, (c0[1] + (c1[1] - c0[1]) * s) * shade);
      d[o + 2] = Math.min(255, (c0[2] + (c1[2] - c0[2]) * s) * shade);
      d[o + 3] = 255;
      H[j * N + i] = detail * 0.7 + grain * 0.12 + f * 0.12 - crack * 0.6;
    }
  }
  g.putImageData(img, 0, 0);
  return [c, normalCanvas(H, N, R.bump * N / 256)];
}
// ---------------------------------------------------------------- ground tops (seen edge-on along the surface)
function topCanvases(T, seed, N) {
  const t = lattice(seed), t2 = lattice(seed + 5);
  const pal = T.colors.map(rgb), L = pal.length;
  const c = canvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N, v = j / N;
    const patch = fbmT(t, u * 4, v * 4, 4, 3) * (L - 1);
    const k = Math.min(L - 2, Math.floor(patch)), f = patch - k;
    const streak = vnoise(t2, u * 128, v * 16, 128) * T.streak + vnoise(t2, u * 64 + 3, v * 64, 64) * (1 - T.streak);
    const shade = 0.75 + streak * 0.45;
    const o = (j * N + i) * 4, a = pal[Math.max(0, k)], b = pal[Math.min(L - 1, k + 1)];
    for (let ch = 0; ch < 3; ch++) d[o + ch] = Math.min(255, (a[ch] + (b[ch] - a[ch]) * f) * shade);
    d[o + 3] = 255;
    H[j * N + i] = streak;
  }
  g.putImageData(img, 0, 0);
  return [c, normalCanvas(H, N, T.bump * N / 256)];
}

// ---------------------------------------------------------------- painted backdrops
// Shapes are drawn three times (x - W, x, x + W) so the painting tiles left to right.
function periodic(r, W, n, rough = 0.9) {
  const terms = [];
  for (let k = 1; k <= n; k++) terms.push([k, (r() + 0.3) / Math.pow(k, rough), r() * Math.PI * 2]);
  const norm = terms.reduce((s, q) => s + q[1], 0);
  return x => terms.reduce((s, [k, a, p]) => s + a * Math.sin(Math.PI * 2 * k * x / W + p), 0) / norm;
}
function silhouette(g, W, H, f, base, amp, color, sharp = 0) {
  g.fillStyle = color;
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 4) {
    let y = f(x);
    if (sharp) y = y * (1 - sharp) + (1 - 2 * Math.abs(y)) * sharp;
    g.lineTo(x, H - (base + amp * (y * 0.5 + 0.5)) * H);
  }
  g.lineTo(W, H); g.closePath(); g.fill();
}
function haze(g, W, H, color, from, to) {
  const gr = g.createLinearGradient(0, H * (1 - to), 0, H * (1 - from));
  gr.addColorStop(0, color + '00'); gr.addColorStop(1, color + 'cc');
  g.fillStyle = gr; g.fillRect(0, H * (1 - to), W, H * (to - from));
}
function blob(g, W, x, y, r, color, alpha) {
  for (const ox of [-W, 0, W]) {
    const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
    gr.addColorStop(0, color + Math.round(alpha * 255).toString(16).padStart(2, '0')); gr.addColorStop(1, color + '00');
    g.fillStyle = gr; g.fillRect(x + ox - r, y - r, r * 2, r * 2);
  }
}
const PAINT = {
  // layered peaks fading into haze, with soft clouds
  mountains(g, W, H, B, r) {
    for (let i = 0; i < 16; i++) blob(g, W, r() * W, H * (0.08 + r() * 0.3), H * (0.08 + r() * 0.12), B.cloud, 0.22);
    B.colors.forEach((col, i) => {
      silhouette(g, W, H, periodic(r, W, 14, 0.8), 0.18 - i * 0.05, 0.55 - i * 0.12, col, 0.45);
      haze(g, W, H, B.haze, 0, 0.22 - i * 0.05);
    });
  },
  // flat-topped buttes with strata, dusty haze
  mesas(g, W, H, B, r) {
    for (let i = 0; i < 8; i++) blob(g, W, r() * W, H * (0.5 + r() * 0.3), H * 0.25, B.cloud, 0.18);
    B.colors.forEach((col, layer) => {
      const n = 7 + layer * 4, scale = 1 - layer * 0.3;
      for (let i = 0; i < n; i++) {
        const cx = r() * W, w = W * (0.04 + r() * 0.08) * scale, h = H * (0.25 + r() * 0.35) * scale, lean = w * 0.12;
        for (const ox of [-W, 0, W]) {
          g.fillStyle = col;
          g.beginPath(); g.moveTo(cx + ox - w - lean, H); g.lineTo(cx + ox - w, H - h); g.lineTo(cx + ox + w, H - h); g.lineTo(cx + ox + w + lean, H); g.fill();
          g.fillStyle = 'rgba(255,240,220,0.08)';
          for (let s = 1; s < 5; s++) g.fillRect(cx + ox - w, H - h + s * h / 5, w * 2, Math.max(1, h * 0.02));
        }
      }
      haze(g, W, H, B.haze, 0, 0.25 - layer * 0.08);
    });
  },
  // smoking volcanoes against a red horizon
  volcano(g, W, H, B, r) {
    const glow = g.createLinearGradient(0, H * 0.3, 0, H);
    glow.addColorStop(0, B.haze + '00'); glow.addColorStop(1, B.haze + 'aa');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    silhouette(g, W, H, periodic(r, W, 18, 0.7), 0.12, 0.3, B.colors[0], 0.6);
    for (let v = 0; v < 2; v++) {
      const cx = W * (0.2 + v * 0.5 + r() * 0.1), w = W * 0.13, h = H * (0.62 + r() * 0.15);
      for (let p = 0; p < 26; p++) blob(g, W, cx + p * W * 0.006 + r() * 30, H - h - p * H * 0.035, H * (0.07 + p * 0.004), B.cloud, 0.3);
      for (const ox of [-W, 0, W]) {
        g.fillStyle = B.colors[1];
        g.beginPath(); g.moveTo(cx + ox - w * 1.6, H);
        g.quadraticCurveTo(cx + ox - w * 0.3, H - h * 0.6, cx + ox - w * 0.12, H - h);
        g.lineTo(cx + ox + w * 0.12, H - h);
        g.quadraticCurveTo(cx + ox + w * 0.3, H - h * 0.6, cx + ox + w * 1.6, H); g.fill();
        g.strokeStyle = 'rgba(255,120,40,0.7)'; g.lineWidth = Math.max(1, W / 900);
        for (let l = 0; l < 4; l++) {
          const dx = (r() - 0.5) * w * 0.2;
          g.beginPath(); g.moveTo(cx + ox + dx, H - h);
          g.quadraticCurveTo(cx + ox + dx * 3 + (r() - 0.5) * w, H - h * 0.5, cx + ox + dx * 6 + (r() - 0.5) * w, H - h * (0.1 + r() * 0.3));
          g.stroke();
        }
      }
      blob(g, W, cx, H - h, H * 0.08, '#ffb060', 0.8);
    }
    silhouette(g, W, H, periodic(r, W, 20, 0.7), 0.02, 0.14, B.colors[2], 0.5);
  },
  // rolling green hills lined with trees, puffy clouds
  hills(g, W, H, B, r) {
    for (let i = 0; i < 10; i++) {
      const x = r() * W, y = H * (0.12 + r() * 0.25), s = H * (0.05 + r() * 0.06);
      for (let k = 0; k < 6; k++) blob(g, W, x + (r() - 0.5) * s * 4, y + (r() - 0.5) * s, s * (0.8 + r()), B.cloud, 0.5);
    }
    B.colors.forEach((col, i) => {
      const f = periodic(r, W, 6, 1.1), base = 0.12 - i * 0.04, amp = 0.32 - i * 0.07;
      silhouette(g, W, H, f, base, amp, col);
      const tree = B.trees ? B.trees[i] : col;
      g.fillStyle = tree;
      for (let x = 0; x < W; x += 3 + r() * (10 - i * 2)) {
        if (r() < 0.35) continue;
        const y = H - (base + amp * (f(x) * 0.5 + 0.5)) * H, th = H * (0.02 + r() * 0.03) * (1 + i * 0.5);
        g.beginPath(); g.moveTo(x - th * 0.3, y + 1); g.lineTo(x, y - th); g.lineTo(x + th * 0.3, y + 1); g.fill();
      }
      haze(g, W, H, B.haze, 0, 0.25 - i * 0.06);
    });
  },
  // hazy mountains with mine headframes, chimneys and lit windows
  industrial(g, W, H, B, r) {
    silhouette(g, W, H, periodic(r, W, 12, 0.8), 0.25, 0.4, B.colors[0], 0.4);
    haze(g, W, H, B.haze, 0, 0.4);
    silhouette(g, W, H, periodic(r, W, 8, 1), 0.05, 0.14, B.colors[1]);
    const col = B.colors[2];
    for (let i = 0; i < 9; i++) {
      const x = r() * W, base = H * 0.88;
      for (const ox of [-W, 0, W]) {
        g.fillStyle = col; g.strokeStyle = col; g.lineWidth = Math.max(1, W / 1200);
        const kind = i % 3;
        if (kind === 0) { // headframe
          const h = H * (0.3 + r() * 0.15), w = H * 0.08;
          g.beginPath(); g.moveTo(x + ox - w, base); g.lineTo(x + ox, base - h); g.lineTo(x + ox + w, base); g.stroke();
          for (let s = 1; s < 5; s++) { g.beginPath(); g.moveTo(x + ox - w * (1 - s / 5), base - h * s / 5); g.lineTo(x + ox + w * (1 - s / 5), base - h * s / 5); g.stroke(); }
          g.beginPath(); g.arc(x + ox, base - h, w * 0.4, 0, Math.PI * 2); g.stroke();
        } else if (kind === 1) { // chimney and smoke
          const h = H * (0.35 + r() * 0.2), w = H * 0.025;
          g.fillRect(x + ox - w, base - h, w * 2, h);
          for (let p = 0; p < 10; p++) blob(g, W, x + ox + p * H * 0.03, base - h - p * H * 0.04, H * (0.03 + p * 0.006), B.cloud, 0.25);
        } else { // sheds with lit windows
          const w = H * (0.1 + r() * 0.1), h = H * (0.05 + r() * 0.05);
          g.fillRect(x + ox - w / 2, base - h, w, h);
          g.fillStyle = '#ffcf6a';
          for (let wx = 0; wx < 6; wx++) if (r() < 0.6) g.fillRect(x + ox - w / 2 + (wx + 0.5) * w / 6, base - h * 0.6, Math.max(1, w * 0.04), Math.max(1, h * 0.15));
        }
      }
    }
    g.fillStyle = col; g.fillRect(0, H * 0.88, W, H * 0.12);
  },
  // heavy cloud banks trailing curtains of rain over dark hills
  storm(g, W, H, B, r) {
    for (let i = 0; i < 40; i++) blob(g, W, r() * W, H * (0.05 + r() * 0.4), H * (0.1 + r() * 0.15), B.cloud, 0.35);
    // curtains of rain: bundles of fine slanting strokes that fade toward the ground
    g.lineWidth = Math.max(1, W / 1800);
    for (let i = 0; i < 22; i++) {
      const x = r() * W, w = W * (0.02 + r() * 0.04), top = H * (0.3 + r() * 0.15);
      const gr = g.createLinearGradient(0, top, 0, H * 0.92);
      gr.addColorStop(0, B.rain + '50'); gr.addColorStop(1, B.rain + '00');
      g.strokeStyle = gr;
      for (let k = 0; k < w / 2; k++) {
        const sx = x + r() * w;
        for (const ox of [-W, 0, W]) { g.beginPath(); g.moveTo(sx + ox, top + r() * H * 0.05); g.lineTo(sx + ox - H * 0.1, H * 0.92); g.stroke(); }
      }
    }
    B.colors.forEach((col, i) => { silhouette(g, W, H, periodic(r, W, 7, 1), 0.08 - i * 0.03, 0.2 - i * 0.05, col); haze(g, W, H, B.haze, 0, 0.2); });
  },
};
function paintBackdrop(B, seed) {
  const c = canvas(BACK_W, BACK_H), g = c.getContext('2d');
  (PAINT[B.style] || PAINT.mountains)(g, BACK_W, BACK_H, B, rng(seed));
  return c;
}

// ---------------------------------------------------------------- terrain outline
// The visible outline wanders inside the collision outline (by up to `edge` m, and at most 0.1 m
// outside it), so the rock looks craggy but never stands where the platform can't see it. It stays
// exact on the pad and around vents.
function roughen(pts, depthBottom, amp, seed, keepFlat) {
  if (!amp) return pts;
  const r = rng(seed), f1 = periodic(r, 997, 40, 0.7), f2 = periodic(r, 131, 20, 0.5);
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const ccw = area > 0, out = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    out.push([ax, ay]);
    if (ay < depthBottom && by < depthBottom) { s += len; continue; } // underground edges stay straight
    const nx = ccw ? dy / len : -dy / len, ny = ccw ? -dx / len : dx / len;
    const n = Math.floor(len / 1.1);
    for (let k = 1; k < n; k++) {
      const t = k / n, x = ax + dx * t, y = ay + dy * t, sa = s + len * t;
      const v = Math.min(1, Math.max(0, f1(sa) * 0.35 + f2(sa) * 0.25 + 0.6)); // 0..1, mostly inward
      const d = (-amp + (amp + 0.1) * v) * Math.sin(Math.PI * t) * keepFlat(x, y);
      out.push([x + nx * d, y + ny * d]);
    }
    s += len;
  }
  return out;
}

// ---------------------------------------------------------------- props
function tuftGeometry(THREE) {
  // five crossed blades
  const pos = [];
  for (let b = 0; b < 5; b++) {
    const a = b / 5 * Math.PI, c = Math.cos(a) * 0.12, s = Math.sin(a) * 0.12, lean = (b - 2) * 0.12;
    pos.push(-c, 0, -s, c, 0, s, lean, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- build
function build(map, K, LV) {
  const { THREE } = K;
  const T = themeOf(map);
  const id = map.id;
  if (!cache.has(id)) cache.set(id, {});
  const C = cache.get(id), seed = [...id].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7) >>> 0;

  // ---- sky, fog, light
  const root = document.documentElement.style;
  root.setProperty('--sky-top', T.sky[0]); root.setProperty('--sky-mid', T.sky[1]); root.setProperty('--sky-low', T.sky[2]);
  K.scene.fog.color.set(T.fog);
  K.hemi.color.set(T.hemi[0]); K.hemi.groundColor.set(T.hemi[1]); K.hemi.intensity = T.hemi[2];
  if (T.sun) { K.sun.color.set(T.sun.light); K.sunSprite.material.color.set(T.sun.glow); }
  K.sunSprite.visible = !!T.sun;

  // ---- materials
  C.rock = C.rock || rockCanvases(T.rock, seed, TEX);
  C.top = C.top || topCanvases(T.top, seed + 101, TEX);
  const tex = (cv, rep, color) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
    if (color) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  };
  const capMat = new THREE.MeshStandardMaterial({ map: tex(C.rock[0], 1 / 16, true), normalMap: tex(C.rock[1], 1 / 16), roughness: 0.95 });
  const topMat = new THREE.MeshStandardMaterial({ map: tex(C.top[0], 1 / 10, true), normalMap: tex(C.top[1], 1 / 10), roughness: 1 });
  capMat.normalScale.set(1.1, 1.1); topMat.normalScale.set(0.8, 0.8);

  // ---- terrain (visible outline roughened; collision is untouched)
  const vents = K.vents;
  const keepFlat = (x, y) => {
    let k = 1;
    if (Math.abs(x) < 11 && y > -1.5 && y < 1.5) k = Math.min(k, Math.max(0, (Math.abs(x) - 9) / 2));
    for (const v of vents) if (Math.abs(y - v.y) < 3) k = Math.min(k, Math.max(0, (Math.abs(x - v.x) - 3.5) / 2));
    return k;
  };
  const terrain = (pts, depth, front, castShadow, s) => {
    const shape = new THREE.Shape(roughen(pts, -45, T.edge, s, keepFlat).map(p => new THREE.Vector2(p[0], p[1])));
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
    const m = new THREE.Mesh(geo, [capMat, topMat]);
    m.position.z = front - depth;
    m.receiveShadow = true; m.castShadow = castShadow;
    K.levelGroup.add(m);
  };
  terrain(map.ground, 18, 4, true, seed + 1);
  map.solids.forEach((sd, i) => terrain(sd.pts, sd.depth, sd.front, !sd.roof, seed + 2 + i));

  // ---- cave back wall and glowing crystals
  if (map.cave) {
    const w = map.cave.x1 - map.cave.x0, y0 = map.cave.y0 ?? -30, y1 = map.cave.y1 ?? 100, h = y1 - y0;
    const wallMap = tex(C.rock[0], 1, true), wallNorm = tex(C.rock[1], 1);
    wallMap.repeat.set(w / 20, h / 20); wallNorm.repeat.set(w / 20, h / 20);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: wallMap, normalMap: wallNorm, color: T.caveTint, roughness: 1 }));
    wall.position.set(map.cave.x0 + w / 2, y0 + h / 2, -10);
    wall.receiveShadow = true;
    K.levelGroup.add(wall);
  }

  // ---- background ridges (fogged), then the painted backdrop behind them
  T.ridges.forEach((R, i) => {
    const f = periodic(rng(seed + 50 + i), 1600, 30, 0.8);
    const pts = [new THREE.Vector2(-900, -260)];
    for (let x = -900; x <= 1100; x += 6) {
      let v = f(x * R.freq * 40) * 0.5 + 0.5;
      if (R.style === 'jagged') v = 1 - Math.abs(v * 2 - 1);
      if (R.style === 'mesa') v = smooth(0.35, 0.45, v) * 0.7 + smooth(0.6, 0.66, v) * 0.3;
      if (R.style === 'hills') v = v * v;
      pts.push(new THREE.Vector2(x, R.base + R.amp * v));
    }
    pts.push(new THREE.Vector2(1100, -260));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), new THREE.MeshBasicMaterial({ color: R.color }));
    m.position.z = R.z;
    K.levelGroup.add(m);
  });
  const B = T.backdrop, BW = 1800, BH = 300; // its peaks must clear the ridges in front of it
  const backMat = new THREE.MeshBasicMaterial({ transparent: true, fog: false, depthWrite: false });
  const usePainted = () => {
    C.back = C.back || paintBackdrop(B, seed + 3);
    backMat.map = tex(C.back, 1, true); backMat.map.wrapT = THREE.ClampToEdgeWrapping; backMat.map.repeat.set(1, 1);
    backMat.needsUpdate = true;
  };
  if (B.image) {
    new THREE.TextureLoader().load(B.image, t => {
      t.encoding = THREE.sRGBEncoding; t.wrapS = THREE.RepeatWrapping;
      backMat.map = t; backMat.needsUpdate = true;
    }, undefined, usePainted);
  } else usePainted();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), backMat);
  back.position.set(0, (B.y ?? 60), -360);
  back.renderOrder = -1;
  K.sunSprite.renderOrder = -2; // the sun is drawn first, so the backdrop's peaks and clouds cover it
  K.levelGroup.add(back);

  // ---- props and grass along upward-facing surfaces
  const kinds = {
    tuft: { geo: tuftGeometry(THREE), mat: new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 1 }), shadow: false },
    boulder: { geo: new THREE.DodecahedronGeometry(1, 0), mat: new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), shadow: true },
    shrub: { geo: new THREE.IcosahedronGeometry(1, 0), mat: new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), shadow: true },
    spire: { geo: new THREE.ConeGeometry(0.5, 1, 6), mat: new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), shadow: true },
    crystal: { geo: new THREE.ConeGeometry(0.18, 1, 5), mat: new THREE.MeshBasicMaterial({}), shadow: false },
  };
  for (const k in kinds) { kinds[k].geo.translate(0, k === 'tuft' ? 0 : 0.5, 0); kinds[k].list = []; }
  const r = rng(seed + 9), pick = arr => arr[Math.floor(r() * arr.length)];
  const blocked = (x, y) => (Math.abs(x) < 10 && y < 2) || vents.some(v => Math.abs(x - v.x) < 4.5 && Math.abs(y - v.y) < 4) || (LV.noProps && LV.noProps(x, y));
  const place = (kind, x, y, z, s) => kinds[kind].list.push({ x, y, z, s, col: pick(T.colors[kind]) });
  const polys = [{ pts: map.ground, front: 4, depth: 18 }, ...map.solids.map(sd => ({ pts: sd.pts, front: sd.front, depth: sd.depth }))];
  for (const P of polys) {
    const pts = P.pts, zb = P.front - P.depth;
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      const ny = area > 0 ? -dx / len : dx / len;
      if (ny < 0.55 || ay < -45 || len < 0.5) continue; // upward-facing surfaces only
      for (let s = r(); s < len; s += 1) {
        const x = ax + dx * s / len, y = ay + dy * s / len;
        if (blocked(x, y)) continue;
        const roof = K.roofAt(x), inside = isFinite(roof) && roof > y + 1;
        const dens = inside ? T.caveProps : T.props;
        for (const kind in dens) {
          let n = dens[kind] * PROP_DENSITY;
          while (n > 0) {
            if (r() < Math.min(1, n)) {
              if (kind === 'tuft') {
                // the front fringe gets the most, so the edge you fly along looks lush
                const front = r() < 0.6;
                place(kind, x + r() - 0.5, y - 0.05, front ? P.front - r() * 0.7 : zb + 0.5 + r() * (P.depth - 1), 0.55 + r() * 0.6);
              } else if (zb < -3) {
                // anything tall stays behind the flight line so it never hides the platform
                const z = zb + 0.6 + r() * (Math.min(-2.6, P.front) - zb - 0.6);
                const size = kind === 'spire' ? 2 + r() * 5 : kind === 'crystal' ? 0.6 + r() * 1 : 0.5 + r() * 1.3;
                place(kind, x + r() - 0.5, y - (kind === 'boulder' ? size * 0.3 : 0.05), z, size);
              }
            }
            n -= 1;
          }
        }
      }
    }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  for (const kind in kinds) {
    const K2 = kinds[kind], L = K2.list;
    if (!L.length) continue;
    const mesh = new THREE.InstancedMesh(K2.geo, K2.mat, L.length);
    L.forEach((o, i) => {
      if (kind === 'boulder') { e.set(r() * 3, r() * 3, r() * 3); sc.set(o.s * (0.8 + r() * 0.6), o.s * (0.5 + r() * 0.4), o.s * (0.8 + r() * 0.6)); }
      else if (kind === 'spire') { e.set((r() - 0.5) * 0.1, r() * 3, (r() - 0.5) * 0.1); sc.set(o.s * (0.25 + r() * 0.2), o.s, o.s * (0.25 + r() * 0.2)); }
      else if (kind === 'shrub') { e.set(r() * 3, r() * 3, 0); sc.set(o.s, o.s * 0.75, o.s); }
      else if (kind === 'crystal') { e.set((r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7); sc.set(o.s, o.s, o.s); }
      else { e.set(0, r() * 3, (r() - 0.5) * 0.3); sc.set(o.s * (0.8 + r() * 0.5), o.s, o.s * (0.8 + r() * 0.5)); }
      m4.compose(p.set(o.x, o.y, o.z), q.setFromEuler(e), sc);
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.set(o.col).multiplyScalar(0.85 + r() * 0.3));
    });
    mesh.castShadow = K2.shadow; mesh.receiveShadow = true;
    K.levelGroup.add(mesh);
  }

  return {
    theme: T,
    update() {
      // backdrop and sun ride along with the camera at a slower pace, for parallax
      back.position.x = K.camTarget.x;
      if (backMat.map) backMat.map.offset.x = K.camTarget.x * 0.15 / BW;
      if (T.sun) K.sunSprite.position.set(K.camTarget.x * 0.6 + T.sun.x, T.sun.y, -380);
    },
  };
}

window.SkybucketScenery = { build, DEFAULT, LOW };
})();
