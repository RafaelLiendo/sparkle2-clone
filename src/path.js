// Path geometry (§2.5): a chain of cubic Béziers, tangent-continuous at every join.
// Track distance `s` is measured in orbs: 0 = start of the visible span (end of the
// off-screen lead-in), `length` = the Abyss centre. s < 0 extrapolates the entry
// tangent (lead-in, no floor); s > length clamps at the hole centre.

import { CONFIG } from './config.js';

const LUT_STEP = 0.05; // orbs

function bez(p, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x,
    y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y,
  };
}

function bezDeriv(p, t) {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p[1].x - p[0].x) + 6 * u * t * (p[2].x - p[1].x) + 3 * t * t * (p[3].x - p[2].x),
    y: 3 * u * u * (p[1].y - p[0].y) + 6 * u * t * (p[2].y - p[1].y) + 3 * t * t * (p[3].y - p[2].y),
  };
}

function norm(v) {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

/** Throws if the chain has a non-continuous join, a kink, or a degenerate handle. */
export function validateBeziers(beziers, tol = 1e-3) {
  for (let i = 0; i < beziers.length; i++) {
    const b = beziers[i];
    if (b.length !== 4) throw new Error(`segment ${i}: expected 4 control points`);
    const d0 = bezDeriv(b, 0);
    const d1 = bezDeriv(b, 1);
    if (Math.hypot(d0.x, d0.y) < 1e-6 || Math.hypot(d1.x, d1.y) < 1e-6) {
      throw new Error(`segment ${i}: degenerate end tangent (cusp risk)`);
    }
    if (i > 0) {
      const prev = beziers[i - 1];
      const a = prev[3];
      if (Math.hypot(a.x - b[0].x, a.y - b[0].y) > tol) throw new Error(`join ${i}: gap`);
      const t0 = norm(bezDeriv(prev, 1));
      const t1 = norm(d0);
      if (t0.x * t1.x + t0.y * t1.y < 1 - 1e-4) throw new Error(`join ${i}: tangent discontinuity`);
    }
  }
}

export class Path {
  /**
   * @param {Array<Array<{x:number,y:number}>>} beziers chain of cubic Béziers (px)
   * @param {number} index z-order / level index (later paths render on top)
   */
  constructor(beziers, index = 0) {
    validateBeziers(beziers);
    this.beziers = beziers;
    this.index = index;
    this.D = CONFIG.orbDiameterPx;

    // Dense sampling for arc length.
    const xs = [];
    const ys = [];
    const ls = [];
    let total = 0;
    let prev = null;
    for (const b of beziers) {
      let est = 0;
      for (let i = 0; i < 3; i++) est += Math.hypot(b[i + 1].x - b[i].x, b[i + 1].y - b[i].y);
      const n = Math.max(16, Math.ceil(est / 0.75));
      for (let i = prev ? 1 : 0; i <= n; i++) {
        const p = bez(b, i / n);
        if (prev) total += Math.hypot(p.x - prev.x, p.y - prev.y);
        xs.push(p.x);
        ys.push(p.y);
        ls.push(total);
        prev = p;
      }
    }
    this.lengthPx = total;
    this.length = total / this.D;

    // Uniform LUT in orbs.
    const count = Math.ceil(this.length / LUT_STEP) + 2;
    this.lutX = new Float32Array(count);
    this.lutY = new Float32Array(count);
    let j = 0;
    for (let k = 0; k < count; k++) {
      const target = Math.min(k * LUT_STEP * this.D, total);
      while (j < ls.length - 2 && ls[j + 1] < target) j++;
      const span = ls[j + 1] - ls[j] || 1;
      const f = Math.min(1, Math.max(0, (target - ls[j]) / span));
      this.lutX[k] = xs[j] + (xs[j + 1] - xs[j]) * f;
      this.lutY[k] = ys[j] + (ys[j + 1] - ys[j]) * f;
    }
    this.lutCount = count;

    const d0 = norm(bezDeriv(beziers[0], 0));
    this.start = { x: beziers[0][0].x, y: beziers[0][0].y };
    this.startDir = d0;
    const last = beziers[beziers.length - 1];
    this.end = { x: last[3].x, y: last[3].y };
    this.endDir = norm(bezDeriv(last, 1));
    this.startAngle = Math.atan2(d0.y, d0.x);
    this.endAngle = Math.atan2(this.endDir.y, this.endDir.x);

    this.abyssRadius = CONFIG.ABYSS_RADIUS;
    /** s of the Abyss edge — progress fraction 1. */
    this.visibleEnd = this.length - this.abyssRadius;
    this.covered = []; // [[s0, s1], ...]
  }

  /** Point at track distance s (orbs). Writes into `out` if given. */
  pointAt(s, out = { x: 0, y: 0 }) {
    if (s <= 0) {
      const d = s * this.D;
      out.x = this.start.x + this.startDir.x * d;
      out.y = this.start.y + this.startDir.y * d;
      return out;
    }
    if (s >= this.length) {
      out.x = this.end.x;
      out.y = this.end.y;
      return out;
    }
    const f = s / LUT_STEP;
    const i = Math.min(this.lutCount - 2, Math.floor(f));
    const t = f - i;
    out.x = this.lutX[i] + (this.lutX[i + 1] - this.lutX[i]) * t;
    out.y = this.lutY[i] + (this.lutY[i + 1] - this.lutY[i]) * t;
    return out;
  }

  /** Tangent angle (radians) at s. */
  angleAt(s) {
    if (s <= 0) return this.startAngle;
    if (s >= this.length - LUT_STEP) return this.endAngle;
    const i = Math.min(this.lutCount - 3, Math.floor(s / LUT_STEP));
    const dx = this.lutX[i + 2] - this.lutX[i];
    const dy = this.lutY[i + 2] - this.lutY[i];
    return Math.atan2(dy, dx);
  }

  /** Progress over the visible span: 0 at the lead's end, 1 at the Abyss edge. */
  progress(s) {
    return s / this.visibleEnd;
  }

  insideAbyss(s) {
    return s > this.visibleEnd;
  }

  isCovered(s) {
    for (const [a, b] of this.covered) if (s >= a && s <= b) return true;
    return false;
  }

  /** Minimum distance (px) from point to this path's visible centreline. */
  distanceTo(x, y) {
    let best = Infinity;
    for (let k = 0; k < this.lutCount; k++) {
      const dx = this.lutX[k] - x;
      const dy = this.lutY[k] - y;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /** Iterate polyline points along [s0, s1] at `step` orbs (for rendering). */
  polyline(s0, s1, step = 0.1) {
    const pts = [];
    for (let s = s0; s < s1; s += step) pts.push(this.pointAt(s));
    pts.push(this.pointAt(s1));
    return pts;
  }
}

/**
 * Compute covered intervals (§2.5 crossings): positions of each lower path whose point
 * lies within `crossoverCover` orbs of a higher path's centreline.
 */
export function computeCoverage(paths) {
  const step = 0.1;
  for (const p of paths) {
    p.covered = [];
    const higher = paths.filter((q) => q.index > p.index);
    if (!higher.length) continue;
    const limit = CONFIG.crossoverCover * p.D;
    let open = null;
    for (let s = 0; s <= p.length + 1e-9; s += step) {
      const pt = p.pointAt(s);
      let hit = false;
      for (const q of higher) {
        // cheap bounding reject before the exact scan
        if (q.distanceTo(pt.x, pt.y) < limit) {
          hit = true;
          break;
        }
      }
      if (hit && open === null) open = s;
      if (!hit && open !== null) {
        p.covered.push([open, s - step]);
        open = null;
      }
    }
    if (open !== null) p.covered.push([open, p.length]);
  }
}
