// Skybucket engine: shared physics, rendering, HUD, audio and game flow.
// Levels are separate files (levels/*.js) that call Skybucket.registerLevel.
(() => {
'use strict';
// ======================================================================
//  Helpers
// ======================================================================
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('skybucket.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('skybucket.' + k, JSON.stringify(v)); } catch (e) {} },
};

// ======================================================================
//  World definition (metres, y up). The game plays on the z = 0 plane.
// ======================================================================
const G = 9.8;
// Levels live in levels/*.js and register themselves with Skybucket.registerLevel (see the end of
// this file). Each is plain map data plus an optional create(K) that adds its own mechanics.
// points on a circle, from a0 to a1 degrees, for terrain that hugs round things
function arcPts(cx, cy, r, a0, a1, step) {
  const out = [];
  for (let a = a0; a <= a1 + 1e-9; a += step) out.push([+(cx + r * Math.cos(a * Math.PI / 180)).toFixed(2), +(cy + r * Math.sin(a * Math.PI / 180)).toFixed(2)]);
  return out;
}
const MAPS = [];
let MAP = null;
let LV = {}; // the current level's hooks and state, from its create(K)
let GROUND = [];
const PAD = { x0: -7, x1: 7, y: 0 };
const TYPES = [
  { name: 'Gem', r: 0.26, m: 0.45, value: 10, color: 0x5ff2ff, pitch: 1900 },
  { name: 'Crystal', r: 0.34, m: 1.0, value: 25, color: 0xff4fd8, pitch: 1250 },
  { name: 'Gold', r: 0.42, m: 2.2, value: 60, color: 0xffc93a, pitch: 620 },
  // water drops ride in the bucket like cargo but are nearly frictionless, so they slosh and pour
  { name: 'Water', r: 0.2, m: 0.12, value: 0, color: 0x58b8ff, pitch: 0, fric: 0.03, water: true },
];
const WATER = 3, WATER_PER_BURST = 10, VENT_WATER_MAX = 40, MAX_WATER = 70;
function quotaFor(lvl) {
  const q = MAP.quotas;
  return lvl <= q.length ? q[lvl - 1] : q[q.length - 1] + (lvl - q.length) * MAP.quotaStep;
}

// ---------- static collision geometry ----------
const SEGS = [], TVERTS = [];
// moving pieces a level adds (door edges, wheel paddles), updated in place every step. A piece's
// `body` may supply velAt(x, y, out) for its surface velocity, impulse(x, y, Jx, Jy) to feel pushes,
// and touch() to hear that the platform hit it.
const DYN_SEGS = [], DYN_VERTS = [];
function addPoly(pts) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const ccw = area > 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    const nx = ccw ? dy / len : -dy / len, ny = ccw ? -dx / len : dx / len;
    SEGS.push({ ax, ay, bx, by, dx, dy, l2: len * len, nx, ny,
      minx: Math.min(ax, bx), maxx: Math.max(ax, bx), miny: Math.min(ay, by), maxy: Math.max(ay, by), stamp: 0 });
    if (ay > -50) TVERTS.push({ x: ax, y: ay });
  }
}

// uniform grid over x for broadphase
const CELL = 8, GX0 = -80, NCELL = Math.ceil((360 - GX0) / CELL);
const grid = Array.from({ length: NCELL }, () => []);
function buildCollision() {
  SEGS.length = 0; TVERTS.length = 0;
  grid.forEach(c => { c.length = 0; });
  addPoly(GROUND);
  MAP.solids.forEach(sd => addPoly(sd.pts));
  for (const s of SEGS) {
    const c0 = clamp(Math.floor((s.minx - GX0) / CELL), 0, NCELL - 1), c1 = clamp(Math.floor((s.maxx - GX0) / CELL), 0, NCELL - 1);
    for (let c = c0; c <= c1; c++) grid[c].push(s);
  }
}
let stamp = 0;
function querySegs(minx, maxx, miny, maxy, out) {
  stamp++; out.length = 0;
  const c0 = clamp(Math.floor((minx - GX0) / CELL), 0, NCELL - 1), c1 = clamp(Math.floor((maxx - GX0) / CELL), 0, NCELL - 1);
  for (let c = c0; c <= c1; c++) {
    const list = grid[c];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.stamp === stamp) continue;
      s.stamp = stamp;
      if (s.maxx >= minx && s.minx <= maxx && s.maxy >= miny && s.miny <= maxy) out.push(s);
    }
  }
  // moving pieces (doors) aren't in the grid
  for (let i = 0; i < DYN_SEGS.length; i++) {
    const s = DYN_SEGS[i];
    if (s.maxx >= minx && s.minx <= maxx && s.maxy >= miny && s.miny <= maxy) out.push(s);
  }
  return out;
}
let qx = 0, qy = 0;
function closest(px, py, ax, ay, dx, dy, l2) {
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  qx = ax + dx * t; qy = ay + dy * t;
}
function groundHeightAt(x) {
  // top surface of the ground polygon (first run of points)
  for (let i = 1; i < GROUND.length; i++) {
    const a = GROUND[i - 1], b = GROUND[i];
    if (b[0] < a[0]) break;
    if (x >= a[0] && x <= b[0]) return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0] || 1));
  }
  return 0;
}
function roofAt(x) {
  // lowest underside of any roof solid above the floor at x
  let best = Infinity;
  for (const sd of MAP.solids) {
    if (!sd.roof) continue;
    const pts = sd.pts;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (a[0] === b[0] || x < Math.min(a[0], b[0]) || x > Math.max(a[0], b[0])) continue;
      const y = lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0]));
      if (y > groundHeightAt(x) && y < best) best = y;
    }
  }
  return best;
}
function raycast(ox, oy, dx, dy, maxT) {
  const ex = ox + dx * maxT, ey = oy + dy * maxT;
  const list = querySegs(Math.min(ox, ex), Math.max(ox, ex), Math.min(oy, ey), Math.max(oy, ey), rayTmp);
  let best = maxT, hit = null;
  for (const s of list) {
    const den = dx * s.dy - dy * s.dx;
    if (Math.abs(den) < 1e-9) continue;
    const wx = s.ax - ox, wy = s.ay - oy;
    const t = (wx * s.dy - wy * s.dx) / den;
    const u = (wx * dy - wy * dx) / den;
    if (t > 0 && t < best && u >= 0 && u <= 1) { best = t; hit = s; }
  }
  return hit ? { t: best, x: ox + dx * best, y: oy + dy * best, s: hit } : null;
}
const rayTmp = [];

// ======================================================================
//  Ship definition (local frame; deck top at y = 0.15)
// ======================================================================
const SHIP_M = 8, SHIP_I = 42, THRUST = 85, BURN = 1.05, JET_X = 2.8;
const MAX_PAYLOAD = 2 * THRUST / G - SHIP_M; // cargo mass at which both jets only just hover
const HULL = [
  [-2.5, 0.15, 2.5, 0.15], [-2.5, -0.25, 2.5, -0.25],
  [-3.1, 0.45, -2.5, 0.45], [-3.1, -0.55, -2.5, -0.55], [-3.1, -0.55, -3.1, 0.45], [-2.5, -0.55, -2.5, 0.45],
  [2.5, 0.45, 3.1, 0.45], [2.5, -0.55, 3.1, -0.55], [3.1, -0.55, 3.1, 0.45], [2.5, -0.55, 2.5, 0.45],
  [-1.5, 0.15, -1.85, 2.0], [1.5, 0.15, 1.85, 2.0],
  [-1.6, -0.25, -2.1, -0.8], [1.6, -0.25, 2.1, -0.8],
].map(([ax, ay, bx, by]) => ({ ax, ay, dx: bx - ax, dy: by - ay, l2: (bx - ax) ** 2 + (by - ay) ** 2 }));
const HULL_R = 0.07;
const PTS = [
  { x: -2.1, y: -0.8, foot: 1 }, { x: 2.1, y: -0.8, foot: 2 },
  { x: -3.1, y: -0.55 }, { x: -2.5, y: -0.55 }, { x: 3.1, y: -0.55 }, { x: 2.5, y: -0.55 },
  { x: -3.1, y: 0.45 }, { x: 3.1, y: 0.45 }, { x: -3.1, y: -0.05 }, { x: 3.1, y: -0.05 },
  { x: -1.85, y: 2.0 }, { x: 1.85, y: 2.0 }, { x: -1.68, y: 1.08 }, { x: 1.68, y: 1.08 },
  { x: 0, y: -0.25 }, { x: -1.2, y: -0.25 }, { x: 1.2, y: -0.25 }, { x: 0, y: 2.0 },
];
const PR = 0.1, VR = 0.09;

const S = {
  x: 0, y: 0.9, vx: 0, vy: 0, a: 0, w: 0, fuel: 0, hull: 100, jetL: 0, jetR: 0,
  alive: true, footL: false, footR: false, footLT: -1, footRT: -1, landedT: 0, deadT: 0, strandT: 0, hitT: 0, burnT: 0,
};
function resetShip() {
  Object.assign(S, { x: 0, y: 0.9, vx: 0, vy: 0, a: 0, w: 0, fuel: MAP.fuel, hull: 100, jetL: 0, jetR: 0,
    alive: true, landedT: 0, deadT: 0, strandT: 0, footLT: -1, footRT: -1, burnT: 0 });
}

// ======================================================================
//  Game state
// ======================================================================
const game = {
  state: 'title', level: 1, delivered: 0, lives: 3, best: 0, time: 0,
  scheme: store.get('controls', 'direct'), gyro: store.get('gyro', true), sound: store.get('sound', true),
  // zoom 1 is the default view; 0.5 pulls the camera out to twice the distance, 1.5 moves it in
  zoom: clamp(+store.get('zoomLevel', 1) || 1, 0.5, 1.5), bucketReady: false,
  shake: 0, wind: 0,
};
const cargo = [];
let vents = [];
const MAX_CARGO = 46;

// ======================================================================
//  Input
// ======================================================================
const keys = Object.create(null);
const touch = { L: false, R: false };
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW']);
const MENU_KEYS = new Set(['Space', 'Enter', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
addEventListener('keydown', e => {
  // on menus, let focused buttons and the zoom slider keep their own keys
  if (game.state !== 'play' && e.target.closest && e.target.closest('button, input') && MENU_KEYS.has(e.code)) return;
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  audio.unlock();
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'KeyG') setGyro(!game.gyro);
  else if (e.code === 'KeyC') setScheme(game.scheme === 'steer' ? 'direct' : 'steer');
  else if (e.code === 'KeyM') setSound(!game.sound);
  else if (e.code === 'KeyF' && (game.state === 'play' || game.state === 'paused')) {
    if (flipUpright() && game.state === 'paused') togglePause();
  }
  else if (e.code === 'Minus' || e.code === 'NumpadSubtract') setZoom(game.zoom - 0.1, true);
  else if (e.code === 'Equal' || e.code === 'NumpadAdd') setZoom(game.zoom + 0.1, true);
  else if ((e.code === 'Enter' || e.code === 'Space') && game.state === 'title') startGame();
  else if (e.code === 'Enter' && game.state === 'over') startGame();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('wheel', e => {
  if (game.state !== 'play' || !e.deltaY) return;
  setZoom(game.zoom - Math.sign(e.deltaY) * 0.05, true);
}, { passive: true });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; touch.L = touch.R = false; });

function bindPad(el, side) {
  const on = e => { e.preventDefault(); audio.unlock(); touch[side] = true; el.classList.add('on'); };
  const off = e => { e.preventDefault(); touch[side] = false; el.classList.remove('on'); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
bindPad($('padL'), 'L');
bindPad($('padR'), 'R');
if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) document.body.classList.add('touch');

function readJets() {
  if (game.state !== 'play' || !S.alive) return [0, 0];
  const left = keys.ArrowLeft || keys.KeyA || touch.L;
  const right = keys.ArrowRight || keys.KeyD || touch.R;
  const up = keys.ArrowUp || keys.KeyW || keys.Space;
  if (game.scheme === 'direct') return [(left || up) ? 1 : 0, (right || up) ? 1 : 0];
  // steer: the arrow names the way you want to lean
  const l = up ? (left ? 0.35 : 1) : (right ? 1 : 0);
  const r = up ? (right ? 0.35 : 1) : (left ? 1 : 0);
  return [l, r];
}

// ======================================================================
//  Physics
// ======================================================================
const PDT = 1 / 240;
const nearShip = [], nearCargo = [];
const C = Array.from({ length: 128 }, () => ({ x: 0, y: 0, nx: 0, ny: 0, pen: 0, foot: 0, svx: 0, svy: 0, body: null }));
const events = { clinks: [], impact: 0 };

function windAt(t) {
  if (LV.wind) return LV.wind(t);
  if (game.level < 2 || !MAP.wind) return 0;
  const amp = Math.min(2.6, 0.75 * (game.level - 1)) * MAP.wind;
  return amp * (Math.sin(t * 0.21) * 0.8 + Math.sin(t * 0.67 + 1.3) * 0.45 + Math.sin(t * 1.9 + 0.4) * 0.15);
}

function stepShip(dt) {
  const [tl, tr] = readJets();
  const hasFuel = S.fuel > 0;
  S.jetL += ((hasFuel ? tl : 0) - S.jetL) * Math.min(1, dt * 16);
  S.jetR += ((hasFuel ? tr : 0) - S.jetR) * Math.min(1, dt * 16);
  const c = Math.cos(S.a), s = Math.sin(S.a);
  const thrust = (S.jetL + S.jetR) * THRUST;
  let torque = (S.jetR - S.jetL) * THRUST * JET_X;
  if (game.gyro && game.state === 'play') {
    const ang = wrapAngle(S.a);
    torque += clamp(-(ang * 70 + S.w * 32), -48, 48);
  }
  S.fuel = Math.max(0, S.fuel - (S.jetL + S.jetR) * BURN * dt);
  S.vx += (-s * thrust / SHIP_M + game.wind * 0.75) * dt;
  S.vy += (c * thrust / SHIP_M - G) * dt;
  S.w += torque / SHIP_I * dt;
  const drag = Math.exp(-0.06 * dt);
  S.vx *= drag; S.vy *= drag; S.w *= Math.exp(-0.9 * dt);
  if (S.y > 85) S.vy -= (S.y - 85) * 4 * dt;
  S.x += S.vx * dt; S.y += S.vy * dt; S.a += S.w * dt;
  shipVsTerrain();
}

function surfaceVel(ct, body) {
  // velocity of the surface at the contact point (zero for still rock)
  ct.svx = 0; ct.svy = 0; ct.body = body || null;
  if (body && body.velAt) body.velAt(ct.x, ct.y, ct);
}
function shipVsTerrain() {
  S.footL = S.footR = false;
  const c = Math.cos(S.a), s = Math.sin(S.a);
  const near = querySegs(S.x - 3.9, S.x + 3.9, S.y - 3.9, S.y + 3.9, nearShip);
  let n = 0;
  for (let i = 0; i < PTS.length && n < C.length; i++) {
    const p = PTS[i];
    const wx = S.x + p.x * c - p.y * s, wy = S.y + p.x * s + p.y * c;
    for (let k = 0; k < near.length; k++) {
      const g = near[k], rr = PR + (g.th || 0);
      if (wx < g.minx - rr || wx > g.maxx + rr || wy < g.miny - rr || wy > g.maxy + rr) continue;
      closest(wx, wy, g.ax, g.ay, g.dx, g.dy, g.l2);
      let nx = wx - qx, ny = wy - qy;
      const d2 = nx * nx + ny * ny;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2);
      let pen;
      if (d > 1e-6) { nx /= d; ny /= d; } else { nx = g.nx; ny = g.ny; }
      if (!g.twoSided && nx * g.nx + ny * g.ny < -0.2) { nx = g.nx; ny = g.ny; pen = rr + d; } else pen = rr - d;
      const ct = C[n++]; ct.x = qx; ct.y = qy; ct.nx = nx; ct.ny = ny; ct.pen = pen; ct.foot = p.foot || 0;
      surfaceVel(ct, g.body);
      if (g.body && g.body.touch) g.body.touch();
      if (n >= C.length) break;
    }
  }
  // terrain corners poking into the hull
  const NV = TVERTS.length + DYN_VERTS.length;
  for (let i = 0; i < NV && n < C.length; i++) {
    const v = i < TVERTS.length ? TVERTS[i] : DYN_VERTS[i - TVERTS.length];
    const dx = v.x - S.x, dy = v.y - S.y;
    if (dx * dx + dy * dy > 16) continue;
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    const vr = VR + (v.th || 0);
    for (let k = 0; k < HULL.length; k++) {
      const h = HULL[k];
      closest(lx, ly, h.ax, h.ay, h.dx, h.dy, h.l2);
      let nx = qx - lx, ny = qy - ly;
      const d2 = nx * nx + ny * ny;
      if (d2 >= vr * vr || d2 < 1e-12) continue;
      const d = Math.sqrt(d2); nx /= d; ny /= d;
      const ct = C[n++]; ct.x = v.x; ct.y = v.y; ct.nx = nx * c - ny * s; ct.ny = nx * s + ny * c; ct.pen = vr - d; ct.foot = 0;
      surfaceVel(ct, v.body);
      if (v.body && v.body.touch) v.body.touch();
      if (n >= C.length) break;
    }
  }
  if (!n) return;
  // position correction without double-counting parallel contacts
  let apx = 0, apy = 0;
  for (let i = 0; i < n; i++) {
    const ct = C[i];
    const need = ct.pen - (apx * ct.nx + apy * ct.ny);
    if (need > 0) { const k = need * 0.85; S.x += ct.nx * k; S.y += ct.ny * k; apx += ct.nx * k; apy += ct.ny * k; }
  }
  let worst = 0;
  for (let it = 0; it < 3; it++) {
    for (let i = 0; i < n; i++) {
      const ct = C[i];
      if (ct.foot === 1) { S.footL = true; S.footLT = game.time; } else if (ct.foot === 2) { S.footR = true; S.footRT = game.time; }
      const rx = ct.x - S.x, ry = ct.y - S.y, nx = ct.nx, ny = ct.ny;
      const vn = (S.vx - S.w * ry - ct.svx) * nx + (S.vy + S.w * rx - ct.svy) * ny;
      if (vn >= 0) continue;
      if (it === 0) {
        const thr = ct.foot ? 5.5 : 3.5;
        const mult = LV.impactMult ? LV.impactMult(ct.x, ct.y) : 1;
        worst = Math.max(worst, (-vn - thr) * (ct.foot ? 8 : 11) * mult);
        events.impact = Math.max(events.impact, -vn);
      }
      const rn = rx * ny - ry * nx;
      const K = 1 / SHIP_M + rn * rn / SHIP_I;
      const e = (it === 0 && -vn > 2) ? (ct.foot ? 0.05 : 0.25) : 0;
      const j = -(1 + e) * vn / K;
      S.vx += j * nx / SHIP_M; S.vy += j * ny / SHIP_M; S.w += rn * j / SHIP_I;
      const tx = -ny, ty = nx;
      const vt = (S.vx - S.w * ry - ct.svx) * tx + (S.vy + S.w * rx - ct.svy) * ty;
      const rt = rx * ty - ry * tx;
      const Kt = 1 / SHIP_M + rt * rt / SHIP_I;
      const mu = ct.foot ? 0.9 : 0.55;
      const jt = clamp(-vt / Kt, -mu * j, mu * j);
      S.vx += jt * tx / SHIP_M; S.vy += jt * ty / SHIP_M; S.w += rt * jt / SHIP_I;
      // equal and opposite push on a moving piece (e.g. the bucket turning a water wheel)
      if (ct.body && ct.body.impulse) ct.body.impulse(ct.x, ct.y, -(j * nx + jt * tx), -(j * ny + jt * ty));
    }
  }
  if (worst > 0 && game.state === 'play') damageShip(worst);
}

const cargoSV = { svx: 0, svy: 0 };
function stepCargo(o, dt) {
  o.vy -= G * dt;
  o.vx += game.wind * 0.35 * dt;
  const drag = Math.exp(-0.05 * dt);
  o.vx *= drag; o.vy *= drag;
  o.x += o.vx * dt; o.y += o.vy * dt;
  o.ground = false;
  const near = querySegs(o.x - o.r, o.x + o.r, o.y - o.r, o.y + o.r, nearCargo);
  for (let k = 0; k < near.length; k++) {
    const g = near[k], rr = o.r + (g.th || 0);
    closest(o.x, o.y, g.ax, g.ay, g.dx, g.dy, g.l2);
    let nx = o.x - qx, ny = o.y - qy;
    const d2 = nx * nx + ny * ny;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2);
    let pen;
    if (d > 1e-6) { nx /= d; ny /= d; } else { nx = g.nx; ny = g.ny; }
    if (!g.twoSided && nx * g.nx + ny * g.ny < -0.2) { nx = g.nx; ny = g.ny; pen = rr + d; } else pen = rr - d;
    o.x += nx * pen; o.y += ny * pen;
    let svx = 0, svy = 0;
    if (g.body && g.body.velAt) { g.body.velAt(qx, qy, cargoSV); svx = cargoSV.svx; svy = cargoSV.svy; }
    const vn = (o.vx - svx) * nx + (o.vy - svy) * ny;
    if (vn < 0) {
      const e = -vn > 1.5 ? 0.32 : 0;
      const jn = -(1 + e) * vn;
      o.vx += jn * nx; o.vy += jn * ny;
      const tx = -ny, ty = nx, vt = (o.vx - svx) * tx + (o.vy - svy) * ty;
      const mu = TYPES[o.t].fric ?? 0.45;
      const jt = clamp(-vt, -mu * jn, mu * jn);
      o.vx += jt * tx; o.vy += jt * ty;
      if (-vn > 2.5 && o.t !== WATER) events.clinks.push([o.t, -vn, o.x]);
    }
    o.ground = true;
  }
}

function cargoVsShip(o, c, s) {
  const dx = o.x - S.x, dy = o.y - S.y;
  if (dx * dx + dy * dy > (3.8 + o.r) ** 2) return;
  const R = o.r + HULL_R;
  const wo = 1 / o.m, ws = 1 / SHIP_M, wsum = wo + ws;
  for (let k = 0; k < HULL.length; k++) {
    const h = HULL[k];
    const ddx = o.x - S.x, ddy = o.y - S.y;
    const lx = ddx * c + ddy * s, ly = -ddx * s + ddy * c;
    closest(lx, ly, h.ax, h.ay, h.dx, h.dy, h.l2);
    let nx = lx - qx, ny = ly - qy;
    const d2 = nx * nx + ny * ny;
    if (d2 >= R * R || d2 < 1e-12) continue;
    const d = Math.sqrt(d2); nx /= d; ny /= d;
    const wnx = nx * c - ny * s, wny = nx * s + ny * c, pen = R - d;
    o.x += wnx * pen * wo / wsum; o.y += wny * pen * wo / wsum;
    S.x -= wnx * pen * ws / wsum; S.y -= wny * pen * ws / wsum;
    const rx = o.x - wnx * o.r - S.x, ry = o.y - wny * o.r - S.y;
    let rvx = o.vx - (S.vx - S.w * ry), rvy = o.vy - (S.vy + S.w * rx);
    const vn = rvx * wnx + rvy * wny;
    if (vn >= 0) continue;
    const rn = rx * wny - ry * wnx;
    const K = wsum + rn * rn / SHIP_I;
    const e = -vn > 1.5 ? 0.22 : 0;
    const j = -(1 + e) * vn / K;
    o.vx += j * wnx * wo; o.vy += j * wny * wo;
    S.vx -= j * wnx * ws; S.vy -= j * wny * ws; S.w -= rn * j / SHIP_I;
    const tx = -wny, ty = wnx;
    rvx = o.vx - (S.vx - S.w * ry); rvy = o.vy - (S.vy + S.w * rx);
    const vt = rvx * tx + rvy * ty;
    const rt = rx * ty - ry * tx;
    const Kt = wsum + rt * rt / SHIP_I;
    const mu = TYPES[o.t].fric ?? 0.6;
    const jt = clamp(-vt / Kt, -mu * j, mu * j);
    o.vx += jt * tx * wo; o.vy += jt * ty * wo;
    S.vx -= jt * tx * ws; S.vy -= jt * ty * ws; S.w -= rt * jt / SHIP_I;
    if (-vn > 2.2 && o.t !== WATER) events.clinks.push([o.t, -vn, o.x]);
  }
}

function cargoVsCargo() {
  for (let i = 0; i < cargo.length; i++) {
    const a = cargo[i];
    if (a.gone) continue;
    for (let j = i + 1; j < cargo.length; j++) {
      const b = cargo[j];
      if (b.gone) continue;
      const dx = b.x - a.x, dy = b.y - a.y, R = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R * R || d2 < 1e-12) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, pen = R - d;
      const wa = 1 / a.m, wb = 1 / b.m, ws = wa + wb;
      a.x -= nx * pen * wa / ws; a.y -= ny * pen * wa / ws;
      b.x += nx * pen * wb / ws; b.y += ny * pen * wb / ws;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn >= 0) continue;
      const e = -vn > 1.5 ? 0.25 : 0;
      const jn = -(1 + e) * vn / ws;
      a.vx -= jn * nx * wa; a.vy -= jn * ny * wa;
      b.vx += jn * nx * wb; b.vy += jn * ny * wb;
      const tx = -ny, ty = nx, vt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
      const mu = a.t === WATER || b.t === WATER ? 0.02 : 0.3;
      const jt = clamp(-vt / ws, -mu * jn, mu * jn);
      a.vx -= jt * tx * wa; a.vy -= jt * ty * wa;
      b.vx += jt * tx * wb; b.vy += jt * ty * wb;
      if (-vn > 3 && a.t !== WATER && b.t !== WATER) events.clinks.push([a.t, -vn * 0.6, a.x]);
    }
  }
}

function physicsStep(dt) {
  game.time += dt;
  game.wind = windAt(game.time);
  if (LV.step) LV.step(dt);           // level pieces move first (doors, wheels)
  if (S.alive) stepShip(dt);
  if (LV.afterShip) LV.afterShip(dt); // then level hazards that touch the platform
  for (const o of cargo) if (!o.gone) stepCargo(o, dt);
  if (S.alive) {
    const c = Math.cos(S.a), s = Math.sin(S.a);
    for (const o of cargo) if (!o.gone) cargoVsShip(o, c, s);
  }
  cargoVsCargo();
}

// ======================================================================
//  Rendering (Three.js)
// ======================================================================
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb88a8a, 90, 430);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1200);
camera.position.set(0, 4, 34);

scene.add(new THREE.HemisphereLight(0xb9d3ff, 0x4a3530, 0.75));
const sun = new THREE.DirectionalLight(0xffd2a6, 1.35);
sun.position.set(-30, 50, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 26, bottom: -26, near: 1, far: 160 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  return t;
}
function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u); }
function fbm(x) { return noise1(x) * 0.55 + noise1(x * 2.1 + 7) * 0.28 + noise1(x * 4.3 + 3) * 0.17; }

// --- strata texture for terrain faces
const strata = canvasTex(256, 256, (g, w, h) => {
  for (let y = 0; y < h; y++) {
    const band = fbm(y * 0.09) * 0.7 + fbm(y * 0.4 + 11) * 0.3;
    const r = 70 + band * 46, gg = 52 + band * 34, b = 60 + band * 30;
    g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
    g.fillRect(0, y, w, 1);
  }
  for (let i = 0; i < 1600; i++) {
    const v = Math.random();
    g.fillStyle = v > 0.5 ? 'rgba(255,230,210,0.07)' : 'rgba(0,0,0,0.12)';
    g.fillRect(Math.random() * w, Math.random() * h, rand(1, 6), 1);
  }
});
strata.wrapS = strata.wrapT = THREE.RepeatWrapping;
strata.repeat.set(1 / 22, 1 / 22);

const capMat = new THREE.MeshStandardMaterial({ map: strata, roughness: 0.95, metalness: 0 });
const topMat = new THREE.MeshStandardMaterial({ color: 0x76663f, roughness: 1, flatShading: true });
// everything that belongs to the current map lives in this group so it can be swapped out
const levelGroup = new THREE.Group();
scene.add(levelGroup);
function polyMesh(pts, depth, zFront, castShadow = true) {
  const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  const m = new THREE.Mesh(geo, [capMat, topMat]);
  m.position.z = zFront - depth;
  m.receiveShadow = true; m.castShadow = castShadow;
  levelGroup.add(m);
  return m;
}
const caveWallTex = strata.clone();
caveWallTex.needsUpdate = true;
const caveWallMat = new THREE.MeshStandardMaterial({ map: caveWallTex, color: 0x9a8a92, roughness: 1 });
// water tower behind the flight line, its pipe running forward and turning down over the play plane
function buildPipe(P) {
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x6f8796, roughness: 0.5, metalness: 0.6 });
  if (P.roof) {
    // a nozzle let into the rock above the wheel
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 1.4, 12), pipeMat);
    noz.position.set(P.x, P.y + 0.7, 0); levelGroup.add(noz);
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16), pipeMat);
    flange.position.set(P.x, P.y + 1.2, 0); levelGroup.add(flange);
    return;
  }
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x8aa0ad, roughness: 0.6, metalness: 0.4 });
  const tx = P.x + 10, tz = -7, gy = groundHeightAt(tx);
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; levelGroup.add(m); return m; };
  add(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 6, 24), tankMat), tx, P.y + 4.5, tz);
  add(new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 24), tankMat), tx, P.y + 8.3, tz);
  for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) {
    const h = P.y + 1.5 - gy;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, h, 8), pipeMat), tx + dx, gy + h / 2, tz + dz);
  }
  const run = tx - P.x;
  const a = add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, run, 12), pipeMat), P.x + run / 2, P.y + 0.6, tz);
  a.rotation.z = Math.PI / 2;
  const b = add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, -tz, 12), pipeMat), P.x, P.y + 0.6, tz / 2);
  b.rotation.x = Math.PI / 2;
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.9, 12), pipeMat), P.x, P.y + 0.2, 0);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), pipeMat), P.x, P.y + 0.6, 0);
  const sign = add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 0.1), new THREE.MeshStandardMaterial({ color: 0x2a6fa0, roughness: 0.7 })), tx, P.y + 4.5, tz + 3.25);
  sign.castShadow = false;
}
const caveGlowMats = [0, 1].map(t => new THREE.MeshStandardMaterial({ color: TYPES[t].color, emissive: TYPES[t].color, emissiveIntensity: 0.6, roughness: 0.3 }));

// --- distant ridges for depth
function ridge(z, base, amp, freq, color, seed) {
  const pts = [new THREE.Vector2(-700, -200)];
  for (let x = -700; x <= 900; x += 8) pts.push(new THREE.Vector2(x, base + amp * fbm(x * freq + seed)));
  pts.push(new THREE.Vector2(900, -200));
  const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), new THREE.MeshBasicMaterial({ color }));
  m.position.z = z;
  scene.add(m);
}
ridge(-70, 4, 26, 0.03, 0x4c3f55, 3);
ridge(-150, 10, 48, 0.017, 0x6e5a6f, 21);
ridge(-270, 18, 80, 0.009, 0x9a7b84, 47);
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: canvasTex(256, 256, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,240,210,1)'); gr.addColorStop(0.18, 'rgba(255,214,150,0.95)');
    gr.addColorStop(0.4, 'rgba(255,160,100,0.25)'); gr.addColorStop(1, 'rgba(255,140,90,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }), fog: false, depthWrite: false, blending: THREE.AdditiveBlending,
}));
sunSprite.scale.set(200, 200, 1);
scene.add(sunSprite);

// --- home base
const metal = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.45, metalness: 0.6 });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.6, metalness: 0.5 });
const padLightMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffb547, emissiveIntensity: 1.2 });
{
  const pad = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.32, 5), darkMetal);
  pad.position.set(0, -0.12, 0.5); pad.receiveShadow = true; scene.add(pad);
  for (let i = -3; i <= 3; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.18), padLightMat);
    l.position.set(i * 2.1, 0.06, 2.8); scene.add(l);
  }
  const hMark = new THREE.Mesh(new THREE.BoxGeometry(5, 0.02, 0.25), new THREE.MeshStandardMaterial({ color: 0xe8edf4, roughness: 0.8 }));
  hMark.position.set(0, 0.05, 0.4); scene.add(hMark);
  const silo = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 16, 24), metal);
  silo.position.set(-21, 12, -4); silo.castShadow = true; scene.add(silo);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal);
  cap.position.set(-21, 20, -4); scene.add(cap);
  const hangar = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 8), new THREE.MeshStandardMaterial({ color: 0x6d5446, roughness: 0.9 }));
  hangar.position.set(-14, 4, -6.5); hangar.castShadow = true; scene.add(hangar);
  const chute = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 14, 12), darkMetal);
  chute.position.set(-12.5, 8, -3.5); chute.rotation.z = -1.05; scene.add(chute);
}
const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff5a3c }));
beacon.position.set(-21, 23.4, -4); scene.add(beacon);
const SILO_MOUTH = new THREE.Vector3(-18.5, 16, -2.5);
// windsock
const sock = new THREE.Group();
{
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), metal);
  pole.position.y = 2.5; sock.add(pole);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.15, 2.2, 10, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xff7a2e, side: THREE.DoubleSide, roughness: 0.8 }));
  cone.rotation.z = Math.PI / 2; cone.position.x = 1.1;
  const holder = new THREE.Group(); holder.position.y = 4.8; holder.add(cone);
  sock.add(holder); sock.userData.holder = holder;
  sock.position.set(10.5, groundHeightAt(10.5), -1.5);
  scene.add(sock);
}

// --- vents
const DRY_COL = new THREE.Color(0x6b5440), WET_COL = new THREE.Color(0x4fc6ff);
let ventVis = [];
function makeVentVis(v) {
  const g = new THREE.Group();
  g.position.set(v.x, v.y, 0);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.2, 0.6, 18, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x3b2c2c, roughness: 1, side: THREE.DoubleSide }));
  rim.position.y = 0.2; g.add(rim);
  const col = new THREE.Color().setHSL(0.08 - v.i * 0.02, 1, 0.55);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 20), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.12; g.add(disc);
  const light = new THREE.PointLight(col, 0, 16, 2);
  light.position.y = 1.2; g.add(light);
  // a few shards around the crater, tinted by what the vent produces
  const shardType = v.mix[2] > 0.3 ? 2 : v.mix[1] > 0.35 ? 1 : 0;
  const shardMat = new THREE.MeshStandardMaterial({ color: TYPES[shardType].color, emissive: TYPES[shardType].color, emissiveIntensity: 0.35, roughness: 0.3 });
  for (let k = 0; k < 5; k++) {
    const sh = new THREE.Mesh(new THREE.ConeGeometry(rand(0.15, 0.3), rand(0.6, 1.4), 5), shardMat);
    const side = k % 2 ? 1 : -1;
    sh.position.set(side * rand(2.2, 3.4), 0.2, rand(-2.5, 2.8));
    sh.rotation.set(rand(-0.4, 0.4), 0, side * rand(0.1, 0.5));
    g.add(sh);
  }
  levelGroup.add(g);
  return { g, disc, light, col };
}

// --- ship
const ship = new THREE.Group();
const flames = [];
const jetLights = [];
{
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.55, metalness: 0.25 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff7a2e, roughness: 0.5, metalness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8e9aa8, roughness: 0.4, metalness: 0.75 });
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; ship.add(m); return m; };
  add(new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.4, 2.2), hullMat), 0, -0.05, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(5.04, 0.1, 2.24), accent), 0, -0.2, 0);
  for (const sx of [-1, 1]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 1.0, 18), accent), sx * JET_X, -0.05, 0);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hullMat), sx * JET_X, 0.45, 0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.2, 14, 1, true), darkMetal), sx * JET_X, -0.63, 0);
    const strut = add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.5), steel), sx * 2.6, -0.05, 0);
    strut.castShadow = false;
    for (const z of [-0.75, 0.75]) {
      const leg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.76, 6), steel), sx * 1.85, -0.52, z);
      leg.rotation.z = sx * 0.74;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.06, 10), darkMetal), sx * 2.1, -0.85, z);
    }
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: sx < 0 ? 0xff3030 : 0x30ff70 }));
    nav.position.set(sx * 3.15, 0.3, 0); ship.add(nav);
    // exhaust flame (cone base at nozzle, tip downward)
    const outer = new THREE.ConeGeometry(0.24, 1.8, 14, 1, true); outer.rotateX(Math.PI); outer.translate(0, -0.9, 0);
    const inner = new THREE.ConeGeometry(0.12, 1.0, 10, 1, true); inner.rotateX(Math.PI); inner.translate(0, -0.5, 0);
    const fg = new THREE.Group();
    fg.add(new THREE.Mesh(outer, new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false })));
    fg.add(new THREE.Mesh(inner, new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
    fg.position.set(sx * JET_X, -0.72, 0);
    ship.add(fg); flames.push(fg);
    const pl = new THREE.PointLight(0xff9a4a, 0, 12, 2);
    pl.position.set(sx * JET_X, -1.4, 0.6); ship.add(pl); jetLights.push(pl);
  }
  // bucket: two leaning side walls, a solid back, glass front so you can watch the cargo
  for (const sx of [-1, 1]) {
    const wall = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.883, 2.1), steel), sx * 1.675, 1.075, 0);
    wall.rotation.z = -sx * 0.187;
  }
  const trap = new THREE.Shape([new THREE.Vector2(-1.5, 0.15), new THREE.Vector2(1.5, 0.15), new THREE.Vector2(1.85, 2.0), new THREE.Vector2(-1.85, 2.0)]);
  add(new THREE.Mesh(new THREE.ShapeGeometry(trap), new THREE.MeshStandardMaterial({ color: 0x5b6676, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide })), 0, 0, -1.04);
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(trap), new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.12, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide }));
  glass.position.z = 1.04; ship.add(glass);
  const rim = add(new THREE.Mesh(new THREE.BoxGeometry(3.82, 0.08, 0.08), accent), 0, 2.0, 1.06);
  rim.castShadow = false;
  add(new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.04, 2.0), new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.9 })), 0, 0.17, 0);
}
scene.add(ship);

// --- cargo meshes
const cargoGeo = [new THREE.OctahedronGeometry(1, 0), new THREE.IcosahedronGeometry(1, 0), new THREE.DodecahedronGeometry(1, 0), new THREE.SphereGeometry(1, 10, 8)];
const cargoMat = TYPES.map((t, i) => new THREE.MeshStandardMaterial({
  color: t.color, emissive: t.color, emissiveIntensity: i === 2 ? 0.18 : 0.35,
  roughness: i === 2 ? 0.3 : 0.15, metalness: i === 2 ? 0.85 : 0.1, flatShading: true, transparent: true,
}));
cargoMat[WATER] = new THREE.MeshStandardMaterial({ color: 0x58b8ff, emissive: 0x1a5a8a, emissiveIntensity: 0.5,
  roughness: 0.1, metalness: 0, transparent: true, opacity: 0.85 });

// ======================================================================
//  Particles: one additive pool (fire, sparks) and one alpha pool (dust, smoke)
// ======================================================================
const PVERT = `
attribute float size; attribute vec4 acolor; varying vec4 vC; uniform float scale;
void main() { vC = acolor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const PFRAG = `
varying vec4 vC;
void main() { vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
  gl_FragColor = vec4(vC.rgb, vC.a * smoothstep(0.5, 0.0, r)); }`;
function makePool(max, blending) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 4), size = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('acolor', new THREE.BufferAttribute(col, 4));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({ vertexShader: PVERT, fragmentShader: PFRAG, uniforms: { scale: { value: 500 } },
    transparent: true, depthWrite: false, blending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  const P = [];
  for (let i = 0; i < max; i++) P.push({ life: 0 });
  let next = 0;
  return {
    mat,
    emit(o) {
      const p = P[next]; next = (next + 1) % max;
      Object.assign(p, o); p.age = 0; p.life = o.life;
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        const p = P[i];
        if (p.life <= 0) { size[i] = 0; continue; }
        p.age += dt;
        if (p.age >= p.life) { p.life = 0; size[i] = 0; continue; }
        const t = p.age / p.life, dr = Math.exp(-p.drag * dt);
        p.vx *= dr; p.vy = p.vy * dr - p.grav * dt; p.vz *= dr;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 4] = lerp(p.r0, p.r1, t); col[i * 4 + 1] = lerp(p.g0, p.g1, t); col[i * 4 + 2] = lerp(p.b0, p.b1, t);
        col[i * 4 + 3] = p.a * (1 - t);
        size[i] = lerp(p.s0, p.s1, t);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.acolor.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
    },
  };
}
const fire = makePool(1400, THREE.AdditiveBlending);
const smoke = makePool(900, THREE.NormalBlending);
function fireP(x, y, z, vx, vy, vz, life, s0, s1, hot) {
  fire.emit({ x, y, z, vx, vy, vz, life, s0, s1, drag: 2.5, grav: -1.5,
    r0: 1, g0: hot ? 0.95 : 0.7, b0: hot ? 0.7 : 0.3, r1: 0.6, g1: 0.12, b1: 0.04, a: 0.9 });
}
function smokeP(x, y, z, vx, vy, vz, life, s0, s1, c, a, grav = -0.4) {
  smoke.emit({ x, y, z, vx, vy, vz, life, s0, s1, drag: 1.6, grav,
    r0: c[0], g0: c[1], b0: c[2], r1: c[0] * 0.8, g1: c[1] * 0.8, b1: c[2] * 0.8, a });
}
function sparkBurst(x, y, color, n, speed) {
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = rand(0.3, 1) * speed;
    fire.emit({ x, y, z: rand(-0.5, 0.5), vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(-1, 1), life: rand(0.3, 0.8),
      s0: 0.35, s1: 0.05, drag: 2, grav: 6, r0: 1, g0: 1, b0: 1, r1: c.r, g1: c.g, b1: c.b, a: 1 });
  }
}

// ======================================================================
//  Audio (synthesised; starts on first input)
// ======================================================================
const audio = {
  ctx: null, master: null, jets: [], lastClink: 0,
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = game.sound ? 0.7 : 0; this.master.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 3.5; }
    this.noise = buf;
    for (const pan of [-0.55, 0.55]) {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.value = 0;
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      src.connect(f); f.connect(g);
      if (p) { p.pan.value = pan; g.connect(p); p.connect(this.master); } else g.connect(this.master);
      src.start(); this.jets.push({ f, g });
    }
  },
  setJets(l, r) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [l, r].forEach((v, i) => {
      const j = this.jets[i];
      j.g.gain.setTargetAtTime(v * 0.55, t, 0.03);
      j.f.frequency.setTargetAtTime(260 + v * 900, t, 0.05);
    });
  },
  tone(freq, dur, type = 'sine', vol = 0.2, slide = 0) {
    if (!this.ctx || !game.sound) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  thud(vol = 0.5, freq = 180, dur = 0.35) {
    if (!this.ctx || !game.sound) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 4, t); f.frequency.exponentialRampToValueAtTime(freq, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  clink(type, strength, x) {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this.lastClink < 35) return;
    this.lastClink = now;
    const dist = Math.abs(x - S.x);
    const vol = clamp(strength / 14, 0.02, 0.18) * clamp(1 - dist / 60, 0, 1);
    if (vol > 0.01) this.tone(TYPES[type].pitch * rand(0.92, 1.08), 0.12 + type * 0.05, 'triangle', vol);
  },
  setMaster(on) { if (this.master) this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.05); },
};

// ======================================================================
//  Game logic
// ======================================================================
function spawnCargo(v) {
  const r = Math.random();
  const t = r < v.mix[0] ? 0 : r < v.mix[0] + v.mix[1] ? 1 : 2;
  const T = TYPES[t];
  const mesh = new THREE.Mesh(cargoGeo[t], cargoMat[t].clone());
  mesh.scale.setScalar(T.r * (t === 0 ? 1.15 : 1.05));
  mesh.castShadow = true;
  scene.add(mesh);
  const o = { t, r: T.r, m: T.m, value: T.value, x: v.x + rand(-0.4, 0.4), y: v.y + 0.7, vx: rand(-2.4, 2.4), vy: rand(12.5, 16.5),
    z: rand(-0.55, 0.55), rot: rand(0, 6), rx: rand(0, 6), mesh, ground: false, groundT: 0, gone: false, inBucket: false };
  cargo.push(o);
  sparkBurst(o.x, o.y, T.color, 8, 5);
}
// darken the sky (0 = clear, 1 = black) for weather; a layer between the page's sky and the 3D view
function setSkyShade(a) { $('skyShade').style.opacity = String(clamp(a, 0, 1)); }
function spawnWater(px, py) {
  const T = TYPES[WATER];
  const mesh = new THREE.Mesh(cargoGeo[WATER], cargoMat[WATER]); // shared material: never disposed
  mesh.scale.setScalar(T.r);
  scene.add(mesh);
  const o = { t: WATER, r: T.r, m: T.m, value: 0, x: px + rand(-0.15, 0.15), y: py, vx: rand(-0.3, 0.3), vy: -2,
    z: rand(-0.5, 0.5), rot: 0, rx: 0, mesh, ground: false, groundT: 0, soakT: 0, gone: false, inBucket: false, shared: true };
  cargo.push(o);
  return o;
}
function removeCargo(o) {
  o.gone = true;
  scene.remove(o.mesh);
  if (!o.shared) o.mesh.material.dispose();
}
const delivering = [];
function unload(load) {
  // everything in the bucket is banked at once; the flight to the silo is staggered for show
  load.sort((a, b) => b.y - a.y);
  let total = 0;
  load.forEach((o, i) => {
    o.gone = true;
    total += o.value;
    delivering.push({ mesh: o.mesh, from: o.mesh.position.clone(), t: -i * 0.08, color: TYPES[o.t].color });
    if (i < 8) setTimeout(() => audio.tone(660 + o.t * 220 + i * 40, 0.16, 'square', 0.05, 1.5), i * 80);
  });
  game.delivered += total;
  if (LV.onDeliver) LV.onDeliver(load);
  popText(`+${total} cr · ${load.length} ${load.length === 1 ? 'piece' : 'pieces'}`, S.x, S.y + 2.8);
  if (game.delivered >= quotaFor(game.level)) levelUp();
}
function levelUp() {
  while (game.delivered >= quotaFor(game.level)) game.level++;
  const gusts = LV.levelUpNote ? ' ' + LV.levelUpNote() : !MAP.wind ? '' : game.level === 2 ? ' The wind is picking up out there.' : ' Gusts are stronger.';
  banner(`Shift ${game.level}`, `Quota met. Next target ${quotaFor(game.level)} cr.${gusts}`, 3.2);
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => audio.tone(f, 0.25, 'triangle', 0.12), i * 110));
}
function flashHull() {
  const panel = $('hullWrap').parentElement.parentElement;
  panel.classList.remove('flash'); void panel.offsetWidth; panel.classList.add('flash');
}
function damageShip(amount) {
  if (!S.alive) return;
  S.hull -= amount;
  game.lastHit = amount;
  game.shake = Math.max(game.shake, Math.min(1, amount / 30));
  S.hitT = 0.35;
  audio.thud(clamp(amount / 40, 0.15, 0.7), 140);
  flashHull();
  if (S.hull <= 0) explode();
}
// steady damage (e.g. a burn): no thud or shake per call; the level adds its own effects
function drainHull(amount) {
  if (!S.alive || game.state !== 'play') return;
  S.hull -= amount;
  if (S.hull <= 0) explode();
}
function explode() {
  S.alive = false; S.hull = 0; S.deadT = 2.8;
  ship.visible = false;
  game.shake = 1.2;
  sparkBurst(S.x, S.y, 0xffb547, 90, 16);
  for (let i = 0; i < 40; i++) smokeP(S.x + rand(-1.5, 1.5), S.y + rand(-0.5, 1), rand(-1, 1), rand(-3, 3), rand(0, 4), rand(-1, 1), rand(1.5, 3), 1.2, 4.5, [0.18, 0.15, 0.14], 0.75, -0.6);
  audio.thud(0.9, 90, 1.2);
  audio.tone(110, 0.8, 'sawtooth', 0.12, 0.3);
  game.lives--;
  banner('Platform lost', game.lives > 0 ? `${game.lives} ${game.lives === 1 ? 'ship' : 'ships'} left in the hangar.` : 'That was the last one.', 2.6);
}
function strand() {
  S.alive = false; S.deadT = 2.2;
  game.lives--;
  banner('Out of fuel', game.lives > 0 ? 'Tug is hauling you home. Cargo stays where it fell.' : 'No ships left to send.', 2.4);
}
function respawnOrEnd() {
  if (game.lives <= 0) return gameOver();
  resetShip();
  if (LV.onRespawn) LV.onRespawn();
  ship.visible = true;
}

function startGame() {
  audio.unlock();
  for (const o of cargo) if (!o.gone) removeCargo(o);
  cargo.length = 0;
  Object.assign(game, { state: 'play', level: 1, delivered: 0, lives: 3, time: 0 });
  if (LV.onStart) LV.onStart();
  vents.forEach((v, i) => { v.state = 'idle'; v.t = rand(1, 3) + i; v.left = 0; v.water = 0; });
  resetShip();
  ship.visible = true;
  $('titleScreen').hidden = true; $('overScreen').hidden = true; $('pauseScreen').hidden = true;
  document.body.classList.add('playing');
  $('hud').hidden = false;
  renderLives();
  banner('Shift 1', `Bring home ${quotaFor(1)} cr of ore. ${MAP.intro}`, 3.2);
}
function gameOver() {
  game.state = 'over';
  document.body.classList.remove('playing');
  const best = Math.max(game.best, game.delivered);
  const isBest = game.delivered > game.best && game.delivered > 0;
  game.best = best; store.set('best.' + MAP.id, best);
  $('finalScore').textContent = game.delivered;
  $('overDetail').textContent = `${MAP.name}: reached shift ${game.level}. ${isBest ? 'New personal best.' : `Best so far: ${best} cr.`}`;
  $('overScreen').hidden = false;
  $('hud').hidden = true;
  setTimeout(() => $('againBtn').focus(), 50);
}
// ---------- recovery: set the platform level in the nearest spot where it fits ----------
function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function shipFitsAt(x, y) {
  const near = querySegs(x - 4, x + 4, y - 4, y + 4, nearShip), polys = [GROUND, ...MAP.solids.map(sd => sd.pts)];
  for (const p of PTS) {
    const wx = x + p.x, wy = y + p.y;
    if (polys.some(pts => pointInPoly(wx, wy, pts))) return false;
    for (const g of near) {
      const rr = PR + (g.th || 0) + 0.1;
      closest(wx, wy, g.ax, g.ay, g.dx, g.dy, g.l2);
      if ((wx - qx) ** 2 + (wy - qy) ** 2 < rr * rr) return false;
    }
  }
  for (const v of TVERTS.concat(DYN_VERTS)) {
    const lx = v.x - x, ly = v.y - y;
    if (lx * lx + ly * ly > 20) continue;
    const vr = VR + (v.th || 0) + 0.1;
    for (const h of HULL) {
      closest(lx, ly, h.ax, h.ay, h.dx, h.dy, h.l2);
      if ((lx - qx) ** 2 + (ly - qy) ** 2 < vr * vr) return false;
    }
  }
  return true;
}
function flipUpright() {
  if (!S.alive || game.state === 'title' || game.state === 'over') return false;
  // nearest clear spot: straight up first, then widening to either side
  let spot = null;
  for (let r = 0; r <= 16 && !spot; r += 0.5) {
    for (const [dx, dy] of [[0, r], [-r, r * 0.5], [r, r * 0.5], [-r, 0], [r, 0]]) {
      const x = S.x + dx;
      let y = S.y + dy;
      if (!shipFitsAt(x, y)) continue;
      // settle it down onto whatever is below, so it doesn't drop when play resumes
      for (let k = 0; k < 120 && shipFitsAt(x, y - 0.1); k++) y -= 0.1;
      if (LV.unsafeSpot && LV.unsafeSpot(x, y)) continue; // e.g. beside lava you'd slide into
      spot = [x, y]; break;
    }
  }
  if (spot) { S.x = spot[0]; S.y = spot[1] + 0.02; }
  S.a = 0; S.w = 0; S.vx = 0; S.vy = 0;
  camTarget.set(S.x, S.y + 1.6, 0);
  banner('', 'Flipped upright', 1.2);
  return true;
}
function togglePause() {
  if (game.state === 'play') { game.state = 'paused'; $('pauseScreen').hidden = false; $('flipBtn').disabled = !S.alive; $('resumeBtn').focus(); }
  else if (game.state === 'paused') { game.state = 'play'; $('pauseScreen').hidden = true; }
}
function toTitle() {
  game.state = 'title';
  document.body.classList.remove('playing');
  $('pauseScreen').hidden = true; $('overScreen').hidden = true; $('hud').hidden = true; $('titleScreen').hidden = false;
  $('banner').classList.remove('show');
  for (const o of cargo) if (!o.gone) removeCargo(o);
  cargo.length = 0;
  Object.assign(game, { level: 1, delivered: 0, lives: 3 });
  resetShip(); ship.visible = true;
  renderBest();
  setTimeout(() => $('startBtn').focus(), 50);
}
function setScheme(s) {
  game.scheme = s; store.set('controls', s);
  $('schemeBtn').textContent = 'Controls: ' + (s === 'steer' ? 'Steer' : 'Direct');
  $('ctlLeft').textContent = s === 'steer' ? 'Tilt left (fires the right jet)' : 'Left jet (tilts you right)';
  $('ctlRight').textContent = s === 'steer' ? 'Tilt right (fires the left jet)' : 'Right jet (tilts you left)';
  $('padL').textContent = s === 'steer' ? '◀' : 'L';
  $('padL').setAttribute('aria-label', s === 'steer' ? 'Tilt left' : 'Left jet');
  $('padR').textContent = s === 'steer' ? '▶' : 'R';
  $('padR').setAttribute('aria-label', s === 'steer' ? 'Tilt right' : 'Right jet');
  if (game.state === 'play') banner('', s === 'steer' ? 'Controls: steer — arrows lean the platform' : 'Controls: direct — each arrow fires its own jet', 1.6);
}
function setGyro(on) {
  game.gyro = on; store.set('gyro', on);
  $('gyroBtn').textContent = 'Gyro: ' + (on ? 'On' : 'Off');
  if (game.state === 'play') banner('', on ? 'Gyro assist on' : 'Gyro assist off — full manual', 1.4);
}
function setSound(on) {
  game.sound = on; store.set('sound', on);
  $('soundBtn').textContent = 'Sound: ' + (on ? 'On' : 'Off');
  audio.setMaster(on);
}
function setZoom(z, announce) {
  game.zoom = clamp(Math.round(z * 20) / 20, 0.5, 1.5);
  store.set('zoomLevel', game.zoom);
  $('zoomRange').value = game.zoom;
  $('zoomTxt').textContent = Math.round(game.zoom * 100) + '%';
  if (announce && game.state === 'play') banner('', `Zoom ${Math.round(game.zoom * 100)}%`, 0.9);
}
$('zoomRange').addEventListener('input', e => setZoom(+e.target.value));
function renderBest() { $('bestTxt').textContent = game.best > 0 ? `Best delivery on ${MAP.name}: ${game.best} cr` : ''; }
function renderLives() {
  const el = $('lives'); el.innerHTML = '';
  for (let i = 0; i < 3; i++) { const b = document.createElement('b'); if (i >= game.lives) b.className = 'gone'; el.appendChild(b); }
}

let bannerTimer = 0;
function banner(h, p, dur) {
  $('bannerH').textContent = h; $('bannerP').textContent = p;
  $('banner').classList.add('show');
  bannerTimer = dur;
}
const pops = [];
function popText(text, x, y) {
  const el = document.createElement('div');
  el.className = 'pop'; el.textContent = text;
  $('pops').appendChild(el);
  pops.push({ el, x, y, t: 0 });
}

$('startBtn').onclick = startGame;
$('againBtn').onclick = startGame;
$('resumeBtn').onclick = togglePause;
$('flipBtn').onclick = () => { if (flipUpright()) togglePause(); };
$('quitBtn').onclick = toTitle;
$('overSetupBtn').onclick = toTitle;
$('menuBtn').onclick = e => { e.currentTarget.blur(); togglePause(); };
$('schemeBtn').onclick = () => setScheme(game.scheme === 'steer' ? 'direct' : 'steer');
$('gyroBtn').onclick = () => setGyro(!game.gyro);
$('soundBtn').onclick = () => { audio.unlock(); setSound(!game.sound); };
setScheme(game.scheme); setGyro(game.gyro); setSound(game.sound); setZoom(game.zoom); renderBest();

function localToBucket(o) {
  const c = Math.cos(S.a), s = Math.sin(S.a), dx = o.x - S.x, dy = o.y - S.y;
  const lx = dx * c + dy * s, ly = -dx * s + dy * c;
  return ly > 0.1 && ly < 2.3 && Math.abs(lx) < 1.55 + (ly - 0.15) * 0.19;
}

function updateGame(dt) {
  // vents
  const freeCount = cargo.reduce((n, o) => n + (o.gone || o.t === WATER ? 0 : 1), 0);
  vents.forEach((v, i) => {
    const vis = ventVis[i];
    v.t -= dt;
    if (v.state === 'idle') {
      v.glow = lerp(v.glow, 0.15, dt * 2);
      if (v.dry && v.water < WATER_PER_BURST) {
        v.t = Math.max(v.t, 0.5); // dormant until enough water is poured in
        if (Math.random() < dt * 1.5) smokeP(v.x + rand(-1, 1), v.y + 0.2, rand(-0.8, 0.8), rand(-0.3, 0.3), rand(0.4, 1), 0, rand(1, 2), 0.6, 1.8, [0.6, 0.52, 0.44], 0.25);
      } else if (v.t <= 0) {
        if (Math.abs(S.x - v.x) < 90 && freeCount < MAX_CARGO) { v.state = 'warn'; v.t = 1.8; }
        else v.t = 1.5;
      }
    } else if (v.state === 'warn') {
      v.glow = 0.5 + 0.5 * Math.sin(game.time * 22);
      if (Math.random() < dt * 30) smokeP(v.x + rand(-1, 1), v.y + 0.3, rand(-0.8, 0.8), rand(-0.5, 0.5), rand(2, 4), 0, rand(0.8, 1.6), 0.8, 2.4, [0.55, 0.45, 0.42], 0.45);
      if (Math.abs(S.x - v.x) < 40 && Math.random() < dt * 6) audio.thud(0.05, 60, 0.3);
      if (v.t <= 0) { v.state = 'erupt'; v.left = Math.round(rand(v.burst[0], v.burst[1])); v.t = 0;
        if (v.dry) v.water -= WATER_PER_BURST; audio.thud(clamp(0.5 - Math.abs(S.x - v.x) / 120, 0, 0.5), 80, 0.6); }
    } else if (v.state === 'erupt') {
      v.glow = 1;
      if (v.t <= 0) {
        spawnCargo(v); v.left--; v.t = 0.17;
        for (let k = 0; k < 6; k++) fireP(v.x + rand(-0.6, 0.6), v.y + 0.4, rand(-0.6, 0.6), rand(-1, 1), rand(6, 10), 0, rand(0.3, 0.6), 0.8, 0.2, true);
        if (v.left <= 0) { v.state = 'idle'; v.t = v.dry ? rand(2.5, 4) : rand(6.5, 10.5); }
      }
    }
    vis.disc.material.opacity = 0.25 + v.glow * 0.6;
    vis.light.intensity = v.glow * 3.2;
    if (v.dry) {
      // dusty brown when dry, filling to blue as water is poured in
      const f = clamp(v.water / WATER_PER_BURST, 0, 1);
      vis.disc.material.color.copy(DRY_COL).lerp(WET_COL, f);
      vis.disc.material.opacity = Math.max(vis.disc.material.opacity, 0.45 + f * 0.4);
      vis.light.color.copy(v.water >= WATER_PER_BURST && v.state !== 'idle' ? vis.col : WET_COL);
      if (v.state === 'idle') vis.light.intensity = f * 1.6;
    }
  });

  // the pipe pours whenever there's room for more water in the world
  if (MAP.pipe) {
    const P = MAP.pipe;
    game.pipeAcc = (game.pipeAcc || 0) + dt * P.rate;
    let water = 0;
    for (const o of cargo) if (!o.gone && o.t === WATER) water++;
    while (game.pipeAcc >= 1) { game.pipeAcc--; if (water++ < MAX_WATER) spawnWater(P.x, P.y - 0.4); }
    if (Math.random() < dt * 14) smokeP(P.x + rand(-0.2, 0.2), P.y - 0.6, rand(-0.3, 0.3), rand(-0.3, 0.3), -rand(3, 6), 0, rand(0.3, 0.6), 0.3, 0.8, [0.75, 0.88, 1], 0.35, 4);
  }

  // cargo bookkeeping
  let bucketValue = 0, bucketMass = 0, bucketCount = 0, bucketWater = 0;
  for (const o of cargo) {
    if (o.gone) continue;
    o.inBucket = S.alive && localToBucket(o);
    // level hazards (lava, doors...) destroy pieces; the level plays its own effect
    if (LV.cargoHazard && LV.cargoHazard(o)) { removeCargo(o); continue; }
    if (o.t === WATER) {
      if (o.inBucket) { bucketMass += o.m; bucketWater++; }
      // poured into a dry vent: the vent drinks it
      let drunk = false;
      for (const v of vents) {
        if (!v.dry || Math.abs(o.x - v.x) > 3.2 || o.y > v.y + 2.2) continue;
        const before = v.water;
        v.water = Math.min(VENT_WATER_MAX, v.water + 1);
        smokeP(o.x, v.y + 0.4, rand(-0.6, 0.6), rand(-0.5, 0.5), rand(1.5, 3), 0, rand(0.8, 1.4), 0.5, 2, [0.92, 0.95, 1], 0.5);
        if (before < WATER_PER_BURST && v.water >= WATER_PER_BURST) {
          popText('Vent primed', v.x, v.y + 3);
          [392, 523, 659].forEach((f, i) => setTimeout(() => audio.tone(f, 0.25, 'sine', 0.12), i * 90));
        } else if (Math.random() < 0.25) audio.tone(rand(500, 800), 0.08, 'sine', 0.04, 0.6);
        drunk = true;
        break;
      }
      // anywhere else, water soaks into the ground
      if (!drunk && o.ground && !o.inBucket) o.soakT += dt;
      if (drunk || o.soakT > (MAP.soak ?? 0.5) || o.y < -45) {
        if (!drunk) smokeP(o.x, o.y, o.z, 0, 0.6, 0, 0.6, 0.3, 0.9, [0.55, 0.7, 0.85], 0.35);
        removeCargo(o);
        continue;
      }
      o.mesh.position.set(o.x, o.y, o.z);
      continue;
    }
    if (o.inBucket) { bucketValue += o.value; bucketMass += o.m; bucketCount++; }
    const speed = Math.hypot(o.vx, o.vy);
    if (o.ground && !o.inBucket && speed < 1.5) o.groundT += dt; else o.groundT = Math.max(0, o.groundT - dt * 2);
    if (o.groundT > 5 || o.y < -45 || o.x < MAP.world.x0 - 20 || o.x > MAP.world.x1 + 20) {
      sparkBurst(o.x, o.y, TYPES[o.t].color, 10, 3);
      smokeP(o.x, o.y, o.z, 0, 1, 0, 1, 0.5, 1.6, [0.5, 0.42, 0.4], 0.5);
      removeCargo(o);
      continue;
    }
    const m = o.mesh;
    m.position.set(o.x, o.y, o.z);
    o.rot -= o.vx * dt / o.r * 0.6; o.rx += dt * (0.4 + Math.abs(o.vy) * 0.2);
    m.rotation.set(o.rx, o.rot * 0.3, o.rot);
    m.material.opacity = o.groundT > 3 ? (Math.sin(game.time * 20) > 0 ? 1 : 0.25) : 1;
  }
  for (let i = cargo.length - 1; i >= 0; i--) if (cargo[i].gone) cargo.splice(i, 1);

  // landing on the pad: deliver, refuel, repair
  const speed = Math.hypot(S.vx, S.vy);
  // feet count as planted for a moment after their last contact, so resting jitter doesn't reset the timer
  const planted = game.time - S.footLT < 0.15 && game.time - S.footRT < 0.15;
  const onPad = S.alive && planted && S.x > PAD.x0 && S.x < PAD.x1 && speed < 0.8 && Math.abs(wrapAngle(S.a)) < 0.3;
  if (onPad && game.state === 'play') {
    S.landedT += dt;
    S.fuel = Math.min(MAP.fuel, S.fuel + 28 * dt);
    S.hull = Math.min(100, S.hull + 6 * dt);
    if (S.landedT > 0.35) {
      const load = cargo.filter(o => !o.gone && o.inBucket && o.t !== WATER);
      if (load.length) { unload(load); bucketValue = 0; bucketMass = 0; bucketCount = 0; }
    }
  } else S.landedT = 0;
  padLightMat.emissive.setHex(onPad ? 0x7be38f : 0xffb547);
  padLightMat.emissiveIntensity = onPad ? 1.6 : 0.8 + 0.6 * Math.sin(game.time * 3);

  // stranded without fuel
  if (S.alive && game.state === 'play' && S.fuel <= 0 && !onPad && speed < 0.3) {
    S.strandT += dt;
    if (S.strandT > 2.5) strand();
  } else S.strandT = 0;

  if (!S.alive && game.state === 'play') {
    S.deadT -= dt;
    if (S.deadT <= 0) { respawnOrEnd(); renderLives(); }
  }
  renderLives.last !== game.lives && (renderLives(), renderLives.last = game.lives);

  // delivery animation: items fly into the silo
  for (let i = delivering.length - 1; i >= 0; i--) {
    const d = delivering[i];
    d.t += dt * 1.4;
    const t = clamp(d.t, 0, 1), e = t * t * (3 - 2 * t);
    d.mesh.position.lerpVectors(d.from, SILO_MOUTH, e);
    d.mesh.position.y += Math.sin(t * Math.PI) * 5;
    d.mesh.scale.multiplyScalar(1 - dt * 0.8);
    d.mesh.rotation.y += dt * 8;
    if (t >= 1) { scene.remove(d.mesh); d.mesh.material.dispose(); delivering.splice(i, 1); sparkBurst(SILO_MOUTH.x, SILO_MOUTH.y, d.color, 6, 3); }
  }

  const info = { bucketValue, bucketMass, bucketCount, bucketWater, onPad };
  if (LV.update) LV.update(dt, info);
  return info;
}

// ======================================================================
//  Visual update per frame
// ======================================================================
const camTarget = new THREE.Vector3(0, 3, 0);
const camPos = new THREE.Vector3(0, 5, 34);
const tmpV = new THREE.Vector3();
let hudTick = 0;

function updateVisuals(dt, info) {
  ship.position.set(S.x, S.y, 0);
  ship.rotation.z = S.a;
  const c = Math.cos(S.a), s = Math.sin(S.a);
  [S.jetL, S.jetR].forEach((th, i) => {
    const f = flames[i];
    const on = S.alive && th > 0.03;
    f.visible = on;
    if (on) { const fl = 0.85 + Math.random() * 0.3; f.scale.set(0.8 + th * 0.3, th * fl, 0.8 + th * 0.3); }
    jetLights[i].intensity = S.alive ? th * (2.2 + Math.random() * 0.6) : 0;
    if (!on || game.state === 'paused') return;
    const lx = (i ? 1 : -1) * JET_X, ly = -0.78;
    const wx = S.x + lx * c - ly * s, wy = S.y + lx * s + ly * c;
    const n = Math.ceil(th * 3);
    for (let k = 0; k < n; k++) {
      const sp = rand(12, 18) * th;
      fireP(wx, wy, rand(-0.12, 0.12), S.vx + s * sp + rand(-1, 1), S.vy - c * sp + rand(-1, 1), rand(-0.6, 0.6), rand(0.18, 0.38), 0.75, 0.25, k === 0);
    }
    if (Math.random() < th * 0.5) smokeP(wx, wy - 0.4, 0, S.vx * 0.5 + s * 5, S.vy * 0.5 - c * 5, rand(-0.5, 0.5), rand(0.8, 1.4), 0.5, 2.2, [0.42, 0.38, 0.4], 0.18);
    // dust kicked up off the ground
    const hit = raycast(wx, wy, s, -c, 9);
    if (hit && Math.random() < th * 1.4) {
      const k = 1 - hit.t / 9, tx = -hit.s.ny, ty = hit.s.nx, dir = Math.random() < 0.5 ? -1 : 1;
      smokeP(hit.x, hit.y + 0.15, rand(-1.5, 2.5), tx * dir * rand(4, 9) * k, ty * dir * rand(4, 9) * k + rand(0.5, 2), rand(-1, 1), rand(0.6, 1.2), 0.6, 2.6, [0.62, 0.5, 0.4], 0.45 * k, 0.2);
    }
  });

  if (LV.visuals) LV.visuals(dt);

  // blowing dust streaks in strong wind
  if (Math.abs(game.wind) > 1.2 && dt > 0) {
    const n = Math.min(12, Math.abs(game.wind) * dt * 30);
    for (let k = 0; k < n; k++) {
      const x = camTarget.x + rand(-60, 60);
      smokeP(x, camTarget.y + rand(-24, 24), rand(-8, 3), game.wind * rand(5, 7), rand(-0.5, 0.5), 0,
        rand(1.2, 2), 1.1, 2.4, [0.88, 0.82, 0.74], 0.2, 0);
    }
  }

  // windsock
  const ws = game.wind;
  const holder = sock.userData.holder;
  holder.rotation.y = ws >= 0 ? 0 : Math.PI;
  holder.rotation.z = lerp(holder.rotation.z, -1.35 + Math.min(1.3, Math.abs(ws) * 0.6), dt * 2) + Math.sin(game.time * 9) * 0.02;
  beacon.visible = Math.sin(game.time * 4) > -0.2;

  // camera
  const look = clamp(S.vx * 0.55, -9, 9);
  if (Math.abs(camTarget.x - S.x) > 40 || Math.abs(camTarget.y - S.y) > 30) {
    // respawn or teleport: cut instead of sweeping the camera through the rock
    camTarget.set(S.x, S.y + 1.6, 0);
    camPos.set(S.x, S.y + 4.8, 64 / game.zoom);
  }
  camTarget.lerp(tmpV.set(S.x + look, S.y + 1.6 + clamp(S.vy * 0.25, -3, 3), 0), 1 - Math.exp(-dt * 4));
  const zoom = (32 + clamp(Math.hypot(S.vx, S.vy) * 0.45, 0, 9) + (game.state === 'title' ? -6 : 0)) * 2 / game.zoom;
  camPos.lerp(tmpV.set(camTarget.x, camTarget.y + 3.2, zoom), 1 - Math.exp(-dt * 3));
  game.shake = Math.max(0, game.shake - dt * 2.2);
  const sh = game.shake * game.shake * 0.8;
  camera.position.set(camPos.x + rand(-sh, sh), camPos.y + rand(-sh, sh), camPos.z);
  camera.lookAt(camTarget);
  sun.position.set(camTarget.x - 30, camTarget.y + 50, 40);
  sun.target.position.set(camTarget.x, camTarget.y - 4, 0);
  const halfH = camPos.z * 0.47 + 6, halfW = halfH * camera.aspect + 6, sc = sun.shadow.camera;
  if (Math.abs(sc.top - halfH) > 1 || Math.abs(sc.right - halfW) > 1) {
    Object.assign(sc, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    sc.updateProjectionMatrix();
  }
  scene.fog.near = camPos.z + 30; scene.fog.far = camPos.z + 400;
  sunSprite.position.set(camTarget.x * 0.6 + 60, 70, -380);

  fire.update(dt); smoke.update(dt);

  // floating score text
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.t += dt;
    tmpV.set(p.x, p.y + p.t * 2.2, 0).project(camera);
    p.el.style.left = ((tmpV.x + 1) / 2 * innerWidth) + 'px';
    p.el.style.top = ((1 - tmpV.y) / 2 * innerHeight) + 'px';
    p.el.style.opacity = String(1 - p.t / 1.2);
    if (p.t > 1.2) { p.el.remove(); pops.splice(i, 1); }
  }
  checkBucketReady(info);
  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) $('banner').classList.remove('show'); }

  // HUD (throttled)
  if (game.state === 'play' && (hudTick = (hudTick + 1) % 3) === 0) updateHud(info);
}

const mini = $('minimap'), mctx = mini.getContext('2d');
const MM = { x0: 0, y0: -14, s: 1, tx: x => x, ty: y => y };
const mmBase = document.createElement('canvas');
mmBase.width = mini.width; mmBase.height = mini.height;
function drawMinimapBase() {
  const g = mmBase.getContext('2d');
  MM.x0 = MAP.world.x0; MM.s = mini.width / (MAP.world.x1 - MAP.world.x0);
  const tx = x => (x - MM.x0) * MM.s, ty = y => mini.height - (y - MM.y0) * MM.s;
  g.clearRect(0, 0, mini.width, mini.height);
  g.fillStyle = 'rgba(232,237,244,0.22)';
  for (const poly of [GROUND, ...MAP.solids.map(sd => sd.pts)]) {
    g.beginPath();
    poly.forEach(([x, y], i) => i ? g.lineTo(tx(x), ty(y)) : g.moveTo(tx(x), ty(y)));
    g.closePath(); g.fill();
  }
  g.fillStyle = '#ffb547'; g.fillRect(tx(PAD.x0), ty(0) - 3, (PAD.x1 - PAD.x0) * MM.s, 4);
  MM.tx = tx; MM.ty = ty;
  if (LV.minimapBase) LV.minimapBase(g, MM);
}

function loadMap(id) {
  if (LV.destroy) LV.destroy();
  MAP = MAPS.find(m => m.id === id) || MAPS[0];
  GROUND = MAP.ground;
  store.set('map', MAP.id);
  for (const o of cargo) if (!o.gone) removeCargo(o);
  cargo.length = 0;
  // drop the old map's meshes and moving pieces
  levelGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  levelGroup.clear();
  DYN_SEGS.length = 0; DYN_VERTS.length = 0;
  buildCollision();
  polyMesh(GROUND, 18, 4);
  MAP.solids.forEach(sd => polyMesh(sd.pts, sd.depth, sd.front, !sd.roof));
  if (MAP.cave) {
    // back wall so the tunnel reads as enclosed rock rather than open sky
    const w = MAP.cave.x1 - MAP.cave.x0, y0 = MAP.cave.y0 ?? -30, y1 = MAP.cave.y1 ?? 100, h = y1 - y0;
    caveWallTex.repeat.set(w / 24, h / 24);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), caveWallMat);
    wall.position.set(MAP.cave.x0 + w / 2, y0 + h / 2, -10);
    wall.receiveShadow = true;
    levelGroup.add(wall);
    // glowing crystal clusters along the floor, behind the flight line
    for (let x = MAP.cave.x0 + 14; x < MAP.cave.x1 - 20; x += rand(9, 16)) {
      const y = groundHeightAt(x), mat = caveGlowMats[Math.random() < 0.6 ? 0 : 1];
      for (let k = 0; k < 3; k++) {
        const sh = new THREE.Mesh(new THREE.ConeGeometry(rand(0.12, 0.25), rand(0.5, 1.3), 5), mat);
        sh.position.set(x + rand(-1, 1), y + 0.2, rand(-7, -4));
        sh.rotation.set(rand(-0.3, 0.3), 0, rand(-0.5, 0.5));
        levelGroup.add(sh);
      }
    }
  }
  vents = MAP.vents.map((d, i) => ({ ...d, i, state: 'idle', t: rand(1, 4) + i * 0.5, left: 0, glow: 0, water: 0 }));
  if (MAP.pipe) buildPipe(MAP.pipe);
  ventVis = vents.map(makeVentVis);
  sock.position.y = groundHeightAt(10.5);
  sun.intensity = MAP.sun;
  setSkyShade(0);
  game.best = store.get('best.' + MAP.id, MAP.id === 'badlands' ? store.get('best', 0) : 0);
  resetShip();
  LV = MAP.create ? MAP.create(K, MAP) || {} : {};
  drawMinimapBase();
  document.querySelectorAll('.mapBtn').forEach(b => b.setAttribute('aria-checked', String(b.dataset.map === MAP.id)));
  $('mapBlurb').textContent = MAP.blurb;
  renderBest();
  resetShip();
  camTarget.set(0, 1000, 0); // forces a camera cut to the pad
}

function checkBucketReady(info) {
  // one chime and message the moment the load first covers the rest of the quota
  const need = Math.max(0, quotaFor(game.level) - game.delivered);
  const ready = game.state === 'play' && S.alive && !info.onPad && info.bucketCount > 0 && info.bucketValue >= need;
  if (ready && !game.bucketReady) {
    banner('', 'That load covers the quota. Take it home.', 2.2);
    [784, 1175].forEach((f, i) => setTimeout(() => audio.tone(f, 0.2, 'triangle', 0.1), i * 120));
  }
  game.bucketReady = ready;
}

function updateHud(info) {
  const f = S.fuel / MAP.fuel, h = Math.max(0, S.hull) / 100;
  $('fuelBar').style.transform = `scaleX(${f})`; $('fuelTxt').textContent = Math.ceil(S.fuel);
  $('hullBar').style.transform = `scaleX(${h})`; $('hullTxt').textContent = Math.ceil(Math.max(0, S.hull));
  $('fuelWrap').classList.toggle('warn', f < 0.25);
  $('hullWrap').classList.toggle('warn', h < 0.3);
  const q = quotaFor(game.level), q0 = game.level > 1 ? quotaFor(game.level - 1) : 0;
  $('lvlTxt').textContent = game.level;
  $('quotaBar').style.transform = `scaleX(${clamp((game.delivered - q0) / (q - q0), 0, 1)})`;
  $('quotaTxt').textContent = `${game.delivered} / ${q} cr`;
  const need = Math.max(0, q - game.delivered);
  const parts = [];
  if (info.bucketCount) parts.push(`${info.bucketCount} ${info.bucketCount === 1 ? 'piece' : 'pieces'}`);
  if (info.bucketWater) parts.push(`${info.bucketWater} water`);
  $('bucketCount').textContent = parts.length ? parts.join(' · ') : 'empty';
  $('valBar').style.transform = `scaleX(${need ? Math.min(1, info.bucketValue / need) : 1})`;
  $('valTxt').textContent = `${info.bucketValue} / ${need} cr`;
  $('valWrap').classList.toggle('ready', info.bucketValue > 0 && info.bucketValue >= need);
  const load = info.bucketMass / MAX_PAYLOAD;
  $('loadBar').style.transform = `scaleX(${Math.min(1, load)})`;
  $('loadTxt').textContent = `${info.bucketMass.toFixed(1)} / ${MAX_PAYLOAD.toFixed(1)} kg`;
  $('loadWrap').classList.toggle('heavy', load > 0.85);
  const dx = 0 - S.x, dy = 1 - S.y, dist = Math.hypot(dx, dy);
  $('homeTxt').textContent = dist < 7 ? 'here' : `${Math.round(dist)} m`;
  $('homeArrow').style.transform = `rotate(${-Math.atan2(dy, dx)}rad)`;
  const w = game.wind;
  const windStr = Math.abs(w) < 0.15 ? 'calm' : `${w > 0 ? '→' : '←'} ${Math.abs(w * 10).toFixed(0)} kn`;
  $('windTxt').textContent = windStr;
  $('windMini').textContent = 'Wind ' + windStr;

  const g = mctx;
  g.clearRect(0, 0, mini.width, mini.height);
  g.drawImage(mmBase, 0, 0);
  vents.forEach(v => {
    g.fillStyle = v.dry && v.state === 'idle' ? (v.water >= WATER_PER_BURST ? '#4fc6ff' : 'rgba(150,120,90,0.8)')
      : v.state === 'idle' ? 'rgba(255,140,80,0.6)' : '#ff5a3c';
    g.beginPath(); g.arc(MM.tx(v.x), MM.ty(v.y) - 3, v.state === 'idle' ? 3 : 5, 0, Math.PI * 2); g.fill();
  });
  if (LV.minimap) LV.minimap(g, MM);
  for (const o of cargo) {
    if (o.gone || o.t === WATER) continue;
    g.fillStyle = '#' + TYPES[o.t].color.toString(16).padStart(6, '0');
    g.fillRect(MM.tx(o.x) - 1.5, MM.ty(o.y) - 1.5, 3, 3);
  }
  if (S.alive) {
    g.save(); g.translate(MM.tx(S.x), MM.ty(S.y)); g.rotate(-S.a);
    g.fillStyle = '#ffffff'; g.fillRect(-6, -2, 12, 4); g.fillRect(-3, -6, 2, 4); g.fillRect(1, -6, 2, 4);
    g.restore();
  }
}

// ======================================================================
//  Main loop
// ======================================================================
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const scale = h * renderer.getPixelRatio() * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  fire.mat.uniforms.scale.value = scale; smoke.mat.uniforms.scale.value = scale;
}
addEventListener('resize', resize);
resize();

let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  let info = { bucketValue: 0, bucketMass: 0, bucketCount: 0, bucketWater: 0, onPad: false };
  if (game.state !== 'paused') {
    acc += dt;
    let n = 0;
    while (acc >= PDT && n < 14) { physicsStep(PDT); acc -= PDT; n++; }
    if (n >= 14) acc = 0;
    info = updateGame(dt);
    // sounds collected during physics
    if (events.clinks.length) {
      events.clinks.sort((a, b) => b[1] - a[1]);
      audio.clink(events.clinks[0][0], events.clinks[0][1], events.clinks[0][2]);
      events.clinks.length = 0;
    }
    if (events.impact > 3 && S.alive) audio.thud(clamp(events.impact / 25, 0.05, 0.4), 220, 0.2);
    events.impact = 0;
  }
  audio.setJets(game.state === 'paused' ? 0 : S.jetL, game.state === 'paused' ? 0 : S.jetR);
  updateVisuals(game.state === 'paused' ? 0 : dt, info);
  renderer.render(scene, camera);
}
// ======================================================================
//  Level kit: what a level's create(K) can use
// ======================================================================
const K = {
  THREE, scene, levelGroup, camera, camTarget, sunSprite, darkMetal, metal, sun, setSkyShade,
  clamp, rand, lerp, wrapAngle, $, store, canvasTex,
  G, PDT, TYPES, WATER, HULL, HULL_R, PTS, PR, VR, SHIP_M, SHIP_I, MAX_PAYLOAD, PAD,
  S, game, cargo, events, audio, keys,
  get map() { return MAP; }, get vents() { return vents; }, get wind() { return game.wind; },
  querySegs, groundHeightAt, roofAt, raycast, quotaFor, localToBucket, polyMesh,
  DYN_SEGS, DYN_VERTS,
  // closest point on segment g to (px, py): returns the squared distance, the point is in K.cq
  cq: { x: 0, y: 0 },
  closest(px, py, g) { closest(px, py, g.ax, g.ay, g.dx, g.dy, g.l2); K.cq.x = qx; K.cq.y = qy; return (px - qx) ** 2 + (py - qy) ** 2; },
  // a segment record in the shape the collision code expects; setSeg moves it
  makeSeg(extra) { return Object.assign({ ax: 0, ay: 0, bx: 0, by: 0, dx: 0, dy: 1, l2: 1, nx: 0, ny: 1, minx: 0, maxx: 0, miny: 0, maxy: 0, stamp: 0 }, extra); },
  setSeg(g, ax, ay, bx, by, normalFromDir) {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    Object.assign(g, { ax, ay, bx, by, dx, dy, l2: l * l, minx: Math.min(ax, bx), maxx: Math.max(ax, bx), miny: Math.min(ay, by), maxy: Math.max(ay, by) });
    if (normalFromDir) { g.nx = -dy / l; g.ny = dx / l; }
  },
  // does a circle at (x, y) touch the platform's hull? returns the contact in world space, or null
  hullHit(x, y, r) {
    if (!S.alive) return null;
    const dx = x - S.x, dy = y - S.y;
    if (dx * dx + dy * dy > (4 + r) ** 2) return null;
    const c = Math.cos(S.a), s = Math.sin(S.a), lx = dx * c + dy * s, ly = -dx * s + dy * c, R = r + HULL_R;
    let best = null;
    for (const h of HULL) {
      closest(lx, ly, h.ax, h.ay, h.dx, h.dy, h.l2);
      const d2 = (lx - qx) ** 2 + (ly - qy) ** 2;
      if (d2 >= R * R || (best && d2 >= best.d2)) continue;
      const d = Math.sqrt(d2) || 1e-6, nlx = (lx - qx) / d, nly = (ly - qy) / d;
      best = { d2, pen: R - d, lx: qx, ly: qy, nx: nlx * c - nly * s, ny: nlx * s + nly * c, x: S.x + qx * c - qy * s, y: S.y + qx * s + qy * c };
    }
    return best;
  },
  spawnCargo, spawnWater, removeCargo, damageShip, drainHull, flashHull, banner, popText, fireP, smokeP, sparkBurst,
};

// ======================================================================
//  Public API used by index.html and the level files
// ======================================================================
function buildMapPicker() {
  const box = $('mapList');
  box.innerHTML = '';
  for (const m of MAPS) {
    const b = document.createElement('button');
    b.className = 'ghost mapBtn'; b.setAttribute('role', 'radio'); b.dataset.map = m.id; b.textContent = m.name;
    b.onclick = () => { if (MAP.id !== m.id) loadMap(m.id); };
    box.appendChild(b);
  }
}
window.Skybucket = {
  arcPts,
  registerLevel(def) { MAPS.push(def); },
  boot() {
    buildMapPicker();
    loadMap(store.get('map', MAPS[0].id));
    requestAnimationFrame(frame);
  },
};
window.__skybucket = { game, S, cargo, get vents() { return vents; }, get map() { return MAP; }, get level() { return LV; },
  keys, physicsStep, updateGame, spawnCargo, PDT, loadMap };
})();
