// Progress persistence (localStorage, guarded — the game runs fine without it).
// Meta-progression is level-completion-gated only (§5): no currency anywhere.

import { DIFFICULTY_BY_ID, MAX_LOADOUT } from './defs.js';
import { DAYS, powerupsForTier } from './levels.js';

const KEY = 'sparkle2clone.save.v1';

export function defaultSave() {
  return {
    completed: [],
    loadout: [],
    seenPrologue: false,
    seenTutorial: false, // How to Play shown once, before the first day begun
    seenEnchantments: [], // unlocked enchantments the player has looked at in the menu
    seenPowerups: [], // power-up types the player has collected at least once
    options: { reducedFlashing: false, musicVolume: 0.6, sfxVolume: 0.85, muted: false, difficulty: 'normal' },
  };
}

export function loadSave() {
  const base = defaultSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    const options = { ...base.options, ...(data.options || {}) };
    if (!DIFFICULTY_BY_ID[options.difficulty]) options.difficulty = base.options.difficulty;
    const save = {
      ...base,
      ...data,
      options,
      completed: Array.isArray(data.completed) ? data.completed : [],
      loadout: Array.isArray(data.loadout) ? data.loadout.slice(0, MAX_LOADOUT) : [],
    };
    // Saves from before these lists existed: treat everything already earned as known.
    if (!Array.isArray(data.seenEnchantments)) save.seenEnchantments = unlockedEnchantments(save);
    if (!Array.isArray(data.seenPowerups)) save.seenPowerups = knownPowerups(save);
    return save;
  } catch {
    return base;
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable: progress lasts for this session only */
  }
}

export function isCompleted(save, id) {
  return save.completed.includes(id);
}

/** A day is playable once any of its prerequisites is complete (branches reconverge). */
export function isAvailable(save, day) {
  return day.requires.length === 0 || day.requires.some((r) => save.completed.includes(r));
}

export function unlockedEnchantments(save) {
  return DAYS.filter((d) => d.unlock && save.completed.includes(d.id)).map((d) => d.unlock);
}

export function keysCollected(save) {
  return DAYS.filter((d) => d.key && save.completed.includes(d.id)).map((d) => d.key);
}

/** Enchantments unlocked but not yet looked at in the Enchantments menu. */
export function unseenEnchantments(save) {
  return unlockedEnchantments(save).filter((id) => !save.seenEnchantments.includes(id));
}

/** Power-up pool of the furthest day completed (empty before the first clear). */
function knownPowerups(save) {
  const tiers = DAYS.filter((d) => save.completed.includes(d.id)).map((d) => d.tier);
  return tiers.length ? powerupsForTier(Math.max(...tiers)) : [];
}

/** Drop loadout entries that are no longer unlocked (e.g. after a reset). */
export function sanitizeLoadout(save) {
  const unlocked = new Set(unlockedEnchantments(save));
  save.loadout = save.loadout.filter((id) => unlocked.has(id)).slice(0, MAX_LOADOUT);
}
