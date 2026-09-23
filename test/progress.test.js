import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POWERUP_IDS, POWERUPS } from '../src/defs.js';
import { DAY_BY_ID, DAYS, powerupsForTier } from '../src/levels.js';
import { dayNovelty, newlyOpenedDays } from '../src/progress.js';
import { defaultSave, loadSave, unseenEnchantments } from '../src/save.js';

const PURPLE = 4;
const BLACK = 5;

test('dayNovelty announces the stones and power-ups each day adds', () => {
  const n = (id) => dayNovelty(DAY_BY_ID[id]);
  assert.deepEqual(n('d1'), { newColors: [], newPowerups: [] });
  assert.deepEqual(n('d2'), { newColors: [], newPowerups: ['firebolts', 'colourWipe'] });
  assert.deepEqual(n('d4a'), { newColors: [PURPLE], newPowerups: ['butterflies', 'fireSpinner'] });
  assert.deepEqual(n('d4b'), n('d4a'));
  assert.deepEqual(n('d7'), { newColors: [], newPowerups: ['runeReward'] });
  assert.deepEqual(n('d10'), { newColors: [BLACK], newPowerups: [] });
  assert.deepEqual(n('d5'), { newColors: [], newPowerups: ['frostRay', 'orbOfDecay'] });
});

test('every power-up is either in the first-day pool or announced by some day', () => {
  const all = new Set([...powerupsForTier(DAYS[0].tier), ...DAYS.flatMap((d) => dayNovelty(d).newPowerups)]);
  assert.deepEqual([...all].sort(), [...POWERUP_IDS].sort());
});

test('every power-up has player-facing text', () => {
  for (const id of POWERUP_IDS) assert.ok(POWERUPS[id].text?.length > 10, id);
});

test('newlyOpenedDays lists the days a first clear makes reachable', () => {
  const save = { ...defaultSave(), completed: ['d1', 'd2', 'd3'] };
  assert.deepEqual(newlyOpenedDays(save, 'd3'), ['d4a', 'd4b']);
  // branches reconverge: clearing the second branch opens nothing new
  const both = { ...defaultSave(), completed: ['d1', 'd2', 'd3', 'd4a', 'd4b'] };
  assert.deepEqual(newlyOpenedDays(both, 'd4b'), []);
  assert.deepEqual(newlyOpenedDays({ ...defaultSave(), completed: ['d1', 'd2', 'd3', 'd4b'] }, 'd4b'), ['d5']);
});

function withStorage(data, fn) {
  const prev = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => (data ? JSON.stringify(data) : null), setItem() {} };
  try {
    return fn();
  } finally {
    globalThis.localStorage = prev;
  }
}

test('saves from before the seen lists treat earned enchantments and power-ups as known', () => {
  const save = withStorage({ completed: ['d1', 'd2'], loadout: ['suddenFire'] }, loadSave);
  assert.deepEqual(save.seenEnchantments, ['suddenFire', 'powerMagnetism']);
  assert.deepEqual(save.seenPowerups, powerupsForTier(2));
  assert.deepEqual(unseenEnchantments(save), []);
});

test('a fresh save knows nothing; unseen enchantments follow clears', () => {
  const save = withStorage(null, loadSave);
  assert.deepEqual(save.seenEnchantments, []);
  assert.deepEqual(save.seenPowerups, []);
  save.completed.push('d1');
  assert.deepEqual(unseenEnchantments(save), ['suddenFire']);
});
