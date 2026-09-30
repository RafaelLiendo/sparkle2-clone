// Progress persistence (localStorage, guarded — the game runs fine without it).
// Meta-progression is level-completion-gated only (§5): no currency anywhere.

import { DIFFICULTY_BY_ID, ENCHANT_BY_ID, ENCHANTMENTS, MAX_LOADOUT } from './defs.js';
import { DAY_BY_ID, DAYS, powerupsForTier } from './levels.js';

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

/** Story days cleared, in the order of their first clear. */
function storyClears(save) {
  return save.completed.filter((id) => DAY_BY_ID[id]);
}

/** The Nth first clear of any Story day unlocks the Nth enchantment (§5), whichever branch it was. */
export function unlockedEnchantments(save) {
  return ENCHANTMENTS.slice(0, storyClears(save).length).map((e) => e.id);
}

/**
 * The enchantment a day's first clear brings: for a cleared day the one it unlocked, for any
 * other day the next one in line (null once all are unlocked).
 */
export function enchantmentForClear(save, dayId) {
  const clears = storyClears(save);
  const at = clears.indexOf(dayId);
  return ENCHANTMENTS[at >= 0 ? at : clears.length] || null;
}

/** Clears still needed before `id` unlocks (0 when it already is). */
export function clearsToUnlock(save, id) {
  return Math.max(0, ENCHANTMENTS.indexOf(ENCHANT_BY_ID[id]) + 1 - storyClears(save).length);
}

/** The enchantment equipped in a group's socket, or null. */
export function equippedInGroup(save, group) {
  return save.loadout.find((id) => ENCHANT_BY_ID[id]?.group === group) || null;
}

/** Fill a group's socket with `id`, or empty it with null. One enchantment per group. */
export function equip(save, group, id) {
  save.loadout = save.loadout.filter((x) => ENCHANT_BY_ID[x]?.group !== group);
  if (id && ENCHANT_BY_ID[id]?.group === group) save.loadout.push(id);
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

/** Keep only unlocked loadout entries, one per group (e.g. after a reset or an old save). */
export function sanitizeLoadout(save) {
  const unlocked = new Set(unlockedEnchantments(save));
  const groups = new Set();
  save.loadout = save.loadout.filter((id) => {
    const g = ENCHANT_BY_ID[id]?.group;
    if (!unlocked.has(id) || groups.has(g)) return false;
    groups.add(g);
    return true;
  }).slice(0, MAX_LOADOUT);
}
