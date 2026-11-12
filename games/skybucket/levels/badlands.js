// Badlands: open hills with five vents; richer ore the farther out. Wind from shift 2.
// Pure map data: everything here is handled by the engine.
Skybucket.registerLevel({
  id: 'badlands', name: 'Badlands',
  blurb: 'Open hills with five vents. Richer ore the farther you go. Wind from shift 2.',
  intro: 'First vent is just east of the pad.',
  world: { x0: -60, x1: 310 }, fuel: 120, wind: 1, sun: 1.35,
  quotas: [150, 400, 800, 1400, 2200, 3200], quotaStep: 1200,
  // dusk over the badlands: the original palette, now with detail
  theme: {
    backdrop: { style: 'mountains', colors: ['#8d6f80', '#a8818a', '#c4988f'], haze: '#e0a988', cloud: '#f2c4a8' },
    props: { tuft: 1.4, boulder: 0.06, shrub: 0.04 },
  },
  ground: [
    [-70, 90], [-52, 90], [-48, 40], [-40, 18], [-28, 9], [-16, 3], [-8, 0], [8, 0], [14, 1.2], [22, 4], [31, 3],
    [38, -1.5], [43, -3], [49, -3], [55, -0.5], [62, 5], [66, 13], [71, 14.5], [75, 8], [83, 2.5], [90, 1.5],
    [93.5, -4.5], [99.5, -4.5], [103, 1.5], [113, 4.5], [118, 21], [125, 22], [129, 5], [140, 0], [149, -6],
    [159, -6], [167, 0], [179, 7], [190, 9.5], [201, 5], [209, -2], [217, -2], [226, 9], [238, 29], [251, 30],
    [256, 13], [263, 4], [273, 4], [281, 11], [292, 38], [300, 80], [320, 90], [320, -60], [-70, -60],
  ],
  solids: [
    { depth: 9, front: 3.2, pts: [[76, 26], [82, 22.5], [90, 23], [94, 27], [87, 31], [80, 30.5]] },
    { depth: 9, front: 3.2, pts: [[137, 19], [146, 14.5], [156, 13.5], [166, 15], [173, 19], [167, 25], [150, 26], [141, 24]] },
    { depth: 9, front: 3.2, pts: [[205, 22], [212, 19], [220, 21], [216, 26], [208, 26]] },
    { depth: 9, front: 3.2, pts: [[259, 24], [266, 20.5], [277, 20], [283, 23.5], [279, 28.5], [265, 28.5]] },
  ],
  vents: [
    { x: 46, y: -3, mix: [0.85, 0.15, 0], burst: [2, 3] },
    { x: 96.5, y: -4.5, mix: [0.6, 0.4, 0], burst: [2, 4] },
    { x: 154, y: -6, mix: [0.4, 0.45, 0.15], burst: [3, 4] },
    { x: 213, y: -2, mix: [0.3, 0.4, 0.3], burst: [3, 4] },
    { x: 268, y: 4, mix: [0, 0.4, 0.6], burst: [3, 5] },
  ],
});
