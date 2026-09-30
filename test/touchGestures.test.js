import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TouchGestures } from '../src/touchGestures.js';

const SLINGER = { x: 640, y: 600 };

function setup() {
  const log = [];
  const g = new TouchGestures({
    aim: (x, y) => log.push(['aim', x, y]),
    fire: () => log.push(['fire']),
    swap: () => log.push(['swap']),
    onSlinger: (x, y, r) => Math.hypot(x - SLINGER.x, y - SLINGER.y) < r,
  });
  const count = (type) => log.filter((e) => e[0] === type).length;
  return { g, log, count };
}

test('a single tap fires once', () => {
  const { g, count } = setup();
  g.down(1, 300, 200);
  g.up(1, 300, 200);
  assert.equal(count('fire'), 1);
  assert.equal(count('swap'), 0);
});

test('hold, move and release aims along the way and fires at the release point', () => {
  const { g, log, count } = setup();
  g.down(1, 300, 200);
  assert.equal(g.holding, true);
  g.move(1, 350, 220);
  g.up(1, 400, 250);
  assert.equal(g.holding, false);
  assert.deepEqual(log.slice(-2), [['aim', 400, 250], ['fire']]);
  assert.ok(log.some((e) => e[0] === 'aim' && e[1] === 350));
  assert.equal(count('fire'), 1);
});

test('a tap on the Slinger swaps without firing', () => {
  const { g, count } = setup();
  g.down(1, SLINGER.x + 10, SLINGER.y);
  assert.equal(g.holding, false);
  g.up(1, SLINGER.x + 10, SLINGER.y);
  assert.equal(count('swap'), 1);
  assert.equal(count('fire'), 0);
});

test('lifting off the Slinger cancels its swap', () => {
  const { g, count } = setup();
  g.down(1, SLINGER.x, SLINGER.y);
  g.up(1, SLINGER.x + 200, SLINGER.y);
  assert.equal(count('swap'), 0);
  assert.equal(count('fire'), 0);
});

for (const order of [[1, 2], [2, 1]]) {
  test(`a two-finger tap swaps once and never fires (lift order ${order})`, () => {
    const { g, count } = setup();
    g.down(1, 300, 200);
    g.down(2, 700, 200);
    assert.equal(g.holding, false);
    for (const id of order) g.up(id, 300, 200);
    assert.equal(count('swap'), 1);
    assert.equal(count('fire'), 0);
  });
}

test('a second finger during an aim swaps and cancels that shot', () => {
  const { g, count } = setup();
  g.down(1, 300, 200);
  g.move(1, 320, 210);
  g.down(2, 900, 400);
  g.move(1, 340, 220);
  g.up(2, 900, 400);
  g.up(1, 340, 220);
  assert.equal(count('swap'), 1);
  assert.equal(count('fire'), 0);
});

test('three fingers still swap only once', () => {
  const { g, count } = setup();
  g.down(1, 100, 100);
  g.down(2, 200, 100);
  g.down(3, 300, 100);
  g.up(1, 100, 100);
  g.up(2, 200, 100);
  g.up(3, 300, 100);
  assert.equal(count('swap'), 1);
  assert.equal(count('fire'), 0);
});

test('a single tap after a two-finger gesture fires normally', () => {
  const { g, count } = setup();
  g.down(1, 300, 200);
  g.down(2, 700, 200);
  g.up(1, 300, 200);
  g.up(2, 700, 200);
  g.down(3, 500, 300);
  g.up(3, 500, 300);
  assert.equal(count('swap'), 1);
  assert.equal(count('fire'), 1);
});

test('a two-finger gesture that starts on the Slinger swaps once', () => {
  const { g, count } = setup();
  g.down(1, SLINGER.x, SLINGER.y);
  g.down(2, 300, 200);
  g.up(1, SLINGER.x, SLINGER.y);
  g.up(2, 300, 200);
  assert.equal(count('swap'), 1);
  assert.equal(count('fire'), 0);
});

test('cancel drops the touch without firing and ends the gesture', () => {
  const { g, count } = setup();
  g.down(1, 300, 200);
  g.cancel(1);
  g.up(1, 300, 200);
  assert.equal(count('fire'), 0);
  assert.equal(g.holding, false);
  g.down(2, 300, 200);
  g.up(2, 300, 200);
  assert.equal(count('fire'), 1);
});

test('reset forgets every touch', () => {
  const { g, count } = setup();
  g.down(1, 300, 200);
  g.down(2, 400, 200);
  g.reset();
  g.up(1, 300, 200);
  g.up(2, 400, 200);
  g.down(3, 300, 200);
  g.up(3, 300, 200);
  assert.equal(count('swap'), 1);
  assert.equal(count('fire'), 1);
});
