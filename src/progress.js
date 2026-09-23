// Story progress queries for the UI: what a day introduces and what clearing it opens.

import { DAY_BY_ID, DAYS, powerupsForTier } from './levels.js';
import { isAvailable } from './save.js';

/**
 * Stone colours and power-ups a day adds on top of the days that lead to it.
 * The first day has no predecessor, so its pool is the baseline and nothing is new.
 */
export function dayNovelty(day) {
  if (!day.requires.length) return { newColors: [], newPowerups: [] };
  const prev = day.requires.map((id) => DAY_BY_ID[id]);
  const oldColors = new Set(prev.flatMap((d) => d.colors));
  const oldPowerups = new Set(powerupsForTier(Math.max(...prev.map((d) => d.tier))));
  return {
    newColors: day.colors.filter((c) => !oldColors.has(c)),
    newPowerups: powerupsForTier(day.tier).filter((p) => !oldPowerups.has(p)),
  };
}

/** Days that completing `dayId` makes playable for the first time. */
export function newlyOpenedDays(save, dayId) {
  const before = { ...save, completed: save.completed.filter((id) => id !== dayId) };
  const after = { ...save, completed: [...before.completed, dayId] };
  return DAYS.filter((d) => !after.completed.includes(d.id) && !isAvailable(before, d) && isAvailable(after, d)).map((d) => d.id);
}
