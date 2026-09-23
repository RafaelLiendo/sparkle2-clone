// Game simulation — DOM-free, deterministic for a given seed and input sequence.
// Renderer and audio consume `game.events` and read state; they never mutate it.

import { CONFIG, RUNE_PIPS } from '../config.js';
import { AMMO, BLUE, POWERUP_IDS, RED } from '../defs.js';
import { computeCoverage, Path } from '../path.js';
import { Rng } from '../rng.js';
import { ButterfliesEffect, DurationEffect, EffectRegistry, FirefliesEffect, StarsEffect } from './effects.js';
import { Slinger } from './slinger.js';
import { sameColor, Track } from './track.js';

export class Game {
  /**
   * @param {object} level level definition (see levels.js)
   * @param {{seed?:number, enchantments?:string[], powerups?:string[]}} opts
   */
  constructor(level, opts = {}) {
    this.level = level;
    this.rng = new Rng(opts.seed ?? 0x5eed);
    this.enchant = {};
    for (const id of opts.enchantments || []) this.enchant[id] = true;
    this.powerupPool = (opts.powerups || POWERUP_IDS).slice();
    this.nextId = 1;
    this.time = 0;
    this.state = 'playing'; // playing | draining | won | lost
    this.events = [];
    this.orbById = new Map();
    this.sealed = false;
    this.combo = 0;
    this.pending = []; // settle checks (§1.1)
    this.projectiles = [];
    this.pellets = [];
    this.icons = [];
    this.registry = new EffectRegistry();
    this.lastPowerup = null;
    this.drainT = 0;
    this.W = CONFIG.canvasW;
    this.H = CONFIG.canvasH;
    this.D = CONFIG.orbDiameterPx;

    const e = this.enchant;
    let colors = level.colors.slice();
    if (e.redNoMore && colors.length > 2) colors = colors.filter((c) => c !== RED);
    this.lineColors = colors;
    this.speedBase = level.speed?.base ?? CONFIG.speedParams.base;
    this.enchantMult =
      (e.tar ? CONFIG.tarMult : 1) * (e.tranquility ? CONFIG.tranquilityMult : 1) * (e.redNoMore ? CONFIG.redNoMoreMult : 1);

    // Rune Circle (§1.5)
    this.runeTarget = Math.max(1, Math.round(level.runeTarget * (e.tranquility ? CONFIG.tranquilityTargetMult : 1)));
    this.runeProgress = 0;
    if (e.headStart) this.runeProgress = Math.ceil((this.runeTarget * CONFIG.headStartPips) / RUNE_PIPS);
    this.prelitPips = this.pipsLit();
    this.runeFireNext = CONFIG.runeFireEvery;

    this.paths = level.paths.map((p, i) => new Path(p.beziers, i));
    computeCoverage(this.paths);
    this.tracks = this.paths.map((p, i) => new Track(this, p, level.paths[i]));
    for (const t of this.tracks) t.updatePositions();
    this.slinger = new Slinger(this, level.slinger);
  }

  // ---------------------------------------------------------------------------
  // Bookkeeping

  emit(ev) {
    this.events.push(ev);
  }

  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  createOrb(track, color, s, wild = false) {
    const orb = { id: this.nextId++, color, wild, s, rv: 0, av: 0, x: 0, y: 0, visOff: 0, visVel: 0, fly: null, track, flash: 0 };
    this.orbById.set(orb.id, orb);
    return orb;
  }

  forgetOrb(orb) {
    this.orbById.delete(orb.id);
  }

  isAlive(orb) {
    return !!orb && this.orbById.get(orb.id) === orb;
  }

  /** Line colour generation: short runs, never three in a row. */
  lineColor(prev, run) {
    const cols = this.lineColors;
    if (prev !== null && run < 2 && cols.includes(prev) && this.rng.next() < 0.33) return prev;
    const options = prev === null ? cols : cols.filter((c) => c !== prev);
    return options.length ? options[this.rng.int(options.length)] : cols[this.rng.int(cols.length)];
  }

  presentColors() {
    const set = new Set();
    for (const t of this.tracks) for (const o of t.orbs) if (!o.wild) set.add(o.color);
    return set;
  }

  randomPresentColor() {
    const present = [...this.presentColors()];
    const from = present.length ? present : this.lineColors;
    return from[this.rng.int(from.length)];
  }

  pipsLit() {
    return Math.min(RUNE_PIPS, Math.floor((RUNE_PIPS * this.runeProgress) / this.runeTarget + 1e-9));
  }

  orbCount() {
    let n = 0;
    for (const t of this.tracks) n += t.orbs.length;
    return n;
  }

  // ---------------------------------------------------------------------------
  // Input

  aimAt(x, y) {
    this.slinger.angle = Math.atan2(y - this.slinger.y, x - this.slinger.x);
  }

  fire() {
    this.slinger.fire();
  }

  swap() {
    this.slinger.swap();
  }

  /** Pause/win/fail/drain all clear the input buffer — no posthumous shots. */
  pause() {
    this.slinger.buffer = 0;
  }

  // ---------------------------------------------------------------------------
  // Main step

  update(dt) {
    if (this.state === 'won' || this.state === 'lost') {
      this.updateVisuals(dt);
      return;
    }
    this.time += dt;

    if (this.state === 'draining') {
      this.drainT += dt;
      const v = CONFIG.drainBase + CONFIG.drainAccel * this.drainT;
      for (const t of this.tracks) t.update(dt, { draining: true, drainSpeed: v });
      this.updateVisuals(dt);
      if (this.tracks.every((t) => t.orbs.length === 0)) {
        this.state = 'lost';
        this.emit({ type: 'lost' });
      }
      return;
    }

    this.slinger.update(dt);
    this.registry.update(dt, this);

    const env = {
      backwards: this.registry.backwards(),
      slowMult: this.registry.slowMult(),
      enchantMult: this.enchantMult,
      base: this.speedBase,
    };
    for (const t of this.tracks) {
      const { merges } = t.update(dt, env);
      for (const m of merges) {
        if (m.pusher) {
          this.emit({ type: 'pusherContact', x: m.right.x, y: m.right.y, speed: m.speed });
        } else {
          this.emit({ type: 'snap', x: m.left.x, y: m.left.y, speed: m.speed });
          this.junctionCheck(t, m.left, m.right);
        }
      }
    }

    this.updateProjectiles(dt);
    this.updatePellets(dt);
    this.resolveSettles();
    this.updateIcons(dt);
    this.allWildCheck();
    this.slinger.reroll(this.presentColors());
    this.checkAbyss(dt);
    this.checkEnd();
    this.updateVisuals(dt);
  }

  // ---------------------------------------------------------------------------
  // Firing

  launch(ammo, angle) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const D = this.D;
    const mx = this.slinger.x + dx * CONFIG.muzzleOffset * D;
    const my = this.slinger.y + dy * CONFIG.muzzleOffset * D;
    this.emit({ type: 'fire', kind: ammo.kind, x: mx, y: my, angle });
    if (ammo.kind === 'frost') {
      this.frostRay(mx, my, dx, dy);
      return;
    }
    if (ammo.kind === 'spark') {
      const n = CONFIG.sparkPellets;
      for (let k = 0; k < n; k++) {
        const a = angle + (n === 1 ? 0 : (k / (n - 1) - 0.5) * CONFIG.sparkSpread);
        this.pellets.push({ x: mx, y: my, dx: Math.cos(a), dy: Math.sin(a), speed: CONFIG.pelletSpeed, r: CONFIG.effectProjSize / 2, kind: 'spark' });
      }
      return;
    }
    const spec = AMMO[ammo.kind];
    this.projectiles.push({
      kind: ammo.kind,
      // A Wild resolves to a concrete colour at fire time (used by Colour Wipe).
      color: ammo.kind === 'wild' ? this.randomPresentColor() : ammo.color,
      x: mx,
      y: my,
      dx,
      dy,
      speed: CONFIG.projSpeed * (this.enchant.speedUnleashed ? CONFIG.speedUnleashedMult : 1),
      r: spec.small ? CONFIG.effectProjSize / 2 : 0.5,
      insert: spec.insert,
    });
  }

  /** First targetable orb overlapping a circle of radius r (orbs) at (x, y). */
  findShotTarget(x, y, r) {
    let best = null;
    let bestD = (0.5 + r) * this.D;
    for (const track of this.tracks) {
      const path = track.path;
      for (const orb of track.orbs) {
        if (orb.s > path.visibleEnd) continue; // no collision inside the Abyss
        const dx = orb.x - x;
        const dy = orb.y - y;
        if (Math.abs(dx) > bestD || Math.abs(dy) > bestD) continue;
        const d = Math.hypot(dx, dy);
        if (d < bestD && !path.isCovered(orb.s)) {
          best = { track, orb };
          bestD = d;
        }
      }
    }
    return best;
  }

  outOfField(x, y, margin) {
    return x < -margin || y < -margin || x > this.W + margin || y > this.H + margin;
  }

  updateProjectiles(dt) {
    const D = this.D;
    const keep = [];
    for (const p of this.projectiles) {
      let dist = p.speed * dt;
      let consumed = false;
      while (dist > 0 && !consumed) {
        const step = Math.min(0.2, dist);
        dist -= step;
        p.x += p.dx * step * D;
        p.y += p.dy * step * D;
        const icon = this.icons.find((ic) => Math.hypot(ic.x - p.x, ic.y - p.y) < (CONFIG.runeIconRadius + p.r) * D);
        if (icon) {
          this.collect(icon, p);
          consumed = true;
          break;
        }
        const hit = this.findShotTarget(p.x, p.y, p.r);
        if (hit) {
          this.impact(p, hit);
          consumed = true;
          break;
        }
        if (this.outOfField(p.x, p.y, D)) {
          if (p.kind === 'normal') this.comboReset('miss');
          this.emit({ type: 'miss', kind: p.kind });
          consumed = true;
        }
      }
      if (!consumed) keep.push(p);
    }
    this.projectiles = keep;
  }

  impact(p, { track, orb }) {
    const idx = track.indexOf(orb);
    switch (p.kind) {
      case 'normal':
      case 'wild': {
        const ang = track.path.angleAt(orb.s);
        const after = (p.x - orb.x) * Math.cos(ang) + (p.y - orb.y) * Math.sin(ang) > 0;
        const fresh = this.createOrb(track, p.color, 0, p.kind === 'wild');
        fresh.fly = { x: p.x, y: p.y, t: 0 };
        const { index, junctions } = track.insert(idx, after, fresh);
        const [a, b] = track.runAt(index);
        // Hypothetical per-shove match test, recorded at the instant it lands (§1.3).
        this.pending.push({ orb: fresh, due: this.time + CONFIG.insertSettleDelay, kind: p.kind, hypo: b - a + 1 >= 3 });
        this.emit({ type: 'insert', x: fresh.x, y: fresh.y, speed: p.speed });
        for (const [l, r] of junctions) this.junctionCheck(track, l, r);
        break;
      }
      case 'firebolt':
        this.emit({ type: 'firebolt', x: orb.x, y: orb.y });
        this.destroyOrbs(track, [orb], 'firebolt');
        break;
      case 'purple':
        this.emit({ type: 'blast', x: p.x, y: p.y, radius: CONFIG.bombRadius, kind: 'purple' });
        this.destroyInRadius(p.x, p.y, CONFIG.bombRadius, 'purple');
        break;
      case 'splash':
        this.colourSplash(p.x, p.y, p.color);
        break;
      case 'decay': {
        const [sa, sb] = track.stretchAt(idx);
        const a = Math.max(sa, idx - CONFIG.decaySpread);
        const b = Math.min(sb, idx + CONFIG.decaySpread);
        this.emit({ type: 'decay', x: orb.x, y: orb.y });
        this.destroyOrbs(track, track.orbs.slice(a, b + 1), 'decay');
        break;
      }
      default:
        break;
    }
  }

  updatePellets(dt) {
    const D = this.D;
    const keep = [];
    for (const p of this.pellets) {
      let dist = p.speed * dt;
      let consumed = false;
      while (dist > 0 && !consumed) {
        const step = Math.min(0.2, dist);
        dist -= step;
        p.x += p.dx * step * D;
        p.y += p.dy * step * D;
        // Pellets are effects: they ignore icons and cover, but not the Abyss.
        let best = null;
        let bestD = (0.5 + p.r) * D;
        for (const track of this.tracks) {
          for (const orb of track.orbs) {
            if (orb.s > track.path.visibleEnd) continue;
            const d = Math.hypot(orb.x - p.x, orb.y - p.y);
            if (d < bestD) {
              best = { track, orb };
              bestD = d;
            }
          }
        }
        if (best) {
          this.destroyOrbs(best.track, [best.orb], p.kind);
          consumed = true;
        } else if (this.outOfField(p.x, p.y, D)) {
          consumed = true;
        }
      }
      if (!consumed) keep.push(p);
    }
    this.pellets = keep;
  }

  // ---------------------------------------------------------------------------
  // Matching, combo, pops (§1.1–1.4)

  comboReset(reason) {
    if (this.combo !== 0) this.emit({ type: 'comboReset', reason });
    this.combo = 0;
  }

  /** Junction check at a merge (cascade), unless a pending shot in the run absorbs it. */
  junctionCheck(track, left, right) {
    if (!this.isAlive(left) || !this.isAlive(right) || !sameColor(left, right)) return;
    const i = track.indexOf(left);
    if (i < 0 || track.orbs[i + 1] !== right || !track.linked(i)) return;
    const [a, b] = track.runAt(i);
    if (b - a + 1 < 3) return;
    for (let k = a; k <= b; k++) {
      const orb = track.orbs[k];
      if (this.pending.some((q) => q.orb === orb)) return; // resolves as the shot's match
    }
    this.pop(track, a, b, { inc: true, cascade: true });
  }

  /** Settle checks: rapid-shove hold, per-run coalescing, Wild deferral (§1.1, §3). */
  resolveSettles() {
    if (!this.pending.length) return;
    this.pending = this.pending.filter((q) => this.isAlive(q.orb)); // destroyed while held: silent
    if (!this.pending.length) return;
    const hold = this.projectiles.some((p) => p.insert) || this.slinger.buffer > 0;
    if (hold) return;
    const backwards = this.registry.backwards() !== null;
    const seen = new Set();
    for (const q of this.pending.slice()) {
      if (seen.has(q) || !this.isAlive(q.orb)) continue;
      const track = q.orb.track;
      const idx = track.indexOf(q.orb);
      const [a, b] = track.runAt(idx);
      const inRun = new Set(track.orbs.slice(a, b + 1));
      const group = this.pending.filter((g) => inRun.has(g.orb));
      for (const g of group) seen.add(g);
      if (group.some((g) => g.due > this.time + 1e-9)) continue;
      if (!backwards && track.runTouchesAttraction(a, b)) continue; // wait for the snap
      this.pending = this.pending.filter((g) => !group.includes(g));
      const normals = group.filter((g) => g.kind === 'normal');
      if (b - a + 1 >= 3) {
        let inc = false;
        if (normals.length) {
          if (normals.some((g) => !g.hypo)) this.comboReset('shove');
          inc = true;
        }
        this.pop(track, a, b, { inc, cascade: false });
      } else if (normals.length) {
        this.comboReset('nomatch');
      }
    }
  }

  /** A real pop (match event). Removes orbs [a, b] from `track`. */
  pop(track, a, b, { inc, cascade }) {
    const o = track.orbs;
    const run = o.slice(a, b + 1);
    let rear = [];
    let front = [];
    if (track.linked(a - 1)) {
      let ra = a - 1;
      while (ra > 0 && track.linked(ra - 1)) ra--;
      rear = o.slice(ra, a);
    }
    if (track.linked(b)) {
      let fb = b + 1;
      while (track.linked(fb)) fb++;
      front = o.slice(b + 1, fb + 1);
    }
    let cx = 0;
    let cy = 0;
    for (const orb of run) {
      cx += orb.x;
      cy += orb.y;
    }
    cx /= run.length;
    cy /= run.length;
    const hasBlue = run.some((x) => !x.wild && x.color === BLUE);
    const hasRed = run.some((x) => !x.wild && x.color === RED);
    const points = run.map((x) => ({ x: x.x, y: x.y, color: x.color, wild: x.wild, s: x.s }));
    track.remove(run);

    let drop = false;
    if (inc) {
      this.combo++;
      drop = this.combo % 3 === 0;
    }
    this.emit({ type: 'pop', points, combo: this.combo, cascade, x: cx, y: cy, track: track.index });
    this.addRune(run.length);

    if (drop) {
      this.spawnIcon(cx, cy);
      // Recoil kick (§2.3): stretches kick apart; a swallowed front stretch kicks back.
      const kick = CONFIG.recoilDistance * CONFIG.recoilDecay;
      for (const x of rear) x.rv = -kick;
      if (front.length) {
        const headInside = track.path.insideAbyss(front[front.length - 1].s);
        for (const x of front) {
          x.rv = headInside ? -kick : kick;
          x.av = 0;
        }
      }
      this.emit({ type: 'recoil', x: cx, y: cy });
    }
    if (hasBlue && this.enchant.marchBlue) this.startButterflies();
    if (hasRed && this.enchant.orbsUnhatched) this.startFireflies();
  }

  /** Silent destruction (§4): no pop, no recoil, no combo; adds rune progress. */
  destroyOrbs(track, list, cause) {
    const alive = list.filter((o) => this.isAlive(o));
    if (!alive.length) return 0;
    this.emit({ type: 'dissolve', cause, points: alive.map((x) => ({ x: x.x, y: x.y, color: x.color, wild: x.wild })) });
    track.remove(alive);
    this.addRune(alive.length);
    return alive.length;
  }

  destroyInRadius(x, y, radiusOrbs, cause) {
    const R = radiusOrbs * this.D;
    for (const track of this.tracks) {
      const hit = track.orbs.filter((o) => Math.hypot(o.x - x, o.y - y) < R);
      if (hit.length) this.destroyOrbs(track, hit, cause);
    }
  }

  recolor(orb, color, cause) {
    if (!this.isAlive(orb)) return;
    orb.color = color;
    orb.wild = false;
    orb.flash = 1;
    this.emit({ type: 'recolor', x: orb.x, y: orb.y, color, cause });
  }

  /** The whole remaining line is Wilds: it can never self-match, so it pops itself. */
  allWildCheck() {
    for (const track of this.tracks) {
      const o = track.orbs;
      if (!o.length || !track.exhausted() || !o.every((x) => x.wild)) continue;
      if (this.pending.some((q) => q.orb.track === track)) continue;
      const run = o.slice();
      this.emit({ type: 'pop', points: run.map((x) => ({ x: x.x, y: x.y, color: x.color, wild: true, s: x.s })), combo: this.combo, cascade: false, x: run[0].x, y: run[0].y, track: track.index });
      track.remove(run);
      this.addRune(run.length);
    }
  }

  // ---------------------------------------------------------------------------
  // Power-up icons (§1.4, §2.6)

  rollPowerup() {
    const pool = this.powerupPool.length ? this.powerupPool : POWERUP_IDS;
    const W = CONFIG.powerupWeights;
    let t = this.rng.weighted(W, pool);
    if (t === this.lastPowerup && pool.length > 1 && this.rng.next() < CONFIG.antiRepeatReroll) t = this.rng.weighted(W, pool);
    this.lastPowerup = t;
    return t;
  }

  spawnIcon(x, y, type = this.rollPowerup()) {
    const m = CONFIG.runeMargin * this.D;
    x = Math.min(this.W - m, Math.max(m, x));
    y = Math.min(this.H - m, Math.max(m, y));
    const away = Math.atan2(y - this.slinger.y, x - this.slinger.x);
    const bias = this.enchant.powerMagnetism ? CONFIG.runeTowardBiasMagnet : CONFIG.runeTowardBias;
    const jitter = this.rng.range(0, Math.PI * 2);
    const vx = (1 - 2 * bias) * Math.cos(away) + 0.45 * Math.cos(jitter);
    const vy = (1 - 2 * bias) * Math.sin(away) + 0.45 * Math.sin(jitter);
    const icon = { id: this.nextId++, type, x, y, heading: Math.atan2(vy, vx), t: 0, ttl: CONFIG.runeLife, phase: this.rng.range(0, Math.PI * 2) };
    this.icons.push(icon);
    while (this.icons.length > CONFIG.runeMax) {
      const old = this.icons.shift();
      this.emit({ type: 'iconExpire', x: old.x, y: old.y, ptype: old.type });
    }
    this.emit({ type: 'drop', x, y, ptype: type });
    return icon;
  }

  updateIcons(dt) {
    const m = CONFIG.runeMargin * this.D;
    const v = CONFIG.runeDriftSpeed * this.D;
    const keep = [];
    for (const ic of this.icons) {
      ic.t += dt;
      ic.ttl -= dt;
      if (ic.ttl <= 0) {
        this.emit({ type: 'iconExpire', x: ic.x, y: ic.y, ptype: ic.type });
        continue;
      }
      const h = ic.heading + 0.7 * Math.sin(ic.t * 0.8 + ic.phase);
      ic.x += Math.cos(h) * v * dt;
      ic.y += Math.sin(h) * v * dt;
      if (ic.x < m || ic.x > this.W - m) {
        ic.x = Math.min(this.W - m, Math.max(m, ic.x));
        ic.heading = Math.PI - ic.heading;
      }
      if (ic.y < m || ic.y > this.H - m) {
        ic.y = Math.min(this.H - m, Math.max(m, ic.y));
        ic.heading = -ic.heading;
      }
      keep.push(ic);
    }
    this.icons = keep;
  }

  /** Shooting an icon: combo-neutral; the projectile is consumed. */
  collect(icon, proj) {
    this.icons = this.icons.filter((i) => i !== icon);
    this.emit({ type: 'collect', x: icon.x, y: icon.y, ptype: icon.type });
    const s = this.slinger;
    switch (icon.type) {
      case 'purpleFire':
        s.loadFront([{ kind: 'purple', color: null }]);
        break;
      case 'wild':
        s.loadFront([{ kind: 'wild', color: null }]);
        break;
      case 'firebolts':
        s.loadFront([0, 1, 2].map(() => ({ kind: 'firebolt', color: null })));
        break;
      case 'colourSplash':
        s.loadFront([{ kind: 'splash', color: this.randomPresentColor() }]);
        break;
      case 'frostRay':
        s.loadFront([{ kind: 'frost', color: null }]);
        break;
      case 'orbOfDecay':
        s.loadFront([{ kind: 'decay', color: null }]);
        break;
      case 'sparkShot':
        s.loadFront([{ kind: 'spark', color: null }]);
        break;
      case 'slow':
        this.startSlow();
        break;
      case 'backwards':
        this.startBackwards();
        break;
      case 'colourWipe':
        this.colourWipe(proj && proj.color != null ? proj.color : this.randomPresentColor());
        break;
      case 'butterflies':
        this.startButterflies();
        break;
      case 'fireSpinner':
        this.fireSpinner();
        break;
      case 'fireflies':
        this.startFireflies();
        break;
      case 'wrathOfStars':
        this.startStars();
        break;
      case 'runeReward':
        this.emit({ type: 'runeReward', x: this.slinger.x, y: this.slinger.y });
        this.addRune(Math.ceil(this.runeTarget / RUNE_PIPS));
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Effects (§4)

  startSlow() {
    const e = this.registry.find('slow');
    if (e) e.refresh();
    else this.registry.add(new DurationEffect('slow', CONFIG.slowDuration, { slowFactor: CONFIG.slowFactor }));
  }

  startBackwards() {
    const e = this.registry.find('backwards');
    if (e) e.refresh();
    else this.registry.add(new DurationEffect('backwards', CONFIG.backwardsDuration, { backwardsSpeed: CONFIG.backwardsSpeed }));
  }

  startButterflies() {
    this.registry.add(new ButterfliesEffect(this));
    this.emit({ type: 'butterflies' });
  }

  startFireflies() {
    const e = new FirefliesEffect(this);
    if (e.flies.length) this.registry.add(e);
  }

  startStars() {
    const e = new StarsEffect(this);
    if (e.stars.length) this.registry.add(e);
  }

  fireSpinner() {
    const n = CONFIG.spinnerPellets;
    const off = this.rng.range(0, (Math.PI * 2) / n);
    const s = this.slinger;
    for (let k = 0; k < n; k++) {
      const a = off + (k * Math.PI * 2) / n;
      this.pellets.push({ x: s.x, y: s.y, dx: Math.cos(a), dy: Math.sin(a), speed: CONFIG.pelletSpeed, r: CONFIG.effectProjSize / 2, kind: 'spinner' });
    }
    this.emit({ type: 'fireSpinner', x: s.x, y: s.y });
  }

  colourWipe(color) {
    this.emit({ type: 'wipe', color });
    for (const track of this.tracks) {
      const hit = track.orbs.filter((o) => !o.wild && o.color === color);
      if (hit.length) this.destroyOrbs(track, hit, 'wipe'); // graceful no-op when absent
    }
  }

  colourSplash(x, y, color) {
    const R = CONFIG.splashRadius * this.D;
    this.emit({ type: 'splash', x, y, radius: CONFIG.splashRadius, color });
    for (const track of this.tracks) {
      for (const orb of track.orbs) if (Math.hypot(orb.x - x, orb.y - y) < R) this.recolor(orb, color, 'splash');
    }
  }

  /** Frost Ray: instant widening beam from the muzzle; reaches covered and swallowed orbs. */
  frostRay(mx, my, dx, dy) {
    const D = this.D;
    this.emit({ type: 'beam', x: mx, y: my, angle: Math.atan2(dy, dx) });
    for (const track of this.tracks) {
      const hit = track.orbs.filter((o) => {
        const vx = o.x - mx;
        const vy = o.y - my;
        const along = (vx * dx + vy * dy) / D;
        if (along < 0) return false;
        const perp = Math.abs(vx * dy - vy * dx) / D;
        return perp < (CONFIG.frostBaseWidth + CONFIG.frostWidthGain * along) / 2;
      });
      if (hit.length) this.destroyOrbs(track, hit, 'frost');
    }
  }

  starBlast(x, y) {
    this.emit({ type: 'starLand', x, y });
    this.destroyInRadius(x, y, CONFIG.starRadius + 0.5, 'star');
  }

  // ---------------------------------------------------------------------------
  // Rune Circle (§1.5)

  addRune(n) {
    if (this.runeProgress >= this.runeTarget) return;
    const before = this.pipsLit();
    this.runeProgress = Math.min(this.runeTarget, this.runeProgress + n);
    const pips = this.pipsLit();
    if (pips !== before) this.emit({ type: 'rune', pips });
    if (this.enchant.runeFire) {
      while (pips - this.prelitPips >= this.runeFireNext) {
        this.runeFireNext += CONFIG.runeFireEvery;
        this.fireSpinner();
      }
    }
    if (!this.sealed && this.runeProgress >= this.runeTarget) this.seal();
  }

  seal() {
    this.sealed = true;
    this.emit({ type: 'sealed' });
    if (this.enchant.retreatOrders) {
      this.registry.add(new DurationEffect('retreat', CONFIG.retreatDuration, { backwardsSpeed: CONFIG.retreatSpeed }));
    }
    if (this.enchant.marchOfTheFurious) this.startButterflies();
  }

  // ---------------------------------------------------------------------------
  // Abyss (§1.6) and level end (§1.7)

  checkAbyss(dt) {
    let expired = false;
    for (const t of this.tracks) {
      if (t.anyInsideAbyss()) {
        t.graceT += dt;
        if (t.graceT >= CONFIG.abyssGrace) expired = true;
      } else {
        t.graceT = 0;
      }
    }
    if (expired && !this.registry.active()) this.startDrain();
  }

  startDrain() {
    this.state = 'draining';
    this.drainT = 0;
    this.slinger.buffer = 0;
    this.projectiles = [];
    this.pellets = [];
    for (const ic of this.icons) this.emit({ type: 'iconExpire', x: ic.x, y: ic.y, ptype: ic.type });
    this.icons = [];
    this.pending = [];
    this.registry.clear();
    this.emit({ type: 'drain' });
  }

  checkEnd() {
    if (this.state !== 'playing') return;
    const empty = this.tracks.every((t) => t.orbs.length === 0);
    // Soft-lock failsafe: stock exhausted and field cleared with the circle unfilled.
    if (!this.sealed && empty && this.tracks.every((t) => t.exhausted())) this.seal();
    if (this.sealed && empty && this.projectiles.length === 0) {
      this.state = 'won';
      this.slinger.buffer = 0;
      this.emit({ type: 'won' });
    }
  }

  updateVisuals(dt) {
    const w = 45;
    const z = 0.75;
    for (const t of this.tracks) {
      for (const o of t.orbs) {
        if (o.visOff !== 0 || o.visVel !== 0) {
          o.visVel += (-w * w * o.visOff - 2 * z * w * o.visVel) * dt;
          o.visOff += o.visVel * dt;
          if (Math.abs(o.visOff) < 1e-3 && Math.abs(o.visVel) < 1e-2) {
            o.visOff = 0;
            o.visVel = 0;
          }
        }
        if (o.fly) {
          o.fly.t += dt / 0.1;
          if (o.fly.t >= 1) o.fly = null;
        }
        if (o.flash > 0) o.flash = Math.max(0, o.flash - dt * 2.5);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Aim guide (§2.2)

  /** Ray from the muzzle along the aim to the first targetable orb (or the field edge). */
  aimGuide() {
    const s = this.slinger;
    const dx = Math.cos(s.angle);
    const dy = Math.sin(s.angle);
    const D = this.D;
    const loaded = s.loaded;
    const r = loaded && AMMO[loaded.kind]?.small ? CONFIG.effectProjSize / 2 : 0.5;
    const mx = s.x + dx * CONFIG.muzzleOffset * D;
    const my = s.y + dy * CONFIG.muzzleOffset * D;
    const R = (0.5 + r) * D;
    let bestT = Infinity;
    for (const track of this.tracks) {
      const path = track.path;
      for (const orb of track.orbs) {
        if (orb.s > path.visibleEnd) continue;
        const vx = orb.x - mx;
        const vy = orb.y - my;
        const along = vx * dx + vy * dy;
        if (along < 0) continue;
        const perp2 = vx * vx + vy * vy - along * along;
        if (perp2 > R * R) continue;
        const t = along - Math.sqrt(R * R - perp2);
        if (t < bestT && !path.isCovered(orb.s)) bestT = t;
      }
    }
    if (bestT === Infinity) {
      // distance to leave the field
      const tx = dx > 0 ? (this.W - mx) / dx : dx < 0 ? -mx / dx : Infinity;
      const ty = dy > 0 ? (this.H - my) / dy : dy < 0 ? -my / dy : Infinity;
      bestT = Math.min(tx, ty);
    }
    return { x0: mx, y0: my, x1: mx + dx * Math.max(0, bestT), y1: my + dy * Math.max(0, bestT) };
  }
}
