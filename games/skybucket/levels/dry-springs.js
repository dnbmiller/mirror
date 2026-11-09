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
