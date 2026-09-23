// Seeded RNG (mulberry32) — all gameplay randomness goes through this.

export class Rng {
  constructor(seed = 1) {
    this.state = seed >>> 0 || 1;
  }

  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a, b) {
    return a + (b - a) * this.next();
  }

  int(n) {
    return Math.floor(this.next() * n);
  }

  pick(arr) {
    return arr[this.int(arr.length)];
  }

  /** Pick a key from `{key: weight}` restricted to `keys`. */
  weighted(weights, keys) {
    let total = 0;
    for (const k of keys) total += weights[k] || 0;
    if (total <= 0) return keys[0];
    let r = this.next() * total;
    for (const k of keys) {
      r -= weights[k] || 0;
      if (r < 0) return k;
    }
    return keys[keys.length - 1];
  }

  /** Fisher–Yates sample without replacement. */
  sample(arr, count) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, count);
  }
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
