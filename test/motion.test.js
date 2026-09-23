import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { colors, makeGame, place, run, shoot } from './helpers.js';

const R = 0;
const B = 1;
const G = 2;
const Y = 3;

test('gap attraction pulls the forward segment backward; the rear segment never moves', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const [a, b, c, d] = place(g, t, [B, R, null, null, null, R, G]);
  const rearS = a.s;
  run(g, 0.05);
  assert.ok(c.av >= CONFIG.attractBase, 'attraction engaged');
  run(g, 1);
  assert.equal(a.s, rearS);
  assert.equal(c.s - b.s, 1, 'snapped together');
  assert.equal(d.s - c.s, 1);
  assert.equal(t.orbs.length, 4, 'two reds meeting do not pop');
});

test('attraction does not engage when facing edges differ', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const orbs = place(g, t, [B, R, null, null, G, B]);
  const s0 = orbs[2].s;
  run(g, 1);
  assert.equal(orbs[2].s, s0);
});

test('snap-merge of same-colour groups totalling 3+ cascades (+1 combo)', () => {
  const g = makeGame();
  const t = g.tracks[0];
  place(g, t, [B, R, R, null, null, R, G]);
  g.combo = 1;
  run(g, 1);
  assert.deepEqual(colors(t), [B, G]);
  assert.equal(g.combo, 2);
});

test('pop in the middle leaves a gap that closes and cascades (the core collapse)', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const orbs = place(g, t, [Y, B, G, R, R, G, B]);
  shoot(g, orbs[3], { color: R });
  run(g, 1.5);
  // R pops → G meets G (2, no pop) → stays
  assert.deepEqual(colors(t), [Y, B, G, G, B]);
});

test('recoil kick travels exactly recoilDistance regardless of speed', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const orbs = place(g, t, [B, G, Y, R, R, B, G, Y], 5);
  const rear0 = orbs[0].s;
  const front0 = orbs[7].s;
  g.combo = 2;
  shoot(g, orbs[4], { color: R });
  run(g, 0.2);
  assert.equal(g.combo, 3, 'third increment drops a power-up');
  run(g, 4);
  assert.ok(Math.abs(orbs[0].s - rear0 + CONFIG.recoilDistance) < 0.01, `rear kicked back 2 (moved ${orbs[0].s - rear0})`);
  assert.ok(Math.abs(orbs[7].s - (front0 + 1) - CONFIG.recoilDistance) < 0.01, `front kicked forward 2 (moved ${orbs[7].s - front0 - 1})`);
});

test('ordinary pops never recoil', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const orbs = place(g, t, [B, G, Y, R, R, B, G, Y], 5);
  const rear0 = orbs[0].s;
  shoot(g, orbs[4], { color: R });
  run(g, 3);
  assert.equal(orbs[0].s, rear0);
});

test('contact absorbs recoil: merging bodies zero residual recoil', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const orbs = place(g, t, [B, G, null, Y, R], 5);
  for (const o of orbs.slice(2)) o.rv = -CONFIG.recoilDistance * CONFIG.recoilDecay;
  run(g, 2);
  assert.equal(orbs[2].s - orbs[1].s, 1);
  assert.equal(orbs[2].rv, 0);
  assert.equal(orbs[0].rv, 0);
});

test('insertion shove moves only the contiguous stretch ahead, never across a gap', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const orbs = place(g, t, [B, G, Y, null, null, null, R, B]);
  const behind = orbs[0].s;
  const across = orbs[3].s;
  shoot(g, orbs[1], { color: R, after: false });
  assert.equal(orbs[0].s, behind, 'behind untouched');
  assert.equal(orbs[3].s, across, 'segment across the gap untouched');
  assert.equal(orbs[2].s - orbs[1].s, 1);
});

test('Backwards moves every segment uniformly and suspends attraction', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const orbs = place(g, t, [B, R, null, null, R, G], 10);
  g.startBackwards();
  const s0 = orbs.map((o) => o.s);
  run(g, 1);
  orbs.forEach((o, i) => assert.ok(Math.abs(o.s - (s0[i] + CONFIG.backwardsSpeed)) < 1e-6));
});

test('pusher drives only the segment it touches (contact-gated)', () => {
  const g = makeGame({ waves: [{ stock: 30 }] });
  const t = g.tracks[0];
  run(g, 3);
  // cut the line in the middle: remove 3 orbs
  const mid = Math.floor(t.orbs.length / 2);
  const front = t.orbs[t.orbs.length - 1];
  g.destroyOrbs(t, t.orbs.slice(mid, mid + 3), 'test');
  const f0 = front.s;
  // colours rarely link here; ensure no link by recolouring the edges apart
  const [a] = t.stretchAt(mid);
  t.orbs[mid].color = 3;
  t.orbs[mid - 1].color = 2;
  void a;
  run(g, 0.5);
  assert.equal(front.s, f0, 'detached front segment does not self-propel');
});

test('pusher gap attraction pulls the nearest segment back once the pusher cannot feed', () => {
  const g = makeGame({ waves: [{ stock: 21 }] });
  const t = g.tracks[0];
  run(g, 2);
  assert.equal(t.pushers[0].stock, 0);
  // destroy the stretch attached to the pusher
  const n = t.orbs.length;
  g.destroyOrbs(t, t.orbs.slice(0, 4), 'test');
  const rearOrb = t.orbs[0];
  const s0 = rearOrb.s;
  run(g, 0.3);
  assert.ok(rearOrb.s < s0, 'pulled backward toward the pusher');
  run(g, 3);
  const p = t.pushers[0];
  assert.ok(Math.abs(t.orbs[0].s - p.s - 1) < 1e-6, 'pusher back in contact');
  assert.equal(t.orbs.length, n - 4);
});

test('Wild at a segment edge defers its match until the attraction snaps, then pops as the shot', () => {
  const g = makeGame();
  const t = g.tracks[0];
  const orbs = place(g, t, [G, B, B, null, null, null, R, R, Y]);
  // Wild lands after the blues, at the edge facing the reds across the gap
  shoot(g, orbs[2], { kind: 'wild', after: true });
  g.combo = 4;
  run(g, 0.14);
  assert.equal(t.orbs.length, 7, 'deferred while the gap is still closing');
  run(g, 1);
  assert.deepEqual(colors(t), [G, Y], 'B B W R R popped as one event');
  assert.equal(g.combo, 4, 'credited to the (neutral) Wild shot, not a cascade');
});

test('a power-up pop behind a swallowed stretch kicks it backward out of the Abyss', () => {
  const g = makeGame({ length: 14 });
  const t = g.tracks[0];
  const start = t.path.visibleEnd - 4.5;
  const orbs = place(g, t, [B, G, R, R, Y, G, B, Y], start);
  const head = orbs[7];
  assert.ok(t.path.insideAbyss(head.s));
  const h0 = head.s;
  g.combo = 2;
  shoot(g, orbs[3], { color: R });
  run(g, 0.2);
  assert.equal(g.combo, 3);
  run(g, 2);
  assert.ok(head.s < h0 - 0.5, `front stretch kicked backward (moved ${head.s - h0})`);
});

test('a faster rear line overtaking a front pusher destroys it and merges the lines', () => {
  const g = makeGame({ length: 60, waves: [{ stock: 21 }, { stock: 10, delay: 0.5 }] });
  const t = g.tracks[0];
  run(g, 1);
  assert.equal(t.pushers.length, 2);
  run(g, 12);
  assert.equal(t.pushers.length, 1, 'overtaken pusher destroyed');
});

test('difficulty multiplies the level line speed; omitted means ×1', () => {
  const plain = makeGame({ base: 0.75 });
  assert.equal(plain.speedBase, 0.75);
  for (const [id, mult] of Object.entries(CONFIG.difficultySpeed)) {
    const g = makeGame({ base: 0.75 }, { difficulty: id });
    assert.equal(g.difficulty, id);
    assert.ok(Math.abs(g.speedBase - 0.75 * mult) < 1e-9, `${id} ×${mult}`);
  }
  assert.deepEqual(CONFIG.difficultySpeed, { normal: 1, hard: 2, nightmare: 3 });
});

test('a harder difficulty drives the line proportionally faster', () => {
  const speed = (difficulty) => {
    const g = makeGame({ length: 60, waves: [{ stock: 30 }] }, { difficulty });
    run(g, 0.2);
    return g.tracks[0].pushers[0].speed;
  };
  const normal = speed('normal');
  assert.ok(normal > 0);
  assert.ok(Math.abs(speed('hard') / normal - 2) < 1e-9);
  assert.ok(Math.abs(speed('nightmare') / normal - 3) < 1e-9);
});

test('a head carried back below rolloutUntil rolls in again at the rollout multiplier', () => {
  const sp = CONFIG.speedParams;
  const g = makeGame({ length: 60, base: 0.75, waves: [{ stock: 200 }] });
  const t = g.tracks[0];
  const p = t.pushers[0];
  const headProgress = () => t.path.progress(t.orbs[t.orbs.length - 1].s);
  run(g, 10);
  assert.ok(headProgress() > sp.rolloutUntil, 'rolled in past the threshold');
  assert.ok(Math.abs(p.mult - 1) < 1e-3, 'eased down to base speed');

  // Two Backwards in a row carry the head off-screen, onto the lead-in.
  g.startBackwards();
  run(g, CONFIG.backwardsDuration + 0.1);
  g.startBackwards();
  run(g, CONFIG.backwardsDuration + 0.1);
  assert.ok(headProgress() < 0, 'head is off-screen');
  assert.ok(Math.abs(p.mult - sp.rolloutMult) < 1e-2, 'rollout re-engaged');

  let back = 0;
  while (headProgress() < 0 && back < 60) {
    run(g, 0.1);
    back += 0.1;
  }
  assert.ok(back < 5, `head back on screen after ${back.toFixed(1)} s`);
});
