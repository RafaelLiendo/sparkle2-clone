// How to Play as a scripted level. The line, the ammo and the power-up are fixed, so the
// run is deterministic: the planner plays it once headlessly, stopping at each beat, and
// finds the aim that lands every shot on its spot by trying angles on forks of the game.
// The live tutorial replays the same actions at the same steps and gets the same result.

import { CONFIG } from '../config.js';
import { roundedPolyline } from '../pathBuilders.js';
import { Game } from './game.js';

const R = 0;
const B = 1;
const G = 2;
const Y = 3;

const HZ = CONFIG.simHz;
const sec = (s) => Math.round(s * HZ);

/** Tail → head. */
export const TUTORIAL_ORBS = [B, R, B, R, B, R, R, Y, G, Y, R, B];

export function tutorialLevel() {
  return {
    id: 'tutorial',
    name: 'How to Play',
    colors: [R, B, G, Y],
    // a quick rollout brings the whole line on screen, then it barely creeps
    speed: { base: 0.3, rolloutMult: 26, rolloutUntil: 0.36 },
    runeTarget: 15, // every orb the script destroys: the last blast completes the Circle
    slinger: { x: 460, y: 505 },
    paths: [{ beziers: roundedPolyline([[-40, 150], [1120, 150], [1120, 560], [820, 560]], 110), orbs: TUTORIAL_ORBS }],
    theme: 'd1',
  };
}

export const TUTORIAL_OPTS = { seed: 0x70707, ammo: [G, G, R, Y, B, R, B], powerups: ['purpleFire'], enchantments: [] };

export function newTutorialGame() {
  return new Game(tutorialLevel(), TUTORIAL_OPTS);
}

/** Apply a beat's player action to `game` (the step it happens at is the beat's pauseAt). */
export function applyBeat(game, beat) {
  if (beat.action === 'fire') {
    game.slinger.angle = beat.angle;
    game.fire();
  } else if (beat.action === 'swap') {
    game.swap();
  }
}

const AIM_SPAN = 0.14; // rad either side of the direct aim
const AIM_STEP = 0.004;

/**
 * Try every angle around the direct aim at `target` on a fork of `game`; `pass(f, events)`
 * judges a candidate after each step (true / false / undefined = keep simulating). Returns
 * the centre of the widest run of passing angles, or null.
 */
function searchAim(game, target, pass, maxSteps) {
  const s = game.slinger;
  const direct = Math.atan2(target.y - s.y, target.x - s.x);
  const n = Math.round(AIM_SPAN / AIM_STEP);
  let best = null;
  let runStart = null;
  const close = (end) => {
    if (runStart === null) return;
    const width = end - runStart;
    if (!best || width > best.width) best = { width, angle: direct + ((runStart + end - 1) / 2) * AIM_STEP };
    runStart = null;
  };
  for (let k = -n; k <= n; k++) {
    const ok = tryShot(game, direct + k * AIM_STEP, pass, maxSteps);
    if (ok && runStart === null) runStart = k;
    if (!ok) close(k);
  }
  close(n + 1);
  return best;
}

function tryShot(game, angle, pass, maxSteps) {
  const f = game.fork();
  f.drainEvents();
  f.slinger.angle = angle;
  f.fire();
  const events = [];
  for (let i = 0; i < maxSteps; i++) {
    f.update(1 / HZ);
    events.push(...f.drainEvents());
    const v = pass(f, events);
    if (v !== undefined) return v;
  }
  return false;
}

const greenCount = (g) => g.tracks[0].orbs.filter((o) => o.color === G).length;
const pops = (events, color) => events.filter((e) => e.type === 'pop' && e.points.every((p) => p.color === color));

/** Longest same-colour linked run containing an orb of `color`. */
function runLength(g, color) {
  const t = g.tracks[0];
  let best = 0;
  t.orbs.forEach((o, i) => {
    if (o.color !== color) return;
    const [a, b] = t.runAt(i);
    best = Math.max(best, b - a + 1);
  });
  return best;
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

let memo = null;

/**
 * The beats of the tutorial, each `{ id, pauseAt, aimFrom, action, angle, target }`
 * (steps at CONFIG.simHz), plus `slow`: [from, to) step ranges played in slow motion.
 */
export function planTutorial() {
  if (memo) return memo;
  const g = newTutorialGame();
  let step = 0;
  let log = [];
  const tick = () => {
    g.update(1 / HZ);
    step++;
    log.push(...g.drainEvents());
  };
  const runFor = (n) => {
    for (let i = 0; i < n; i++) tick();
  };
  const runUntil = (cond, cap = sec(10)) => {
    for (let i = 0; i < cap && !cond(); i++) tick();
    if (!cond()) throw new Error(`tutorial plan: condition not reached by step ${step}`);
  };
  const settled = () => g.projectiles.length === 0 && g.pending.length === 0 && g.tracks[0].attractEdges.size === 0;
  const beats = [];
  const beat = (id, action, aimFor, extra = {}) => {
    const b = { id, action, pauseAt: step, aimFrom: Math.max(extra.aimAfter ?? 0, step - sec(aimFor)), angle: null, target: null, ...extra };
    delete b.aimAfter;
    beats.push(b);
    return b;
  };
  const aim = (b, target, pass, maxSteps) => {
    const found = searchAim(g, target, pass, maxSteps);
    if (!found) throw new Error(`tutorial plan: no aim lands the ${b.id} shot`);
    b.angle = found.angle;
    b.target = { x: target.x, y: target.y, r: target.r ?? CONFIG.orbDiameterPx * 0.7 };
  };
  const act = (b) => {
    applyBeat(g, b);
    log = [];
  };
  const orbs = () => g.tracks[0].orbs;

  // 1. the line rolls in; aim at the green orb and fire beside it: two greens, no match
  runFor(sec(2.2));
  const b1 = beat('fire1', 'fire', 0.55);
  const green = orbs().find((o) => o.color === G);
  aim(b1, green, (f, ev) => (ev.some((e) => e.type === 'pop') ? false : f.pending.length === 0 && ev.some((e) => e.type === 'insert') ? greenCount(f) === 2 && runLength(f, G) === 2 : undefined), sec(1));
  act(b1);

  // 2. fire again beside them: three greens match
  runUntil(settled);
  runFor(sec(0.7));
  const b2 = beat('fire2', 'fire', 0.5);
  const greens = orbs().filter((o) => o.color === G);
  aim(b2, mid(greens[0], greens[1]), (f, ev) => (ev.some((e) => e.type === 'pop') ? pops(ev, G).some((e) => e.points.length === 3) : undefined), sec(1));
  act(b2);

  // 3. no greens left: red loaded, yellow next. Swap them.
  runUntil(() => pops(log, G).length > 0 && settled() && g.slinger.queue.length === g.slinger.capacity);
  runFor(sec(0.5));
  const q = g.slinger.queue;
  if (q[0].color !== R || q[1].color !== Y) throw new Error('tutorial plan: expected red then yellow in the Slinger');
  const b3 = beat('swap', 'swap', 0);
  b3.target = { x: g.slinger.x, y: g.slinger.y, r: CONFIG.orbDiameterPx * 1.35 };
  act(b3);

  // 4. yellow between the yellows: match, the reds roll together and match (combo 3), a power-up drops
  runFor(sec(0.6));
  const b4 = beat('fire3', 'fire', 0.5);
  const yellows = orbs().filter((o) => o.color === Y);
  aim(
    b4,
    mid(yellows[0], yellows[1]),
    (f, ev) => {
      if (ev.some((e) => e.type === 'drop')) {
        const yPop = pops(ev, Y).some((e) => e.points.length === 3);
        const rPop = pops(ev, R).some((e) => e.cascade && e.combo === 3);
        return yPop && rPop && ev.some((e) => e.type === 'drop' && e.ptype === 'purpleFire');
      }
      if (ev.some((e) => e.type === 'comboReset' || e.type === 'miss')) return false;
      return undefined;
    },
    sec(3),
  );
  act(b4);

  // 5. the recoil opens a gap: shoot the power-up through it
  runUntil(() => log.some((e) => e.type === 'drop'), sec(4));
  const dropStep = step;
  const hitsIcon = (f, ev) => {
    if (ev.some((e) => e.type === 'collect')) return true;
    if (ev.some((e) => e.type === 'insert' || e.type === 'miss')) return false;
    return undefined;
  };
  const base = g.fork();
  const baseLog = log.slice();
  let best = null;
  for (let wait = sec(0.1); wait <= sec(0.7); wait += sec(0.05)) {
    const f = base.fork();
    for (let i = 0; i < wait; i++) {
      f.update(1 / HZ);
      f.drainEvents();
    }
    const ic = f.icons[0];
    if (!ic) break;
    const found = searchAim(f, ic, hitsIcon, sec(1));
    if (found && (!best || found.width > best.width)) best = { wait, width: found.width };
  }
  if (!best) throw new Error('tutorial plan: the power-up cannot be reached');
  log = baseLog;
  runFor(best.wait);
  const b5 = beat('collect', 'fire', 0.4, { aimAfter: dropStep });
  const ic = g.icons[0];
  aim(b5, { x: ic.x, y: ic.y + Math.sin(ic.t * 2 + ic.phase) * 3, r: CONFIG.orbDiameterPx * 0.8 }, hitsIcon, sec(1));
  act(b5);
  // slow motion from the yellow shot, through the cascade and the recoil, until the shot
  // has threaded the gap
  const slow = [[b4.pauseAt, b5.pauseAt + sec(0.4)]];

  // 6. the gap closes; fire the Purple Flame into the middle of the line
  runUntil(() => log.some((e) => e.type === 'collect') && settled() && g.tracks[0].stretchAt(0)[1] === orbs().length - 1);
  runFor(sec(0.6));
  if (g.slinger.loaded?.kind !== 'purple') throw new Error('tutorial plan: expected the Purple Flame loaded');
  const b6 = beat('blast', 'fire', 0.5);
  const o = orbs();
  const k = Math.floor(o.length / 2);
  aim(b6, mid(o[k - 1], o[k]), (f) => (f.state === 'won' ? true : f.projectiles.length === 0 && f.orbCount() > 0 ? false : undefined), sec(2));
  act(b6);

  // 7. the Circle is sealed and the field is empty: the day would be won
  runUntil(() => g.state === 'won', sec(3));
  runFor(sec(1.4));
  const b7 = beat('end', 'continue', 0);
  b7.target = { x: g.slinger.x, y: g.slinger.y, r: CONFIG.orbDiameterPx * 1.5 };

  memo = { beats, slow };
  return memo;
}
