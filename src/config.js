// Tunables. Every value here is a canonical default from sparkle2-glossary.md unless
// marked "free detail" (a value the spec leaves to the implementation).
// Override at runtime with URL params, e.g. `?tune.attractMax=50&tune.abyssGrace=5`.

export const CONFIG = {
  // --- Units -------------------------------------------------------------------
  canvasW: 1280,
  canvasH: 720,
  orbDiameterPx: 50,

  // --- Match / settle (§1.1) ---------------------------------------------------
  insertSettleDelay: 0.13,

  // --- Gap attraction (§1.2) ---------------------------------------------------
  attractBase: 8,
  attractAccel: 45,
  attractMax: 40,
  snapEpsilon: 0.04,

  // --- Slinger (§2.2) ----------------------------------------------------------
  queueSize: 3,
  queueSizeHorn: 4,
  reloadTime: 0.25,
  fireCooldown: 0.17,
  projSpeed: 32, // 27 at 60 px orbs; scaled to keep ~1600 px/s on screen
  speedUnleashedMult: 1.4, // free detail
  muzzleOffset: 0.55, // free detail (orbs from slinger centre)

  // --- Power-up icons (§1.4) ---------------------------------------------------
  runeDriftSpeed: 0.5,
  runeTowardBias: 0.2,
  runeTowardBiasMagnet: 0.8,
  runeLife: 8,
  runeMax: 3,
  runeMargin: 1.6,
  runeIconRadius: 0.55, // free detail (collision radius, orbs)
  antiRepeatReroll: 0.8,
  powerupWeights: {
    purpleFire: 30,
    slow: 25,
    wild: 25,
    backwards: 20,
    firebolts: 14,
    colourWipe: 10,
    colourSplash: 10,
    butterflies: 10,
    fireSpinner: 10,
    fireflies: 10,
    frostRay: 10,
    orbOfDecay: 10,
    wrathOfStars: 10,
    sparkShot: 10,
    runeReward: 6,
  },

  // --- Orb line motion (§2.3) --------------------------------------------------
  splitGap: 1.04, // one diameter + snap epsilon
  recoilDistance: 2,
  recoilDecay: 3,
  speedSmoothing: 0.4,
  speedParams: {
    base: 4,
    rolloutMult: 5,
    rolloutUntil: 0.25,
    dangerFrom: 0.75,
    dangerMult: 0.5,
  },
  overtakeDistance: 1.6,

  // --- Abyss (§1.6, §2.5) ------------------------------------------------------
  abyssGrace: 3,
  drainBase: 12,
  drainAccel: 21,
  ABYSS_RADIUS: 0.6,

  // --- Paths (§2.5) ------------------------------------------------------------
  spawnLeadOrbs: 20,
  crossoverCover: 0.8,

  // --- Special orbs & power-ups (§3, §4) ---------------------------------------
  effectProjSize: 0.5,
  bombRadius: 6,
  splashRadius: 2.8,
  slowFactor: 0.4,
  slowDuration: 6,
  backwardsSpeed: -4,
  backwardsDuration: 4,
  butterflyCount: 6,
  butterflySpeed: 9, // free detail value
  critterStagger: 0.22, // free detail value
  spinnerPellets: 12,
  pelletSpeed: 19, // free detail value
  sparkPellets: 7,
  sparkSpread: 0.55,
  fireflyCount: 4,
  fireflyTravel: 1.1, // free detail value
  frostBaseWidth: 3,
  frostWidthGain: 0.05,
  decaySpread: 6,
  starCount: 8,
  starFall: 0.9, // free detail value
  starRadius: 0.5,

  // --- Enchantments (§5) — magnitudes are free details -------------------------
  suddenFireEvery: 10,
  flamePurpleEvery: 20,
  callOfTheWildEvery: 10,
  runeFireEvery: 6,
  headStartPips: 2,
  tarMult: 0.8,
  tranquilityMult: 0.8,
  tranquilityTargetMult: 1.2,
  redNoMoreMult: 1.2,
  retreatSpeed: -4,
  retreatDuration: 2.5,

  // --- Difficulty --------------------------------------------------------------
  // Line-speed multiplier on each day's speedParams.base.
  difficultySpeed: { normal: 2, hard: 3, nightmare: 4 },

  // --- Simulation --------------------------------------------------------------
  simHz: 120,
};

export const RUNE_PIPS = 12;

/** Apply `?tune.key=value` (or `?tune.speedParams.base=2`) overrides. */
export function applyTuningOverrides(search) {
  const params = new URLSearchParams(search);
  for (const [k, v] of params) {
    if (!k.startsWith('tune.')) continue;
    const keys = k.slice(5).split('.');
    let obj = CONFIG;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj?.[keys[i]];
    }
    const last = keys[keys.length - 1];
    if (obj && typeof obj[last] === 'number' && Number.isFinite(Number(v))) {
      obj[last] = Number(v);
    }
  }
}
