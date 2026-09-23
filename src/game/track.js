// One path's orb lines: motion model (§2.3), gap attraction (§1.2), pushers (§2.4).
// Orbs are kept sorted by track distance `s` ascending (tail → head). Segments are
// recomputed every frame from spacing, so splits and merges fall out for free.

import { CONFIG } from '../config.js';

export function sameColor(a, b) {
  return a.wild || b.wild || a.color === b.color;
}

const LINK_EPS = 1e-6;

export class Track {
  /**
   * @param {import('./game.js').Game} game
   * @param {import('../path.js').Path} path
   * @param {{waves: Array<{stock:number, delay?:number}>}} def
   */
  constructor(game, path, def) {
    this.game = game;
    this.path = path;
    this.index = path.index;
    this.orbs = [];
    this.pushers = [];
    this.waveDefs = (def.waves || []).map((w) => ({ stock: w.stock, delay: w.delay ?? 6 }));
    this.nextWave = 0;
    this.waveTimer = 0;
    this.graceT = 0;
    this.mouth = -CONFIG.spawnLeadOrbs;
    /** ids of orbs that face a colour-linked (attracting) gap — used for settle deferral. */
    this.attractEdges = new Set();
    if (this.waveDefs.length) this.spawnWave(true);
  }

  // ---------------------------------------------------------------------------
  // Queries

  linked(i) {
    const o = this.orbs;
    return i >= 0 && i + 1 < o.length && o[i + 1].s - o[i].s <= CONFIG.splitGap + LINK_EPS;
  }

  indexOf(orb) {
    return this.orbs.indexOf(orb);
  }

  /** Maximal run through idx of pairwise-sameColor linked neighbours (§3 Wild chaining). */
  runAt(idx) {
    const o = this.orbs;
    let a = idx;
    let b = idx;
    while (a > 0 && this.linked(a - 1) && sameColor(o[a - 1], o[a])) a--;
    while (b < o.length - 1 && this.linked(b) && sameColor(o[b], o[b + 1])) b++;
    return [a, b];
  }

  /** Contiguous stretch (segment) containing idx. */
  stretchAt(idx) {
    let a = idx;
    let b = idx;
    while (a > 0 && this.linked(a - 1)) a--;
    while (b < this.orbs.length - 1 && this.linked(b)) b++;
    return [a, b];
  }

  canFeed(p) {
    return p.stock > 0 && !this.game.sealed;
  }

  /** No pusher can feed and no wave remains. */
  exhausted() {
    if (this.game.sealed) return true;
    return !this.pushers.some((p) => p.stock > 0) && this.nextWave >= this.waveDefs.length;
  }

  anyInsideAbyss() {
    const o = this.orbs;
    return o.length > 0 && o[o.length - 1].s > this.path.visibleEnd;
  }

  /** Whether the run [a,b] touches a colour-linked attracting gap edge. */
  runTouchesAttraction(a, b) {
    return this.attractEdges.has(this.orbs[a].id) || this.attractEdges.has(this.orbs[b].id);
  }

  // ---------------------------------------------------------------------------
  // Spawning (§2.4 spawn model, §2.5 lead-in)

  makeOrb(color, s, wild = false) {
    return this.game.createOrb(this, color, s, wild);
  }

  spawnWave(prefill) {
    const w = this.waveDefs[this.nextWave++];
    const p = {
      id: this.game.nextId++,
      s: this.mouth - 1,
      stock: w.stock,
      mult: CONFIG.speedParams.rolloutMult,
      rolloutDone: false,
      speed: 0,
      av: 0,
    };
    if (prefill) {
      // Prefilled wave: head sits at the spawn boundary (s = 0); the line fills the lead.
      const count = Math.min(p.stock, CONFIG.spawnLeadOrbs + 1);
      const made = [];
      let run = 0;
      for (let k = 0; k < count; k++) {
        const prev = made.length ? made[made.length - 1] : null;
        const color = this.game.lineColor(prev, run);
        run = color === prev ? run + 1 : 1;
        made.push(color);
      }
      // made[0] is the head.
      for (let k = count - 1; k >= 0; k--) this.orbs.push(this.makeOrb(made[k], -k));
      p.stock -= count;
      p.s = -count;
    }
    this.pushers.push(p);
    this.pushers.sort((a, b) => a.s - b.s);
    this.waveTimer = 0;
    return p;
  }

  /** Position-gated feed: prepend orbs at the mouth while the pusher is at/past it. */
  feed() {
    for (const p of this.pushers) {
      while (this.canFeed(p) && p.s >= this.mouth) {
        const tail = this.firstOwnedIndex(p);
        const tailOrb = tail >= 0 && this.orbs[tail].s - p.s <= CONFIG.splitGap + LINK_EPS ? this.orbs[tail] : null;
        let run = 0;
        if (tailOrb) {
          run = 1;
          if (this.linked(tail) && this.orbs[tail + 1].color === tailOrb.color) run = 2;
        }
        const color = this.game.lineColor(tailOrb ? tailOrb.color : null, run);
        const orb = this.makeOrb(color, p.s);
        if (tailOrb) {
          orb.rv = tailOrb.rv;
          orb.av = tailOrb.av;
        }
        const at = tail >= 0 ? tail : this.insertionIndexFor(p.s);
        this.orbs.splice(at, 0, orb);
        p.stock -= 1;
        p.s -= 1;
      }
    }
  }

  insertionIndexFor(s) {
    let i = 0;
    while (i < this.orbs.length && this.orbs[i].s < s) i++;
    return i;
  }

  /** Index of the first orb ahead of pusher p (its tail), or -1. */
  firstOwnedIndex(p) {
    const o = this.orbs;
    for (let i = 0; i < o.length; i++) if (o[i].s > p.s) return i;
    return -1;
  }

  updateWaves(dt) {
    if (this.game.sealed || this.nextWave >= this.waveDefs.length) return;
    const newest = this.pushers.reduce((m, p) => (p.id > (m?.id ?? -1) ? p : m), null);
    if (newest && newest.stock > 0) return;
    this.waveTimer += dt;
    if (this.waveTimer >= this.waveDefs[this.nextWave].delay) this.spawnWave(false);
  }

  // ---------------------------------------------------------------------------
  // Motion

  /**
   * Advance one fixed step.
   * @param {number} dt
   * @param {{backwards: number|null, slowMult: number, enchantMult: number, base: number,
   *          draining?: boolean, drainSpeed?: number}} env
   * @returns {{merges: Array<{left:object,right:object,speed:number}>}}
   */
  update(dt, env) {
    if (env.draining) return this.updateDrain(dt, env.drainSpeed);

    const C = CONFIG;
    const sp = C.speedParams;
    const path = this.path;

    this.updateWaves(dt);
    this.feed();
    this.pushers.sort((a, b) => a.s - b.s);
    this.checkOvertakes();
    this.cullPushers();

    const o = this.orbs;
    const n = o.length;

    // --- segments at frame start
    const prevLink = new Uint8Array(Math.max(0, n - 1));
    for (let i = 0; i < n - 1; i++) prevLink[i] = o[i + 1].s - o[i].s <= C.splitGap + LINK_EPS ? 1 : 0;
    const segs = [];
    let start = 0;
    for (let i = 0; i < n; i++) {
      if (i === n - 1 || !prevLink[i]) {
        segs.push({ a: start, b: i, rear: null, v: 0, av: 0, rv: 0 });
        start = i + 1;
      }
    }

    // --- pusher ownership, contact and line speed
    const pushers = this.pushers;
    const firstIdx = pushers.map((p) => this.firstOwnedIndex(p));
    pushers.forEach((p, k) => {
      const f = firstIdx[k];
      const nextP = pushers[k + 1];
      // head = last orb before the next pusher
      let head = -1;
      if (f >= 0) {
        head = f;
        while (head + 1 < n && (!nextP || o[head + 1].s < nextP.s)) head++;
        if (nextP && o[f].s > nextP.s) head = -1;
      }
      const headS = head >= 0 ? o[head].s : p.s + 1;
      const prog = path.progress(headS);
      if (!p.rolloutDone && prog >= sp.rolloutUntil) p.rolloutDone = true;
      const target =
        (p.rolloutDone ? 1 : sp.rolloutMult) * (prog >= sp.dangerFrom ? sp.dangerMult : 1) * env.slowMult * env.enchantMult;
      p.mult += (target - p.mult) * (1 - Math.exp(-dt / C.speedSmoothing));
      p.speed = env.base * p.mult;
      p.contact = f >= 0 && o[f].s - p.s <= C.splitGap + LINK_EPS && (!nextP || o[f].s < nextP.s);
      p.tailIdx = f;
    });

    // --- rear neighbour of each segment
    for (let k = 0; k < segs.length; k++) {
      const seg = segs[k];
      const frontS = o[seg.a].s;
      const prevSeg = k > 0 ? segs[k - 1] : null;
      const prevS = prevSeg ? o[prevSeg.b].s : -Infinity;
      let pusher = null;
      for (const p of pushers) if (p.s < frontS && p.s > prevS) pusher = p;
      if (pusher) seg.rear = { type: 'pusher', p: pusher, contact: pusher.contact && pusher.tailIdx === seg.a };
      else if (prevSeg) seg.rear = { type: 'seg', seg: prevSeg };
    }

    // --- gap attraction (§1.2), pusher gap attraction (§2.4)
    this.attractEdges.clear();
    const backwards = env.backwards !== null;
    for (const seg of segs) {
      seg.rv = o[seg.a].rv;
      let av = o[seg.a].av;
      const r = seg.rear;
      let linked = false;
      if (!backwards && r) {
        if (r.type === 'seg') {
          linked = sameColor(o[r.seg.b], o[seg.a]);
          if (linked) {
            this.attractEdges.add(o[r.seg.b].id);
            this.attractEdges.add(o[seg.a].id);
          }
        } else if (!r.contact && !this.canFeed(r.p)) {
          linked = true; // pusher gap attraction: no colour gate
        }
      }
      if (linked) {
        av = av > 0 ? Math.min(C.attractMax, av + C.attractAccel * dt) : C.attractBase;
      } else if (av > 0) {
        // Link broken: coast out on the standard recoil decay (carried momentum).
        if (!backwards) seg.rv = -av;
        av = 0;
      }
      seg.av = av;
    }

    // --- velocities & integration
    const k = C.recoilDecay;
    const decay = Math.exp(-k * dt);
    const moved = new Set();
    for (const seg of segs) {
      let v;
      const attached = seg.rear && seg.rear.type === 'pusher' && seg.rear.contact ? seg.rear.p : null;
      if (backwards) v = env.backwards;
      else if (attached) v = attached.speed;
      else v = -seg.av;
      let rv = seg.rv;
      let dispR = 0;
      if (rv !== 0) {
        dispR = (rv * (1 - decay)) / k;
        rv *= decay;
        if (Math.abs(rv) < 1e-3) rv = 0;
      }
      const disp = v * dt + dispR;
      seg.v = v + seg.rv;
      for (let i = seg.a; i <= seg.b; i++) {
        o[i].s += disp;
        o[i].rv = rv;
        o[i].av = seg.av;
      }
      if (attached) {
        attached.s += disp;
        moved.add(attached);
      }
    }
    for (const p of pushers) {
      if (moved.has(p)) continue;
      p.s += (backwards ? env.backwards : p.speed) * dt;
    }

    // --- forward packing & snapping (pushers interleaved as virtual orbs)
    const segOf = new Int32Array(n);
    segs.forEach((seg, si) => {
      for (let i = seg.a; i <= seg.b; i++) segOf[i] = si;
    });
    const pushersBefore = new Map();
    pushers.forEach((p, idx) => {
      const f = firstIdx[idx] >= 0 ? firstIdx[idx] : n;
      if (!pushersBefore.has(f)) pushersBefore.set(f, []);
      pushersBefore.get(f).push(p);
    });
    const pusherContactBefore = new Map(pushers.map((p) => [p, p.contact]));
    let prevS = -Infinity;
    let prevVel = 0;
    const merges = [];
    const mergedSegs = new Set();
    for (let i = 0; i <= n; i++) {
      const ps = pushersBefore.get(i);
      if (ps) {
        for (const p of ps) {
          if (p.s < prevS + 1) p.s = prevS + 1;
          prevS = p.s;
          prevVel = backwards ? env.backwards : p.speed;
        }
      }
      if (i === n) break;
      const orb = o[i];
      const gap = orb.s - prevS;
      const fromPusher = ps && ps.length > 0;
      if (gap <= C.splitGap + LINK_EPS) {
        const wasLinked = fromPusher ? pusherContactBefore.get(ps[ps.length - 1]) && firstIdx[pushers.indexOf(ps[ps.length - 1])] === i : i > 0 && prevLink[i - 1];
        orb.s = prevS + 1;
        if (!wasLinked) {
          const vel = segs[segOf[i]].v;
          mergedSegs.add(segOf[i]);
          if (!fromPusher) {
            mergedSegs.add(segOf[i - 1]);
            merges.push({ left: o[i - 1], right: orb, speed: Math.abs(prevVel - vel) });
          } else {
            merges.push({ left: null, right: orb, speed: Math.abs(prevVel - vel), pusher: true });
          }
        }
      }
      prevS = orb.s;
      prevVel = segs[segOf[i]].v;
    }

    // Contact absorbs recoil (and ends attraction) for every merged body.
    if (mergedSegs.size) {
      // Merged bodies may chain through several old segments; zero all orbs now linked to them.
      for (const si of mergedSegs) {
        const seg = segs[si];
        const [a, b] = this.stretchAt(seg.a);
        for (let i = a; i <= b; i++) {
          o[i].rv = 0;
          o[i].av = 0;
        }
      }
    }

    this.updatePositions();
    return { merges };
  }

  /** Destroy overtaken pushers (§2.4 overtake/merge rule). */
  checkOvertakes() {
    const ps = this.pushers;
    const o = this.orbs;
    for (let k = ps.length - 1; k >= 1; k--) {
      const front = ps[k];
      const rear = ps[k - 1];
      // rear line's head: last orb with s < front.s
      let head = null;
      let tail = null;
      for (let i = 0; i < o.length; i++) {
        if (o[i].s < front.s) head = o[i];
        else {
          tail = o[i];
          break;
        }
      }
      if (!head || head.s <= rear.s) continue;
      const caught =
        (tail && tail.s - head.s <= CONFIG.overtakeDistance + 1e-9) || head.s + 1 >= front.s - 1e-9;
      if (caught) {
        rear.stock += front.stock;
        rear.rolloutDone = true;
        rear.mult = 1;
        ps.splice(k, 1);
        this.game.emit({ type: 'pusherOvertaken', track: this.index });
      }
    }
  }

  /** A pusher dies when its line is empty and it can feed no more. */
  cullPushers() {
    const ps = this.pushers;
    for (let k = ps.length - 1; k >= 0; k--) {
      const p = ps[k];
      if (this.canFeed(p)) continue;
      const next = ps[k + 1];
      const hasOrbs = this.orbs.some((orb) => orb.s > p.s && (!next || orb.s < next.s));
      if (!hasOrbs) {
        ps.splice(k, 1);
        this.game.emit({ type: 'pusherGone', track: this.index });
      }
    }
  }

  updateDrain(dt, v) {
    const L = this.path.length;
    for (const orb of this.orbs) orb.s += v * dt;
    for (const p of this.pushers) p.s += v * dt;
    const sunk = this.orbs.filter((orb) => orb.s > L + 0.6);
    if (sunk.length) {
      this.orbs = this.orbs.filter((orb) => orb.s <= L + 0.6);
      for (const orb of sunk) this.game.forgetOrb(orb);
    }
    this.pushers = this.pushers.filter((p) => p.s < L);
    this.updatePositions();
    return { merges: [] };
  }

  updatePositions() {
    const path = this.path;
    for (const orb of this.orbs) path.pointAt(orb.s, orb);
    for (const p of this.pushers) {
      const pt = path.pointAt(p.s);
      p.x = pt.x;
      p.y = pt.y;
    }
  }

  // ---------------------------------------------------------------------------
  // Mutation

  /**
   * Insert `orb` next to orbs[hitIdx] (§2.3 shove): the contiguous stretch ahead of the
   * insertion point moves forward one orb as a block; behind is untouched.
   */
  insert(hitIdx, after, orb) {
    const o = this.orbs;
    const X = o[hitIdx];
    let insIdx;
    let firstShift;
    if (after) {
      insIdx = hitIdx + 1;
      orb.s = X.s + 1;
      firstShift = this.linked(hitIdx) ? hitIdx + 1 : -1;
    } else {
      insIdx = hitIdx;
      orb.s = X.s;
      firstShift = hitIdx;
    }
    // A shove can close the gap in front of the shoved block: that contact is a merge.
    const junctions = [];
    if (firstShift >= 0) {
      let end = firstShift;
      while (this.linked(end)) end++;
      for (let i = firstShift; i <= end; i++) {
        o[i].s += 1;
        o[i].visOff -= 1;
      }
      if (this.linked(end)) junctions.push([o[end], o[end + 1]]);
    } else if (insIdx < o.length && o[insIdx].s - orb.s <= CONFIG.splitGap + LINK_EPS) {
      // Inserted into a gap narrower than one orb.
      junctions.push([orb, o[insIdx]]);
    }
    orb.rv = X.rv;
    orb.av = X.av;
    o.splice(insIdx, 0, orb);
    for (const [left] of junctions) {
      // Contact absorbs recoil and ends attraction across the merged body.
      const [a, b] = this.stretchAt(this.orbs.indexOf(left));
      for (let i = a; i <= b; i++) {
        o[i].rv = 0;
        o[i].av = 0;
      }
    }
    this.updatePositions();
    return { index: insIdx, junctions };
  }

  /** Remove orbs (array of orb objects). Returns removed count. */
  remove(list) {
    if (!list.length) return 0;
    const dead = new Set(list);
    this.orbs = this.orbs.filter((orb) => !dead.has(orb));
    for (const orb of list) this.game.forgetOrb(orb);
    return list.length;
  }
}
