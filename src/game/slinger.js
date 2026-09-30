// The Slinger (§2.2): ammo queue, non-instant reload, overflow reserve, input buffer,
// swap / Eternity Swap, enchantment cadence (§5) and ammo fairness rerolls.

import { CONFIG } from '../config.js';

export class Slinger {
  /** @param {import('./game.js').Game} game */
  constructor(game, pos) {
    this.game = game;
    this.x = pos.x;
    this.y = pos.y;
    this.angle = -Math.PI / 2;
    this.capacity = game.enchant.hornOfPlenty ? CONFIG.queueSizeHorn : CONFIG.queueSize;
    this.queue = [];
    this.reserve = [];
    this.cooldown = 0;
    this.reloadT = CONFIG.reloadTime;
    this.buffer = 0;
    this.genCount = 0;
    this.kick = 0; // cosmetic recoil of the cradle (§7.5), 0..1
    for (let i = 0; i < this.capacity; i++) this.queue.push(this.generate());
  }

  /** Fresh orb; enchantment cadence counters tick here (generation time). */
  generate() {
    if (this.game.ammoScript.length) return { kind: 'normal', color: this.game.ammoScript.shift() };
    const e = this.game.enchant;
    const n = ++this.genCount;
    // the cadence enchantments share a group (§5), so at most one of these is equipped
    if (e.flamePurple && n % CONFIG.flamePurpleEvery === 0) return { kind: 'purple', color: null };
    if (e.suddenFire && n % CONFIG.suddenFireEvery === 0) return { kind: 'firebolt', color: null };
    if (e.callOfTheWild && n % CONFIG.callOfTheWildEvery === 0) return { kind: 'wild', color: null };
    return { kind: 'normal', color: this.game.randomPresentColor() };
  }

  get loaded() {
    return this.queue[0] || null;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.kick = Math.max(0, this.kick - dt * 6);
    if (this.queue.length < this.capacity) {
      this.reloadT -= dt;
      while (this.reloadT <= 0 && this.queue.length < this.capacity) {
        this.queue.push(this.reserve.length ? this.reserve.shift() : this.generate());
        this.reloadT += CONFIG.reloadTime;
        this.game.emit({ type: 'reload' });
      }
    } else {
      this.reloadT = CONFIG.reloadTime;
    }
    // The buffer can never out-run the ammo.
    this.buffer = Math.min(this.buffer, this.queue.length);
    if (this.buffer > 0 && this.cooldown <= 0 && this.queue.length) {
      this.buffer--;
      this.launch();
    }
  }

  /** Player click/tap. */
  fire() {
    if (this.game.state !== 'playing') return;
    if (!this.queue.length) return; // empty queue: no-op, no cooldown
    if (this.cooldown > 0) {
      this.buffer = Math.min(this.buffer + 1, this.queue.length);
      return;
    }
    this.launch();
  }

  launch() {
    const ammo = this.queue.shift();
    this.cooldown = CONFIG.fireCooldown;
    this.kick = 1;
    this.game.launch(ammo, this.angle);
  }

  swap() {
    if (this.game.state !== 'playing' || this.queue.length < 2) return;
    if (this.game.enchant.eternitySwap) this.queue.push(this.queue.shift());
    else [this.queue[0], this.queue[1]] = [this.queue[1], this.queue[0]];
    this.game.emit({ type: 'swap' });
  }

  /** Load power-up charges at the front; displaced orbs go to the overflow reserve. */
  loadFront(items) {
    this.queue.unshift(...items);
    const displaced = [];
    while (this.queue.length > this.capacity) displaced.unshift(this.queue.pop());
    this.reserve = displaced.concat(this.reserve);
  }

  /** Ammo fairness: normal orbs whose colour left the track are rerolled. */
  reroll(present) {
    if (!present.size) return;
    const colors = [...present];
    for (const list of [this.queue, this.reserve]) {
      for (const ammo of list) {
        if (ammo.kind === 'normal' && !present.has(ammo.color)) {
          ammo.color = colors[this.game.rng.int(colors.length)];
        }
      }
    }
  }
}
