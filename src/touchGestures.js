// Touch controls as a DOM-free state machine fed by Pointer Events (one call per pointer).
// One finger: hold aims (guide visible), release fires; a tap on the Slinger swaps.
// A second finger swaps at once and turns the whole gesture into a swap: nothing fires
// and nothing else swaps until every finger has lifted, so a two-finger tap never shoots.

export class TouchGestures {
  /** @param cb { aim(x, y), fire(), swap(), onSlinger(x, y, radius) } */
  constructor(cb) {
    this.cb = cb;
    this.touches = new Map(); // pointerId -> { x, y, onSlinger }
    this.multi = false;
  }

  /** True while a single finger is aiming: the guide shows. */
  get holding() {
    if (this.multi || this.touches.size !== 1) return false;
    return !this.touches.values().next().value.onSlinger;
  }

  reset() {
    this.touches.clear();
    this.multi = false;
  }

  down(id, x, y) {
    if (this.touches.size > 0) {
      this.touches.set(id, { x, y, onSlinger: false });
      if (!this.multi) {
        this.multi = true;
        this.cb.swap();
      }
      return;
    }
    const onSlinger = this.cb.onSlinger(x, y, 80);
    this.touches.set(id, { x, y, onSlinger });
    if (!onSlinger) this.cb.aim(x, y);
  }

  move(id, x, y) {
    const t = this.touches.get(id);
    if (!t) return;
    t.x = x;
    t.y = y;
    if (this.holding) this.cb.aim(x, y);
  }

  up(id, x, y) {
    const t = this.touches.get(id);
    if (!t) return;
    this.touches.delete(id);
    if (this.multi) {
      if (this.touches.size === 0) this.multi = false;
      return;
    }
    if (t.onSlinger) {
      if (this.cb.onSlinger(x, y, 90)) this.cb.swap();
      return;
    }
    this.cb.aim(x, y);
    this.cb.fire();
  }

  cancel(id) {
    this.touches.delete(id);
    if (this.touches.size === 0) this.multi = false;
  }
}
