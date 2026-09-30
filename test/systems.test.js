import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { DAYS, buildLevel } from '../src/levels.js';
import { Path, computeCoverage, validateBeziers } from '../src/path.js';
import { makeGame, place, run } from './helpers.js';

const R = 0;
const B = 1;
const G = 2;

test('every authored path is a tangent-continuous cubic Bézier chain starting off-screen', () => {
  for (const day of DAYS) {
    const level = buildLevel(day);
    for (const p of level.paths) {
      validateBeziers(p.beziers);
      const s = p.beziers[0][0];
      const off = s.x < 0 || s.y < 0 || s.x > CONFIG.canvasW || s.y > CONFIG.canvasH;
      assert.ok(off, `${day.id}: path starts off-screen`);
    }
  }
});

test('lead-in extrapolates the entry tangent; the far end clamps at the hole centre', () => {
  const g = makeGame();
  const p = g.paths[0];
  const back = p.pointAt(-20);
  assert.equal(Math.round(back.x), -20 * CONFIG.orbDiameterPx);
  const far = p.pointAt(p.length + 5);
  assert.deepEqual(far, p.end);
  assert.ok(Math.abs(p.visibleEnd - (p.length - CONFIG.ABYSS_RADIUS)) < 1e-9);
});

test('crossings: the lower path gets covered intervals where the higher path passes', () => {
  const level = buildLevel(DAYS.find((d) => d.layout === 'crossroads'));
  const paths = level.paths.map((p, i) => new Path(p.beziers, i));
  computeCoverage(paths);
  assert.equal(paths[0].covered.length, 2);
  assert.equal(paths[1].covered.length, 0);
});

test('covered orbs cannot be hit by shots but still take effects', () => {
  const g = makeGame({ paths: 1 });
  const t = g.tracks[0];
  const [o] = place(g, t, [R], 5);
  t.path.covered = [[4, 6]];
  assert.equal(g.findShotTarget(o.x, o.y, 0.5), null);
  g.destroyInRadius(o.x, o.y, 1, 'test');
  assert.equal(t.orbs.length, 0);
});

test('Abyss: grace timer, then drain; a timed effect defers the drain', () => {
  const g = makeGame({ length: 12 });
  const t = g.tracks[0];
  place(g, t, [R, B], t.path.visibleEnd + 0.1);
  g.startSlow();
  run(g, CONFIG.abyssGrace + 0.5);
  assert.equal(g.state, 'playing', 'deferred while Slow runs');
  run(g, CONFIG.slowDuration);
  assert.notEqual(g.state, 'playing', 'drain fires once the effect ends');
});

test('Abyss grace resets when all orbs leave', () => {
  const g = makeGame({ length: 12 });
  const t = g.tracks[0];
  const orbs = place(g, t, [R], t.path.visibleEnd + 0.1);
  run(g, 1);
  assert.ok(t.graceT > 0.9);
  orbs[0].s = 3;
  run(g, 0.1);
  assert.equal(t.graceT, 0);
});

test('orbs inside the Abyss cannot be hit', () => {
  const g = makeGame({ length: 12 });
  const t = g.tracks[0];
  const [o] = place(g, t, [R], t.path.visibleEnd + 0.3);
  assert.equal(g.findShotTarget(o.x, o.y, 0.5), null);
});

test('slinger: non-instant reload, empty-queue no-op, buffer capped by queue length', () => {
  const g = makeGame();
  place(g, g.tracks[0], [R, B, G], 3);
  const s = g.slinger;
  assert.equal(s.queue.length, 3);
  s.fire();
  assert.equal(s.queue.length, 2);
  for (let i = 0; i < 10; i++) s.fire();
  assert.equal(s.buffer, 2, 'banked up to the queue length');
  run(g, CONFIG.fireCooldown * 2 + 0.01);
  assert.ok(s.queue.length <= 1);
  g.projectiles = [];
  run(g, 1);
  assert.equal(s.queue.length, 3);
  s.queue = [];
  s.cooldown = 0;
  s.fire();
  assert.equal(s.cooldown, 0, 'empty queue fires nothing and starts no cooldown');
});

test('power-up pickup loads at the front and displaces into the reserve in order', () => {
  const g = makeGame();
  const s = g.slinger;
  const [a, b, c] = s.queue;
  const r0 = { kind: 'normal', color: 1 };
  s.reserve = [r0];
  s.loadFront([{ kind: 'purple', color: null }]);
  assert.equal(s.queue[0].kind, 'purple');
  assert.deepEqual(s.queue.slice(1), [a, b]);
  assert.deepEqual(s.reserve, [c, r0]);
});

test('Eternity Swap cycles the loaded orb to the back', () => {
  const g = makeGame({}, { enchantments: ['eternitySwap'] });
  const s = g.slinger;
  const [a, b, c] = s.queue;
  s.swap();
  assert.deepEqual(s.queue, [b, c, a]);
});

test('cadence: each Ammo enchantment replaces every Nth generated orb', () => {
  for (const [id, every, kind] of [
    ['suddenFire', CONFIG.suddenFireEvery, 'firebolt'],
    ['callOfTheWild', CONFIG.callOfTheWildEvery, 'wild'],
    ['flamePurple', CONFIG.flamePurpleEvery, 'purple'],
  ]) {
    const s = makeGame({}, { enchantments: [id] }).slinger;
    s.genCount = 0;
    const kinds = [];
    for (let i = 0; i < 2 * every; i++) kinds.push(s.generate().kind);
    const special = kinds.flatMap((k, i) => (k === kind ? [i + 1] : []));
    assert.deepEqual(special, [every, 2 * every], id);
  }
});

test('Colour Wipe removes one colour everywhere incl. the Abyss; no-op when absent', () => {
  const g = makeGame({ length: 12 });
  const t = g.tracks[0];
  place(g, t, [R, B, R], 2);
  place(g, t, [R], t.path.visibleEnd + 0.4);
  g.colourWipe(R);
  assert.deepEqual(t.orbs.map((o) => o.color), [B]);
  g.colourWipe(G);
  assert.equal(t.orbs.length, 1);
});

test('Frost Ray destroys everything within the widening beam', () => {
  const g = makeGame();
  const t = g.tracks[0];
  place(g, t, [R, B, G, R, B, G, R, B, G, R], 2);
  // beam straight up from below the line, centred on x = 5.5 orbs
  g.frostRay(5.5 * CONFIG.orbDiameterPx, 700, 0, -1);
  // local width ≈ 3 + 0.05*10 ≈ 3.5 orbs → half ≈ 1.75: orbs centred at 4..7 destroyed
  const left = t.orbs.map((o) => o.s);
  assert.ok(left.every((s) => Math.abs(s - 5.5) > 1.6));
  assert.ok(left.length >= 6 && left.length <= 8);
});

test('Butterflies destroy the first orb met outside the Abyss and despawn at the spawn point', () => {
  const g = makeGame({ length: 20 });
  const t = g.tracks[0];
  place(g, t, [R], t.path.visibleEnd + 0.5); // swallowed: overflown
  place(g, t, [B, G], 4);
  const before = t.orbs.length;
  const grace = CONFIG.abyssGrace;
  CONFIG.abyssGrace = 100; // keep the swallowed orb from triggering the drain here
  g.startButterflies();
  run(g, 6);
  CONFIG.abyssGrace = grace;
  assert.equal(g.registry.active(), false);
  assert.ok(t.orbs.some((o) => o.color === R), 'swallowed orb is never touched');
  assert.equal(t.orbs.length, before - 2);
});

test('Rune Reward lights exactly one pip; filling the circle seals the level', () => {
  const g = makeGame({ runeTarget: 24 });
  place(g, g.tracks[0], [R, B], 3);
  g.addRune(Math.ceil(24 / 12));
  assert.equal(g.pipsLit(), 1);
  g.addRune(100);
  assert.equal(g.sealed, true);
  assert.equal(g.runeProgress, 24);
});

test('win requires sealed circle, empty field and no projectile in flight', () => {
  const g = makeGame({ runeTarget: 2 });
  const t = g.tracks[0];
  place(g, t, [B, R, R, B], 3);
  g.addRune(2);
  assert.ok(g.sealed);
  run(g, 0.1);
  assert.equal(g.state, 'playing');
  g.destroyOrbs(t, t.orbs.slice(), 'test');
  g.projectiles.push({ kind: 'firebolt', x: 600, y: 650, dx: 0, dy: 1, speed: 0.01, r: 0.25, insert: false });
  run(g, 0.05);
  assert.equal(g.state, 'playing');
  g.projectiles = [];
  run(g, 0.05);
  assert.equal(g.state, 'won');
});

test('soft-lock failsafe seals when stock is exhausted with the field clear', () => {
  const g = makeGame({ runeTarget: 500 });
  run(g, 0.05);
  assert.equal(g.state, 'won');
});

test('Head Start pre-lights pips; Rune Fire fires a spinner every 6 pips', () => {
  const pre = makeGame({ runeTarget: 120 }, { enchantments: ['headStart'] });
  assert.equal(pre.pipsLit(), CONFIG.headStartPips);
  const g = makeGame({ runeTarget: 120 }, { enchantments: ['runeFire'] });
  place(g, g.tracks[0], [R], 3);
  g.addRune(10 * 5); // 5 pips → no spinner yet
  assert.equal(g.pellets.length, 0);
  g.addRune(10);
  assert.equal(g.pellets.length, CONFIG.spinnerPellets);
});

test('layouts: maws never overlap, the Slinger has clearance, path sections never crowd', () => {
  const D = CONFIG.orbDiameterPx;
  const maw = (CONFIG.ABYSS_RADIUS + 0.2) * D; // hole + carved rim (abyssRimRadius)
  const groove = 0.64 * D;
  for (const day of DAYS) {
    const level = buildLevel(day);
    const paths = level.paths.map((p, i) => new Path(p.beziers, i));
    const sl = level.slinger;
    for (const p of paths) {
      assert.ok(Math.hypot(p.end.x - sl.x, p.end.y - sl.y) > maw + 80, `${day.id}: slinger clear of maw`);
      for (let s = 0; s <= p.visibleEnd; s += 0.25) {
        const a = p.pointAt(s);
        assert.ok(Math.hypot(a.x - sl.x, a.y - sl.y) > 1.3 * D + D / 2 + 8, `${day.id}: slinger clear of path at s=${s}`);
      }
    }
    for (let i = 0; i < paths.length; i++) {
      for (let j = i + 1; j < paths.length; j++) {
        const d = Math.hypot(paths[i].end.x - paths[j].end.x, paths[i].end.y - paths[j].end.y);
        assert.ok(d > 2 * maw, `${day.id}: maws ${i}/${j} overlap`);
      }
    }
    // no other path section runs under a maw
    for (const p of paths) {
      for (const q of paths) {
        for (let s = 0; s <= q.length; s += 0.25) {
          if (q === p && s > q.length - 3) continue;
          const a = q.pointAt(s);
          const d = Math.hypot(a.x - p.end.x, a.y - p.end.y);
          assert.ok(d > maw + groove, `${day.id}: path ${q.index} at s=${s} crowds maw ${p.index} (${d.toFixed(0)}px)`);
        }
      }
    }
    // same-path self-clearance (non-neighbouring stretches at least 1.4 orbs apart)
    for (const p of paths) {
      const pts = [];
      for (let s = 0; s <= p.length; s += 0.25) pts.push([s, p.pointAt(s)]);
      for (let a = 0; a < pts.length; a++) {
        for (let b = a + 1; b < pts.length; b++) {
          if (pts[b][0] - pts[a][0] < 3) continue;
          const d = Math.hypot(pts[a][1].x - pts[b][1].x, pts[a][1].y - pts[b][1].y);
          assert.ok(d > 1.4 * D, `${day.id}: path folds onto itself near s=${pts[a][0]}/${pts[b][0]} (${d.toFixed(0)}px)`);
        }
      }
    }
  }
});
