// Dry Springs: water from the tower pipe must be poured into the dry vent to make it erupt.
// Pure map data: the pipe, water and dry vents are shared engine features.
Skybucket.registerLevel({
  id: 'springs', name: 'Dry Springs',
  blurb: 'The vent has run dry. Catch water from the pipe by the pad, then tip it into the vent to get it erupting again. Every 10 drops buys one eruption.',
  intro: 'Fill the bucket under the water pipe, then pour it into the dry vent.',
  world: { x0: -60, x1: 220 }, fuel: 140, wind: 0.6, sun: 1.35,
  quotas: [120, 300, 600, 1000, 1500], quotaStep: 600,
  // water pours from the pipe outlet; `dry` vents only erupt on water poured into them
  pipe: { x: 16, y: 13.5, rate: 10 },
  // a green valley in the morning: grass, pines and puffy clouds
  theme: {
    sky: ['#3a78b8', '#8fc0e4', '#f1e6c8'], fog: '#b8ccd8', hemi: ['#cfe6ff', '#4a5a3a', 0.85],
    sun: { light: '#fff1d8', glow: '#fff0c8', x: 80, y: 95 },
    rock: { bands: ['#8a7d6a', '#a39478', '#7a6e5e', '#968a72'], bandsPerTile: 8, warp: 0.5, cracks: 0.35, grain: 0.4, bump: 2 },
    top: { colors: ['#5f8a3a', '#6f9a44', '#4f7a32'], streak: 0.7, bump: 1.6 },
    ridges: [
      { z: -80, base: 0, amp: 16, freq: 0.025, color: '#5f7f5a', style: 'hills' },
      { z: -170, base: 4, amp: 30, freq: 0.014, color: '#7f9aa0', style: 'smooth' },
    ],
    backdrop: { style: 'hills', colors: ['#9fb8c0', '#7f9f8a', '#6a8a5e'], trees: ['#8aa4a8', '#5f7f62', '#46663f'], haze: '#d8e6ee', cloud: '#ffffff' },
    props: { tuft: 2.2, shrub: 0.06, boulder: 0.04, spire: 0.025 },
    colors: { tuft: ['#6f9a3e', '#5c8a34', '#86ad4c'], shrub: ['#4f7a32', '#5f8a3a'], boulder: ['#8a8478', '#9a9282'], spire: ['#2f5a32', '#3a6a3a'] },
  },
  ground: [
    [-70, 90], [-52, 90], [-48, 40], [-40, 18], [-28, 9], [-16, 3], [-8, 0], [8, 0], [14, 1], [24, 1.5], [34, 3],
    [46, 8], [56, 14], [64, 15], [72, 10], [84, 4], [96, 6], [106, 12], [112, 12.5], [120, 6], [132, -1], [140, -4],
    [160, -4], [168, -1], [180, 6], [192, 16], [200, 40], [204, 90], [220, 90], [220, -60], [-70, -60],
  ],
  solids: [
    { depth: 9, front: 3.2, pts: [[80, 24], [88, 21], [98, 22], [100, 26], [90, 29], [82, 28]] },
  ],
  vents: [
    { x: 150, y: -4, mix: [0.6, 0.3, 0.1], burst: [3, 5], dry: true },
  ],
});
