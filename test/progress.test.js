import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENCHANT_BY_ID, ENCHANT_GROUPS, ENCHANTMENTS, POWERUP_IDS, POWERUPS } from '../src/defs.js';
import { DAY_BY_ID, DAYS, powerupsForTier } from '../src/levels.js';
import { dayNovelty, newlyOpenedDays } from '../src/progress.js';
import {
  clearsToUnlock,
  defaultSave,
  enchantmentForClear,
  equip,
  equippedInGroup,
  loadSave,
  sanitizeLoadout,
  unlockedEnchantments,
  unseenEnchantments,
} from '../src/save.js';
import { KEY_GEMS, KEY_NAMES } from '../src/ui/keyArt.js';

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
  const save = withStorage({ completed: ['d1', 'd2'], loadout: ['speedUnleashed'] }, loadSave);
  assert.deepEqual(save.seenEnchantments, ['speedUnleashed', 'tranquility']);
  assert.deepEqual(save.seenPowerups, powerupsForTier(2));
  assert.deepEqual(unseenEnchantments(save), []);
});

test('a fresh save knows nothing; unseen enchantments follow clears', () => {
  const save = withStorage(null, loadSave);
  assert.deepEqual(save.seenEnchantments, []);
  assert.deepEqual(save.seenPowerups, []);
  save.completed.push('d1');
  assert.deepEqual(unseenEnchantments(save), ['speedUnleashed']);
});

test('enchantments come in four groups of four, each with a socket name', () => {
  assert.equal(ENCHANT_GROUPS.length, 4);
  for (let g = 0; g < ENCHANT_GROUPS.length; g++) {
    assert.ok(ENCHANT_GROUPS[g].name);
    assert.equal(ENCHANTMENTS.filter((e) => e.group === g).length, 4, `group ${g}`);
  }
  // unlock order finishes each group before the next begins
  assert.deepEqual(ENCHANTMENTS.map((e) => e.group), [...ENCHANTMENTS.map((e) => e.group)].sort());
});

test('the Nth first clear unlocks the Nth enchantment, whichever branch it was', () => {
  const route = (...ids) => ({ ...defaultSave(), completed: ids });
  const north = route('d1', 'd2', 'd3', 'd4a');
  const south = route('d1', 'd2', 'd3', 'd4b');
  const group0 = ENCHANTMENTS.filter((e) => e.group === 0).map((e) => e.id);
  assert.deepEqual(unlockedEnchantments(north), group0);
  assert.deepEqual(unlockedEnchantments(south), group0);
  assert.equal(enchantmentForClear(north, 'd4a').id, 'powerMagnetism');
  assert.equal(enchantmentForClear(north, 'd1').id, 'speedUnleashed');
  // every open day offers the next one in line: the first of the Ammo group
  assert.equal(enchantmentForClear(north, 'd5').id, 'hornOfPlenty');
  assert.equal(enchantmentForClear(north, 'd4b').id, 'hornOfPlenty');
  assert.equal(clearsToUnlock(north, 'suddenFire'), 2);
  assert.equal(clearsToUnlock(north, 'tranquility'), 0);
  // the tutorial and unknown ids never count as clears
  assert.deepEqual(unlockedEnchantments(route('tutorial')), []);
  // clearing every day unlocks all sixteen; nothing is left to offer
  const all = route(...DAYS.map((d) => d.id));
  assert.equal(unlockedEnchantments(all).length, ENCHANTMENTS.length);
  assert.equal(enchantmentForClear(all, DAYS[DAYS.length - 1].id), null);
});

test('one enchantment per group: equip replaces within the group, sanitize keeps the first', () => {
  const save = { ...defaultSave(), completed: DAYS.map((d) => d.id), loadout: [] };
  equip(save, 1, 'suddenFire');
  equip(save, 0, 'tranquility');
  equip(save, 1, 'flamePurple');
  assert.deepEqual(save.loadout, ['tranquility', 'flamePurple']);
  assert.equal(equippedInGroup(save, 1), 'flamePurple');
  equip(save, 1, 'tar'); // wrong group: the socket just empties
  assert.equal(equippedInGroup(save, 1), null);
  equip(save, 0, null);
  assert.deepEqual(save.loadout, []);
  save.loadout = ['suddenFire', 'callOfTheWild', 'tar', 'nope'];
  sanitizeLoadout(save);
  assert.deepEqual(save.loadout, ['suddenFire', 'tar']);
  const early = { ...defaultSave(), completed: ['d1'], loadout: ['speedUnleashed', 'tar'] };
  sanitizeLoadout(early);
  assert.deepEqual(early.loadout, ['speedUnleashed']);
  assert.ok(ENCHANT_BY_ID.speedUnleashed);
});

test('the five keys each have their own gem colour', () => {
  assert.equal(KEY_NAMES.length, 5);
  for (const name of KEY_NAMES) assert.ok(KEY_GEMS[name], `${name} has a gem`);
  assert.equal(new Set(KEY_NAMES.map((n) => KEY_GEMS[n])).size, 5);
});
