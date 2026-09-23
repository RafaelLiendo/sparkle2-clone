// Canonical content definitions: palette (§2.1), power-ups (§4), enchantments (§5).

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (f >= 0) {
    r += (255 - r) * f;
    g += (255 - g) * f;
    b += (255 - b) * f;
  } else {
    r *= 1 + f;
    g *= 1 + f;
    b *= 1 + f;
  }
  const h = (x) => Math.round(x).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

const BASE = [
  ['red', '#B82A09'],
  ['blue', '#095FB8'],
  ['green', '#0FB809'],
  ['yellow', '#B8860C'],
  ['purple', '#B80E9E'],
  ['black', '#33302A'],
];

/** Palette: index = color id. Base colors are §2.1 exactly; hi/lo/glow are derived shades. */
export const COLORS = BASE.map(([name, base], id) => ({
  id,
  name,
  base,
  hi: shade(base, name === 'black' ? 0.35 : 0.3),
  lo: shade(base, -0.55),
  glow: shade(base, name === 'black' ? 0.75 : 0.55),
}));

export const RED = 0;
export const BLUE = 1;

/** Power-up roster (§4). `armed` types load queue charges; the rest act on collection. */
export const POWERUPS = {
  purpleFire: { name: 'Purple Fire', armed: true },
  slow: { name: 'Slow', armed: false, timed: true },
  wild: { name: 'Wild', armed: true },
  backwards: { name: 'Backwards', armed: false, timed: true },
  firebolts: { name: 'Firebolts x3', armed: true },
  colourWipe: { name: 'Colour Wipe', armed: false },
  colourSplash: { name: 'Colour Splash', armed: true },
  butterflies: { name: 'Flight of the Butterflies', armed: false, timed: true },
  fireSpinner: { name: 'Fire Spinner', armed: false },
  fireflies: { name: 'Fireflies', armed: false, timed: true },
  frostRay: { name: 'Frost Ray', armed: true },
  orbOfDecay: { name: 'Orb of Decay', armed: true },
  wrathOfStars: { name: 'Wrath of the Stars', armed: false, timed: true },
  sparkShot: { name: 'Spark Shot', armed: true },
  runeReward: { name: 'Rune Reward', armed: false },
};

export const POWERUP_IDS = Object.keys(POWERUPS);

/** Ammo kinds living in the Slinger queue (§2.2, §3). */
export const AMMO = {
  normal: { insert: true, projectile: true },
  wild: { insert: true, projectile: true },
  firebolt: { insert: false, projectile: true, small: true },
  purple: { insert: false, projectile: true },
  splash: { insert: false, projectile: true },
  decay: { insert: false, projectile: true },
  frost: { insert: false, projectile: false },
  spark: { insert: false, projectile: false },
};

/** Enchantments (§5), in canonical table order. */
export const ENCHANTMENTS = [
  { id: 'suddenFire', name: 'Sudden Fire', text: 'Every 10th orb loaded into the Slinger is a Firebolt.' },
  { id: 'flamePurple', name: 'Flame Purple', text: 'Every 20th loaded orb is a Purple Flame shot.' },
  { id: 'callOfTheWild', name: 'Call of the Wild', text: 'Every 10th loaded orb is a Wild Orb.' },
  { id: 'hornOfPlenty', name: 'Horn of Plenty', text: 'The Slinger holds 4 orbs instead of 3.' },
  { id: 'eternitySwap', name: 'Eternity Swap', text: 'Swap sends the loaded orb to the back of the queue.' },
  { id: 'speedUnleashed', name: 'Speed Unleashed', text: 'Fired orbs travel faster.' },
  { id: 'powerMagnetism', name: 'Power Magnetism', text: 'Dropped power-ups drift toward the Slinger.' },
  { id: 'headStart', name: 'Head Start', text: 'The Rune Circle starts each day with runes pre-lit.' },
  { id: 'runeFire', name: 'Rune Fire', text: 'A Fire Spinner erupts after every 6 runes lit.' },
  { id: 'retreatOrders', name: 'Retreat Orders', text: 'Completing the Rune Circle pushes the orb lines back.' },
  { id: 'marchOfTheFurious', name: 'March of the Furious', text: 'Completing the Rune Circle releases the Butterflies.' },
  { id: 'marchBlue', name: 'March Blue', text: 'Every blue-orb match releases the Butterflies.' },
  { id: 'orbsUnhatched', name: 'Orbs Unhatched', text: 'Every red-orb match summons Fireflies.' },
  { id: 'redNoMore', name: 'Red No More', text: 'Red orbs no longer appear, but the lines move faster.' },
  { id: 'tar', name: 'Tar', text: 'Orb lines move slower.' },
  { id: 'tranquility', name: 'Tranquility', text: 'A calmer pace, but the Rune Circle asks for more.' },
];

export const ENCHANT_BY_ID = Object.fromEntries(ENCHANTMENTS.map((e) => [e.id, e]));
export const MAX_LOADOUT = 4;

/** Difficulty levels; each scales line speed by `CONFIG.difficultySpeed[id]`. */
export const DIFFICULTIES = [
  { id: 'normal', name: 'Normal' },
  { id: 'hard', name: 'Hard' },
  { id: 'nightmare', name: 'Nightmare' },
];
export const DIFFICULTY_BY_ID = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d]));
