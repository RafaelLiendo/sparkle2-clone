// Timed-effect registry (§4) and the duration-based effects. Every duration-based
// effect registers here; the Abyss drain gate (§1.6) and the HUD read it generically.

import { CONFIG } from '../config.js';

export class EffectRegistry {
  constructor() {
    this.entries = [];
  }

  add(effect) {
    this.entries.push(effect);
    return effect;
  }

  find(type) {
    return this.entries.find((e) => e.type === type);
  }

  /** Any timed effect running (drain deferral). */
  active() {
    return this.entries.length > 0;
  }

  update(dt, game) {
    this.entries = this.entries.filter((e) => e.update(dt, game) !== false);
  }

  /** Product of slow-type factors (§2.3 tier 1). */
  slowMult() {
    let m = 1;
    for (const e of this.entries) if (e.slowFactor) m *= e.slowFactor;
    return m;
  }

  /** Hard backwards override speed (§2.3 tier 2), or null. */
  backwards() {
    let v = null;
    for (const e of this.entries) if (e.backwardsSpeed != null) v = v === null ? e.backwardsSpeed : Math.min(v, e.backwardsSpeed);
    return v;
  }

  clear() {
    this.entries = [];
  }
}

/** Plain duration effect: Slow, Backwards, Retreat Orders. */
export class DurationEffect {
  constructor(type, duration, props = {}) {
    this.type = type;
    this.duration = duration;
    this.remaining = duration;
    Object.assign(this, props);
  }

  refresh() {
    this.remaining = this.duration;
  }

  fraction() {
    return this.remaining / this.duration;
  }

  update(dt) {
    this.remaining -= dt;
    return this.remaining > 0;
  }
}

/**
 * Flight of the Butterflies (§4): each butterfly emerges from its path's Abyss and flies
 * backward along the path, silently destroying the first orb it meets outside the Abyss.
 */
export class ButterfliesEffect {
  constructor(game) {
    this.type = 'butterflies';
    const tracks = game.tracks;
    this.flights = [];
    for (let i = 0; i < CONFIG.butterflyCount; i++) {
      const track = tracks[i % tracks.length];
      this.flights.push({
        track,
        s: track.path.length,
        delay: i * CONFIG.critterStagger,
        done: false,
        x: track.path.end.x,
        y: track.path.end.y,
        t: 0,
        seed: game.rng.next() * 10,
      });
    }
  }

  fraction() {
    return this.flights.filter((f) => !f.done).length / this.flights.length;
  }

  update(dt, game) {
    for (const f of this.flights) {
      if (f.done) continue;
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.t += dt;
      const path = f.track.path;
      let remaining = CONFIG.butterflySpeed * dt;
      while (remaining > 0 && !f.done) {
        const step = Math.min(0.25, remaining);
        remaining -= step;
        const prev = f.s;
        f.s -= step;
        // First orb met: the frontmost orb outside the Abyss inside the swept window.
        // Orbs that surface behind the butterfly (s > prev + reach) were never met.
        const reach = 0.5 + CONFIG.effectProjSize / 2;
        let hit = null;
        for (const orb of f.track.orbs) {
          if (orb.s > path.visibleEnd) continue;
          if (orb.s >= f.s - reach && orb.s <= prev + reach && (!hit || orb.s > hit.s)) hit = orb;
        }
        if (hit) {
          game.destroyOrbs(f.track, [hit], 'butterfly');
          f.done = true;
        } else if (f.s <= 0) {
          f.done = true; // reached the spawn point unspent
        }
      }
      const p = path.pointAt(Math.max(0, f.s));
      f.x = p.x;
      f.y = p.y;
      f.angle = path.angleAt(Math.max(0, f.s)) + Math.PI;
    }
    return this.flights.some((f) => !f.done);
  }

  actors() {
    return this.flights.filter((f) => !f.done && f.delay <= 0).map((f) => ({ kind: 'butterfly', x: f.x, y: f.y, angle: f.angle, t: f.t + f.seed }));
  }
}

/**
 * Fireflies (§4): up to `fireflyCount` orbs sitting linked beside a different-coloured,
 * non-Wild neighbour are recoloured to that neighbour's colour.
 */
export class FirefliesEffect {
  constructor(game) {
    this.type = 'fireflies';
    const candidates = [];
    for (const track of game.tracks) {
      const o = track.orbs;
      for (let i = 0; i < o.length; i++) {
        const orb = o[i];
        if (orb.wild) continue;
        const nbrs = [];
        if (track.linked(i - 1) && !o[i - 1].wild && o[i - 1].color !== orb.color) nbrs.push(o[i - 1].color);
        if (track.linked(i) && !o[i + 1].wild && o[i + 1].color !== orb.color) nbrs.push(o[i + 1].color);
        if (nbrs.length) candidates.push({ orb, nbrs });
      }
    }
    const chosen = game.rng.sample(candidates, CONFIG.fireflyCount);
    this.flies = chosen.map((c, k) => ({
      orb: c.orb,
      color: c.nbrs[game.rng.int(c.nbrs.length)],
      sx: game.slinger.x + Math.cos(k * 1.7) * 30,
      sy: game.slinger.y + Math.sin(k * 1.7) * 30,
      x: game.slinger.x,
      y: game.slinger.y,
      t: 0,
      done: false,
      seed: game.rng.next() * 10,
    }));
  }

  fraction() {
    return this.flies.filter((f) => !f.done).length / Math.max(1, this.flies.length);
  }

  update(dt, game) {
    for (const f of this.flies) {
      if (f.done) continue;
      f.t += dt;
      if (!game.isAlive(f.orb)) {
        f.done = true; // target vanished: the firefly fizzles
        continue;
      }
      const u = Math.min(1, f.t / CONFIG.fireflyTravel);
      const e = u * u * (3 - 2 * u);
      // curved homing flight
      const bend = Math.sin(u * Math.PI) * 60;
      const dx = f.orb.x - f.sx;
      const dy = f.orb.y - f.sy;
      const len = Math.hypot(dx, dy) || 1;
      f.x = f.sx + dx * e + (-dy / len) * bend * Math.sin(f.seed);
      f.y = f.sy + dy * e + (dx / len) * bend * Math.sin(f.seed);
      if (u >= 1) {
        game.recolor(f.orb, f.color, 'firefly');
        f.done = true;
      }
    }
    return this.flies.some((f) => !f.done);
  }

  actors() {
    return this.flies.filter((f) => !f.done).map((f) => ({ kind: 'firefly', x: f.x, y: f.y, t: f.t + f.seed, color: f.color }));
  }
}

/** Wrath of the Stars (§4). */
export class StarsEffect {
  constructor(game) {
    this.type = 'wrathOfStars';
    const pool = [];
    for (const track of game.tracks) {
      for (const orb of track.orbs) if (orb.s >= 0 && orb.s <= track.path.visibleEnd) pool.push(orb);
    }
    const targets = game.rng.sample(pool, CONFIG.starCount);
    while (pool.length && targets.length < CONFIG.starCount) targets.push(game.rng.pick(pool));
    this.stars = targets.map((orb, k) => ({
      orb,
      tx: orb.x,
      ty: orb.y,
      sx: orb.x + game.rng.range(-220, 220),
      sy: -80,
      x: 0,
      y: -80,
      delay: k * CONFIG.critterStagger,
      t: 0,
      done: false,
    }));
  }

  fraction() {
    return this.stars.filter((s) => !s.done).length / Math.max(1, this.stars.length);
  }

  update(dt, game) {
    for (const s of this.stars) {
      if (s.done) continue;
      if (s.delay > 0) {
        s.delay -= dt;
        continue;
      }
      s.t += dt;
      if (game.isAlive(s.orb)) {
        s.tx = s.orb.x;
        s.ty = s.orb.y;
      }
      const u = Math.min(1, s.t / CONFIG.starFall);
      const e = u * u;
      s.x = s.sx + (s.tx - s.sx) * e;
      s.y = s.sy + (s.ty - s.sy) * e;
      if (u >= 1) {
        game.starBlast(s.tx, s.ty);
        s.done = true;
      }
    }
    return this.stars.some((s) => !s.done);
  }

  actors() {
    return this.stars
      .filter((s) => !s.done && s.delay <= 0)
      .map((s) => ({ kind: 'star', x: s.x, y: s.y, angle: Math.atan2(s.ty - s.sy, s.tx - s.sx) }));
  }
}
