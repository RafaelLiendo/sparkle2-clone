// Test helpers: a straight synthetic path with hand-placed orbs.

import { CONFIG } from '../src/config.js';
import { Game } from '../src/game/game.js';

export const DT = 1 / 120;

/** Horizontal path of `length` orbs at y=200, starting at x=0. No waves by default. */
export function straightLevel({ length = 30, colors = [0, 1, 2, 3], waves = [], runeTarget = 1000, base = 1, paths = 1 } = {}) {
  const mk = (y) => {
    const x0 = 0;
    const x1 = length * CONFIG.orbDiameterPx;
    return [[{ x: x0, y }, { x: x0 + (x1 - x0) / 3, y }, { x: x0 + (2 * (x1 - x0)) / 3, y }, { x: x1, y }]];
  };
  return {
    id: 'test',
    name: 'test',
    colors,
    speed: { base },
    runeTarget,
    slinger: { x: 600, y: 600 },
    paths: Array.from({ length: paths }, (_, i) => ({ beziers: mk(200 + i * 200), waves })),
    theme: 'test',
  };
}

export function makeGame(opts = {}, gameOpts = {}) {
  return new Game(straightLevel(opts), { seed: 42, ...gameOpts });
}

/**
 * Place orbs on a track. `spec` is an array of colour ids (or 'W' for Wild) and `null`
 * entries for one-orb gaps; orbs are laid out tail→head starting at `startS`.
 */
export function place(game, track, spec, startS = 2) {
  let s = startS;
  const made = [];
  for (const c of spec) {
    if (c === null) {
      s += 1;
      continue;
    }
    const orb = game.createOrb(track, c === 'W' ? 0 : c, s, c === 'W');
    made.push(orb);
    s += 1;
  }
  track.orbs.push(...made);
  track.orbs.sort((a, b) => a.s - b.s);
  track.updatePositions();
  return made;
}

/** Simulate `seconds` of play. */
export function run(game, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) game.update(DT);
}

/** Land a fired orb next to `target` (after = toward the head), as a projectile impact would. */
export function shoot(game, target, { color = target.color, kind = 'normal', after = true } = {}) {
  const track = target.track;
  const ang = track.path.angleAt(target.s);
  const off = after ? 0.3 : -0.3;
  const p = {
    kind,
    color,
    x: target.x + Math.cos(ang) * off * 60,
    y: target.y + Math.sin(ang) * off * 60 - 20,
    speed: 27,
    insert: kind === 'normal' || kind === 'wild',
  };
  game.impact(p, { track, orb: target });
}

export function colors(track) {
  return track.orbs.map((o) => (o.wild ? 'W' : o.color));
}
