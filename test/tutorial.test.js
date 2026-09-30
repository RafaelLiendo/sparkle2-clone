import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { applyBeat, newTutorialGame, planTutorial, TUTORIAL_ORBS } from '../src/game/tutorialPlan.js';
import { colors, DT, makeGame, run } from './helpers.js';

const R = 0;
const Y = 3;
const G = 2;

/** Replay the plan on a fresh game; returns the events of each beat's stretch, keyed by beat id. */
function replay() {
  const { beats } = planTutorial();
  const g = newTutorialGame();
  const seen = {};
  let step = 0;
  let prev = 'start';
  for (const b of beats) {
    const ev = [];
    while (step < b.pauseAt) {
      g.update(DT);
      step++;
      ev.push(...g.drainEvents());
    }
    seen[prev] = ev;
    seen[`${b.id}@`] = { orbs: g.tracks[0].orbs.map((o) => ({ ...o, track: null })), queue: g.slinger.queue.slice() };
    applyBeat(g, b);
    prev = b.id;
  }
  return { g, seen, beats };
}

test('fork continues exactly like the original', () => {
  const a = makeGame({ waves: [{ stock: 30 }] });
  run(a, 1.3);
  a.aimAt(700, 200);
  a.fire();
  const b = a.fork();
  run(a, 2);
  run(b, 2);
  assert.deepEqual(colors(b.tracks[0]), colors(a.tracks[0]));
  assert.deepEqual(
    b.tracks[0].orbs.map((o) => o.s),
    a.tracks[0].orbs.map((o) => o.s),
  );
  assert.equal(b.rng.state, a.rng.state);
  assert.notEqual(b.tracks[0], a.tracks[0]);
  assert.equal(b.tracks[0].game, b);
  assert.equal(b.paths[0], a.paths[0]); // immutable paths are shared
});

test('a scripted line and scripted ammo are used as given', () => {
  const g = newTutorialGame();
  assert.deepEqual(colors(g.tracks[0]), TUTORIAL_ORBS);
  assert.equal(g.tracks[0].orbs.at(-1).s, 0);
  assert.deepEqual(
    g.slinger.queue.map((q) => q.color),
    [G, G, R],
  );
  // days keep their global rollout; a level may override it
  assert.equal(makeGame().speedParams.rolloutMult, CONFIG.speedParams.rolloutMult);
  assert.equal(g.speedParams.rolloutMult, 26);
});

test('the tutorial plan plays out lesson by lesson', () => {
  const { g, seen, beats } = replay();
  assert.deepEqual(
    beats.map((b) => b.id),
    ['fire1', 'fire2', 'swap', 'fire3', 'collect', 'blast', 'end'],
  );
  for (let i = 1; i < beats.length; i++) assert.ok(beats[i].pauseAt > beats[i - 1].pauseAt);
  for (const b of beats) assert.ok(b.aimFrom <= b.pauseAt);

  // the whole line is on screen when the first lesson pauses
  for (const o of seen['fire1@'].orbs) assert.ok(o.x > 0 && o.x < CONFIG.canvasW && o.y > 0 && o.y < CONFIG.canvasH);

  // shot 1: two greens side by side, nothing pops
  assert.ok(!seen.fire1.some((e) => e.type === 'pop'));
  assert.equal(seen['fire2@'].orbs.filter((o) => o.color === G).length, 2);

  // shot 2: three greens match
  const gPop = seen.fire2.find((e) => e.type === 'pop');
  assert.ok(gPop && gPop.points.length === 3 && gPop.points.every((p) => p.color === G));

  // the Slinger holds red, then yellow
  assert.deepEqual(
    seen['swap@'].queue.slice(0, 2).map((q) => q.color),
    [R, Y],
  );

  // shot 3: yellows match, the reds roll together and match, combo 3 drops Purple Fire
  const p3 = seen.fire3.filter((e) => e.type === 'pop');
  assert.equal(p3.length, 2);
  assert.ok(p3[0].points.every((p) => p.color === Y) && p3[0].combo === 2);
  assert.ok(p3[1].points.every((p) => p.color === R) && p3[1].cascade && p3[1].combo === 3);
  assert.ok(seen.fire3.some((e) => e.type === 'drop' && e.ptype === 'purpleFire'));
  assert.ok(seen.fire3.some((e) => e.type === 'recoil'));

  // the shot collects the power-up, then the Purple Flame clears the line and wins
  assert.ok(seen.collect.some((e) => e.type === 'collect' && e.ptype === 'purpleFire'));
  assert.ok(seen.blast.some((e) => e.type === 'dissolve' && e.cause === 'purple'));
  assert.ok(seen.blast.some((e) => e.type === 'sealed'));
  assert.equal(g.orbCount(), 0);
  assert.equal(g.state, 'won');
});
