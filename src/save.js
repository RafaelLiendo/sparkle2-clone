// Progress persistence (localStorage, guarded — the game runs fine without it).
// Meta-progression is level-completion-gated only (§5): no currency anywhere.

import { MAX_LOADOUT } from './defs.js';
import { DAYS } from './levels.js';

const KEY = 'sparkle2clone.save.v1';

export function defaultSave() {
  return {
    completed: [],
    loadout: [],
    seenPrologue: false,
    options: { reducedFlashing: false, musicVolume: 0.6, sfxVolume: 0.85, muted: false },
  };
}

export function loadSave() {
  const base = defaultSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    return {
      ...base,
      ...data,
      options: { ...base.options, ...(data.options || {}) },
      completed: Array.isArray(data.completed) ? data.completed : [],
      loadout: Array.isArray(data.loadout) ? data.loadout.slice(0, MAX_LOADOUT) : [],
    };
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

/** Drop loadout entries that are no longer unlocked (e.g. after a reset). */
export function sanitizeLoadout(save) {
  const unlocked = new Set(unlockedEnchantments(save));
  save.loadout = save.loadout.filter((id) => unlocked.has(id)).slice(0, MAX_LOADOUT);
}
