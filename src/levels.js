// Story Mode content (§6.1): days on a World Map, branch choices that reconverge,
// five enchanted keys (narrative collectibles only). The day count is data-driven.

import { leadInto, mirrorChain, mirrorPoint, roundedPolyline, spiral } from './pathBuilders.js';

// --- Layouts -------------------------------------------------------------------
// Each layout returns { paths: [beziers...], slinger: {x, y} } on the 1280×720 canvas.
// Paths begin just off-screen so orbs always roll in from outside the field.

const LAYOUTS = {
  meadow: () => ({
    paths: [roundedPolyline([[-40, 90], [1180, 90], [1180, 630], [110, 630], [110, 300], [470, 300]], 100)],
    slinger: { x: 770, y: 390 },
  }),

  // A winding causeway: waves across the top, back along the bottom, around the Slinger.
  serpent: () => ({
    paths: [
      roundedPolyline(
        [[-40, 140], [190, 70], [420, 175], [650, 70], [880, 175], [1090, 80], [1190, 250], [1190, 480], [1070, 640], [840, 545], [620, 640], [400, 545], [220, 630], [120, 470], [150, 330]],
        [80, 80, 80, 80, 80, 90, 120, 110, 80, 80, 80, 80, 80, 70],
      ),
    ],
    slinger: { x: 640, y: 360 },
  }),

  twin: () => {
    const left = roundedPolyline([[-40, 80], [520, 80], [520, 240], [110, 240], [110, 640], [480, 640], [480, 470]], 70);
    const right = mirrorChain(left, { x: true });
    return { paths: [left, right], slinger: { x: 640, y: 330 } };
  },

  crossroads: () => ({
    paths: [
      roundedPolyline([[-40, 150], [1120, 150], [1120, 560], [420, 560], [420, 380]], 90),
      // Path 1 renders on top: it bridges path 0 at two crossings.
      roundedPolyline([[860, -40], [860, 665], [160, 665], [160, 330]], 90),
    ],
    slinger: { x: 680, y: 360 },
  }),

  moon: () => {
    const cx = 640;
    const cy = 360;
    const coil = spiral(cx, cy, 335, 178, Math.PI, 3.5 * Math.PI);
    return { paths: [leadInto(coil, 420)], slinger: { x: cx, y: cy } };
  },

  stair: () => ({
    paths: [
      roundedPolyline(
        [[-40, 70], [1200, 70], [1200, 650], [80, 650], [80, 190], [1070, 190], [1070, 520], [220, 520], [220, 330], [470, 330]],
        60,
      ),
    ],
    slinger: { x: 700, y: 355 },
  }),
};

function buildLayout(name, mirror) {
  const L = LAYOUTS[name]();
  if (!mirror) return L;
  return { paths: L.paths.map((p) => mirrorChain(p, mirror)), slinger: mirrorPoint(L.slinger, mirror) };
}

// --- Power-up unlock tiers (the player's unlocked pool, §1.4) --------------------
const POWERUP_TIERS = [
  ['purpleFire', 'slow', 'wild', 'backwards'],
  ['firebolts', 'colourWipe'],
  ['colourSplash', 'fireflies'],
  ['butterflies', 'fireSpinner'],
  ['frostRay', 'orbOfDecay'],
  ['wrathOfStars', 'sparkShot'],
  ['runeReward'],
];

export function powerupsForTier(tier) {
  return POWERUP_TIERS.slice(0, Math.max(1, Math.min(tier, POWERUP_TIERS.length))).flat();
}

// --- Days ------------------------------------------------------------------------
// colors: palette ids (0 red, 1 blue, 2 green, 3 yellow, 4 purple, 5 black)
// speed.base: per-level speedParams base (orbs/s); waves are per path.

const C4 = [0, 1, 2, 3];
const C5 = [0, 1, 2, 3, 4];
const C6 = [0, 1, 2, 3, 4, 5];

export const DAYS = [
  {
    id: 'd1', name: 'The Mossy Gate', layout: 'meadow', colors: C4, speed: 0.75, target: 45, tier: 1,
    waves: [[{ stock: 70 }, { stock: 50, delay: 10 }]],
    map: { x: 120, y: 600 }, requires: [], unlock: 'suddenFire',
    intro: 'Where the old road dips into the marsh, the first stones begin to roll. Feel their weight before the dark does.',
  },
  {
    id: 'd2', name: "Serpent's Causeway", layout: 'serpent', colors: C4, speed: 0.8, target: 55, tier: 2,
    waves: [[{ stock: 80 }, { stock: 60, delay: 10 }]],
    map: { x: 235, y: 495 }, requires: ['d1'], unlock: 'powerMagnetism',
    intro: 'The causeway winds across black water. Something beneath it pushes the orbs onward, patient and unseen.',
  },
  {
    id: 'd3', name: 'Twin Springs', layout: 'twin', colors: C4, speed: 0.7, target: 60, tier: 3,
    waves: [[{ stock: 50 }, { stock: 35, delay: 12 }], [{ stock: 50 }, { stock: 35, delay: 12 }]],
    map: { x: 340, y: 595 }, requires: ['d2'], unlock: 'hornOfPlenty', key: 'Key of Moss',
    intro: 'Two springs, two lines of stone, one Slinger between them. Beneath the meeting of the waters lies the first key.',
  },
  {
    id: 'd4a', name: 'The Moonwell', layout: 'moon', colors: C5, speed: 0.8, target: 65, tier: 4,
    waves: [[{ stock: 90 }, { stock: 60, delay: 10 }]],
    map: { x: 450, y: 470 }, requires: ['d3'], unlock: 'headStart', branch: 'north',
    intro: 'The northern way passes an old well that coils down into moonlight. The orbs circle it like pilgrims.',
  },
  {
    id: 'd4b', name: 'Fen of Lanterns', layout: 'meadow', mirror: { x: true }, colors: C5, speed: 0.85, target: 65, tier: 4,
    waves: [[{ stock: 90 }, { stock: 60, delay: 10 }]],
    map: { x: 480, y: 650 }, requires: ['d3'], unlock: 'tar', branch: 'south',
    intro: 'The southern way crosses a fen where drowned lanterns still glow. Tread slowly; the stones do not.',
  },
  {
    id: 'd5', name: 'The Crossing Stones', layout: 'crossroads', colors: C5, speed: 0.75, target: 70, tier: 5,
    waves: [[{ stock: 70 }, { stock: 45, delay: 12 }], [{ stock: 55 }, { stock: 35, delay: 12 }]],
    map: { x: 600, y: 560 }, requires: ['d4a', 'd4b'], unlock: 'callOfTheWild',
    intro: 'Here two old roads cross, one bridging the other. Stones under the bridge cannot be struck — only waited for.',
  },
  {
    id: 'd6', name: 'The Drowned Stair', layout: 'stair', colors: C5, speed: 0.9, target: 80, tier: 6,
    waves: [[{ stock: 110 }, { stock: 80, delay: 10 }]],
    map: { x: 680, y: 430 }, requires: ['d5'], unlock: 'eternitySwap', key: 'Key of Tides',
    intro: 'A stair spirals down into flooded ruins. At its heart, beneath the water, the second key waits.',
  },
  {
    id: 'd7', name: 'Rootway', layout: 'serpent', mirror: { y: true }, colors: C5, speed: 0.85, target: 80, tier: 7,
    waves: [[{ stock: 100 }, { stock: 70, delay: 10 }]],
    map: { x: 575, y: 320 }, requires: ['d6'], unlock: 'speedUnleashed',
    intro: 'Roots older than the kingdom have split the road. The line snakes between them, tireless.',
  },
  {
    id: 'd8a', name: 'Hollow Oak', layout: 'twin', mirror: { y: true }, colors: C5, speed: 0.8, target: 85, tier: 7,
    waves: [[{ stock: 65 }, { stock: 45, delay: 12 }], [{ stock: 65 }, { stock: 45, delay: 12 }]],
    map: { x: 440, y: 230 }, requires: ['d7'], unlock: 'runeFire', branch: 'west',
    intro: 'The western path runs through a hollow oak where two streams of stone fall together.',
  },
  {
    id: 'd8b', name: 'The Weeping Circle', layout: 'moon', mirror: { x: true }, colors: C5, speed: 0.9, target: 85, tier: 7,
    waves: [[{ stock: 100 }, { stock: 70, delay: 10 }]],
    map: { x: 660, y: 190 }, requires: ['d7'], unlock: 'orbsUnhatched', branch: 'east',
    intro: 'The eastern path climbs to a ring of weeping stones. The line spirals inward, and the stones weep for it.',
  },
  {
    id: 'd9', name: 'Ember Ford', layout: 'crossroads', mirror: { x: true }, colors: C5, speed: 0.85, target: 90, tier: 7,
    waves: [[{ stock: 80 }, { stock: 55, delay: 12 }], [{ stock: 60 }, { stock: 40, delay: 12 }]],
    map: { x: 800, y: 260 }, requires: ['d8a', 'd8b'], unlock: 'marchBlue', key: 'Key of Embers',
    intro: 'The paths reconverge at a ford where the water runs warm. The third key glows somewhere beneath.',
  },
  {
    id: 'd10', name: 'Barrow Field', layout: 'meadow', mirror: { y: true }, colors: C6, speed: 0.95, target: 95, tier: 7,
    waves: [[{ stock: 120 }, { stock: 80, delay: 10 }]],
    map: { x: 915, y: 350 }, requires: ['d9'], unlock: 'flamePurple',
    intro: 'The barrows are open. Black stones roll out among the others now, heavy as grief.',
  },
  {
    id: 'd11', name: 'Tower of Slate', layout: 'stair', mirror: { x: true }, colors: C6, speed: 1.0, target: 100, tier: 7,
    waves: [[{ stock: 130 }, { stock: 90, delay: 10 }]],
    map: { x: 1015, y: 460 }, requires: ['d10'], unlock: 'retreatOrders', key: 'Key of Stars',
    intro: 'A broken tower, its stair winding inward. The fourth key hangs where the stars can see it.',
  },
  {
    id: 'd12a', name: 'Ashen Vale', layout: 'twin', colors: C6, speed: 0.82, target: 105, tier: 7,
    waves: [[{ stock: 75 }, { stock: 55, delay: 12 }], [{ stock: 75 }, { stock: 55, delay: 12 }]],
    map: { x: 960, y: 610 }, requires: ['d11'], unlock: 'marchOfTheFurious', branch: 'low',
    intro: 'The low road runs through a vale of ash where two lines descend together.',
  },
  {
    id: 'd12b', name: 'The Long Night Road', layout: 'serpent', colors: C6, speed: 0.92, target: 105, tier: 7,
    waves: [[{ stock: 130 }, { stock: 90, delay: 10 }]],
    map: { x: 1140, y: 590 }, requires: ['d11'], unlock: 'redNoMore', branch: 'high',
    intro: 'The high road never sees the sun. It winds back and forth, and the line winds with it.',
  },
  {
    id: 'd13', name: 'Moonfall Spiral', layout: 'moon', colors: C6, speed: 1.0, target: 110, tier: 7,
    waves: [[{ stock: 130 }, { stock: 90, delay: 10 }]],
    map: { x: 1160, y: 390 }, requires: ['d12a', 'd12b'], unlock: 'tranquility',
    intro: 'Where the moon once fell, the ground coils inward. The Abyss is close now; you can hear it breathe.',
  },
  {
    id: 'd14', name: 'Heart of the Abyss', layout: 'crossroads', colors: C6, speed: 0.88, target: 120, tier: 7,
    waves: [[{ stock: 100 }, { stock: 70, delay: 12 }], [{ stock: 80 }, { stock: 55, delay: 12 }]],
    map: { x: 1080, y: 200 }, requires: ['d13'], key: 'Key of Night',
    intro: 'The last key rests at the edge of the Abyss itself. Seal the Circle one final time.',
  },
];

export const PROLOGUE =
  'Long ago, five enchanted keys sealed the Abyss beneath the old kingdom. Now they lie scattered, and the dark rolls ' +
  'out of the earth in lines of living stone. Take up the Slinger, Keeper. Fill the Rune Circles. Bring the keys home.';

export const EPILOGUE =
  'The five keys turn as one. Far below, the Abyss sighs and closes, and the stones grow still in the moss. ' +
  'The marsh is quiet again — for now.';

export const DAY_BY_ID = Object.fromEntries(DAYS.map((d) => [d.id, d]));

/** Build a playable level definition for a day. */
export function buildLevel(day) {
  const L = buildLayout(day.layout, day.mirror);
  return {
    id: day.id,
    name: day.name,
    colors: day.colors,
    speed: { base: day.speed },
    runeTarget: day.target,
    slinger: L.slinger,
    paths: L.paths.map((beziers, i) => ({ beziers, waves: day.waves[i] || day.waves[0] })),
    theme: day.id,
  };
}

export function layoutNames() {
  return Object.keys(LAYOUTS);
}
