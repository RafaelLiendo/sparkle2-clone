import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { colors, makeGame, place, run, shoot } from './helpers.js';

const R = 0;
const B = 1;
const G = 2;
const Y = 3;

test('fired orb completing 3 pops after the settle delay, never on the collision frame', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const [, r1] = place(g, t, [B, R, R, B]);
  shoot(g, r1, { color: R });
  assert.deepEqual(colors(t), [B, R, R, R, B]);
  run(g, CONFIG.insertSettleDelay - 0.03);
  assert.equal(t.orbs.length, 5, 'not popped before insertSettleDelay');
  run(g, 0.06);
  assert.deepEqual(colors(t), [B, B]);
  assert.equal(g.combo, 1);
  assert.equal(g.runeProgress, 3);
});

test('no-match normal shot resets the combo; special shots are combo-neutral', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const [b0] = place(g, t, [B, G, Y, B]);
  g.combo = 4;
  shoot(g, b0, { color: R });
  run(g, 0.3);
  assert.equal(g.combo, 0);

  g.combo = 4;
  const target = t.orbs[2];
  g.impact({ kind: 'firebolt', x: target.x, y: target.y, r: 0.25 }, { track: t, orb: target });
  run(g, 0.3);
  assert.equal(g.combo, 4, 'Firebolt destroying an orb does not touch the counter');
});

test('Wild bridges two different colours into one run (2 red + Wild + 1 blue = 4)', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const orbs = place(g, t, [G, R, R, B, Y]);
  shoot(g, orbs[2], { kind: 'wild', color: R, after: true });
  assert.deepEqual(colors(t), [G, R, R, 'W', B, Y]);
  g.combo = 2;
  run(g, 0.3);
  assert.deepEqual(colors(t), [G, Y]);
  assert.equal(g.combo, 2, 'a Wild match is a real pop but combo-neutral');
});

test('rapid-shove: lone orb built 1→2→3 still pops once, combo 5 → 0 → 1', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const orbs = place(g, t, [B, R, B, G]);
  g.combo = 5;
  shoot(g, orbs[1], { color: R }); // pair only (hypothetical fails)
  run(g, 0.05);
  shoot(g, orbs[1], { color: R }); // now three
  assert.deepEqual(colors(t), [B, R, R, R, B, G]);
  run(g, 0.3);
  assert.deepEqual(colors(t), [B, B, G]);
  assert.equal(g.combo, 1);
});

test('rapid-shove hold: nothing resolves while an insert-capable projectile is in flight', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const orbs = place(g, t, [B, R, R, B]);
  shoot(g, orbs[1], { color: R });
  g.projectiles.push({ kind: 'normal', color: 0, x: 600, y: 700, dx: 0, dy: 1, speed: 0.0001, r: 0.5, insert: true });
  run(g, 0.5);
  assert.equal(t.orbs.length, 5, 'held');
  g.projectiles = [];
  run(g, 0.05);
  assert.deepEqual(colors(t), [B, B]);
});

test('pending orb destroyed while held is consumed silently (never a miss)', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const orbs = place(g, t, [B, G, Y, B]);
  g.combo = 3;
  shoot(g, orbs[1], { color: R, after: true });
  const fresh = t.orbs[2];
  g.destroyOrbs(t, [fresh], 'firebolt');
  run(g, 0.3);
  assert.equal(g.combo, 3);
});

test('every 3rd combo increment drops a power-up icon at the pop centroid', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const orbs = place(g, t, [B, R, R, B]);
  g.combo = 2;
  shoot(g, orbs[1], { color: R });
  run(g, 0.2);
  assert.equal(g.combo, 3);
  assert.equal(g.icons.length, 1);
});

test('recolor never triggers a match check by itself', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const orbs = place(g, t, [B, R, G, R, B]);
  g.recolor(orbs[2], R, 'splash');
  run(g, 0.5);
  assert.deepEqual(colors(t), [B, R, R, R, B], 'a 3-run formed in place stays as a set-up');
});

test('all-Wild remaining line pops itself; a lone Wild segment beside colours does not', () => {
  const g = makeGame();
  const t = g.tracks[0];
  place(g, t, ['W', 'W']);
  run(g, 0.05);
  assert.equal(t.orbs.length, 0);

  const g2 = makeGame();
  const t2 = g2.tracks[0];
  place(g2, t2, ['W', null, null, null, R, B]);
  run(g2, 0.05);
  assert.ok(t2.orbs.some((o) => o.wild));
});
