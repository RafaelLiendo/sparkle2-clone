// Visual effects driven by game events. A pop is a dissolution, not an explosion
// (§7.3): the engraving glows, the body brightens briefly, then disperses into rising
// motes. Flash safety (§7.6): every effect is local, ramps in/out ≥ 80 ms, and
// simultaneous glows are staggered and attenuated.

import { CONFIG } from '../config.js';
import { COLORS } from '../defs.js';

const GOLD = '#FFD27A';
const MAX_MOTES = 700;

export class Vfx {
  constructor(art, settings) {
    this.art = art;
    this.settings = settings;
    this.ghosts = [];
    this.motes = [];
    this.fx = []; // rings, beams, blasts, splashes
  }

  get reduced() {
    return !!this.settings.reducedFlashing;
  }

  clear() {
    this.ghosts = [];
    this.motes = [];
    this.fx = [];
  }

  handle(ev) {
    const D = CONFIG.orbDiameterPx;
    switch (ev.type) {
      case 'pop': {
        const combo = ev.combo || 0;
        const n = ev.points.length;
        ev.points.forEach((p, i) => {
          // stagger along the run so peaks never coincide
          this.ghosts.push({ ...p, t: -i * 0.025, dur: 0.42 + Math.min(0.3, combo * 0.03), peak: 1, silent: false });
          this.spawnMotes(p.x, p.y, p.wild ? '#FFF2D0' : COLORS[p.color].glow, this.reduced ? 3 : 7, combo >= 3 ? Math.min(6, combo - 1) : 0, -i * 0.025);
        });
        if (combo >= 3 && !this.reduced) {
          this.fx.push({ kind: 'ring', x: ev.x, y: ev.y, r0: D * 0.4, r1: D * (1.2 + Math.min(1, combo * 0.08)), t: 0, dur: 0.9, color: GOLD, alpha: 0.22 });
        }
        if (n >= 5 && !this.reduced) {
          this.fx.push({ kind: 'ring', x: ev.x, y: ev.y, r0: D * 0.3, r1: D * 0.9, t: -0.1, dur: 0.7, color: GOLD, alpha: 0.14 });
        }
        break;
      }
      case 'dissolve':
        ev.points.forEach((p, i) => {
          this.ghosts.push({ ...p, t: -i * 0.015, dur: 0.32, peak: 0.45, silent: true });
          this.spawnMotes(p.x, p.y, p.wild ? '#FFF2D0' : COLORS[p.color].glow, this.reduced ? 1 : 3, 0, -i * 0.015);
        });
        break;
      case 'beam':
        this.fx.push({ kind: 'beam', x: ev.x, y: ev.y, angle: ev.angle, t: 0, dur: 0.7 });
        break;
      case 'blast':
        this.fx.push({ kind: 'blast', x: ev.x, y: ev.y, radius: ev.radius * D, t: 0, dur: 0.8, color: '#B266FF' });
        break;
      case 'splash':
        this.fx.push({ kind: 'splash', x: ev.x, y: ev.y, radius: ev.radius * D, t: 0, dur: 0.6, color: COLORS[ev.color].glow });
        break;
      case 'starLand':
        this.fx.push({ kind: 'ring', x: ev.x, y: ev.y, r0: D * 0.2, r1: D * 0.8, t: 0, dur: 0.5, color: '#FFE8A0', alpha: 0.35 });
        break;
      case 'collect':
        this.fx.push({ kind: 'ring', x: ev.x, y: ev.y, r0: D * 0.3, r1: D * 1.1, t: 0, dur: 0.6, color: GOLD, alpha: 0.35 });
        this.spawnMotes(ev.x, ev.y, GOLD, this.reduced ? 4 : 10, 0, 0);
        break;
      case 'iconExpire':
        this.fx.push({ kind: 'fadeIcon', x: ev.x, y: ev.y, ptype: ev.ptype, t: 0, dur: 0.5 });
        break;
      case 'recolor':
        this.spawnMotes(ev.x, ev.y, COLORS[ev.color].glow, this.reduced ? 2 : 5, 0, 0);
        break;
      case 'runeReward':
      case 'sealed':
        this.fx.push({ kind: 'ring', x: ev.x ?? 0, y: ev.y ?? 0, r0: D * 1.1, r1: D * 1.6, t: 0, dur: 1.2, color: GOLD, alpha: 0.25, follow: 'slinger' });
        break;
      default:
        break;
    }
  }

  spawnMotes(x, y, color, n, gold, delay) {
    const D = CONFIG.orbDiameterPx;
    for (let i = 0; i < n + gold; i++) {
      if (this.motes.length >= MAX_MOTES) this.motes.shift();
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * D * 0.35;
      this.motes.push({
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        vx: (Math.random() - 0.5) * 18,
        vy: -18 - Math.random() * 30,
        life: 0,
        max: 0.9 + Math.random() * 0.8,
        size: 1.5 + Math.random() * 2.2,
        color: i >= n ? GOLD : color,
        delay: delay - Math.random() * 0.12,
      });
    }
  }

  update(dt) {
    for (const g of this.ghosts) g.t += dt;
    this.ghosts = this.ghosts.filter((g) => g.t < g.dur);
    for (const m of this.motes) {
      if (m.delay < 0) {
        m.delay += dt;
        continue;
      }
      m.life += dt;
      m.x += m.vx * dt + Math.sin(m.life * 2 + m.size) * 6 * dt;
      m.y += m.vy * dt;
      m.vy *= 1 - dt * 0.6;
    }
    this.motes = this.motes.filter((m) => m.life < m.max);
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.dur);
  }

  /** Effects drawn beneath orbs (ground rings, splash, blast). */
  drawUnder(ctx, game) {
    for (const f of this.fx) {
      if (f.t < 0) continue;
      const u = f.t / f.dur;
      const env = fadeEnv(f.t, f.dur);
      if (f.kind === 'ring') {
        const x = f.follow === 'slinger' ? game.slinger.x : f.x;
        const y = f.follow === 'slinger' ? game.slinger.y : f.y;
        ctx.strokeStyle = f.color;
        ctx.globalAlpha = f.alpha * env * (this.reduced ? 0.5 : 1);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, f.r0 + (f.r1 - f.r0) * easeOut(u), 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.kind === 'blast') {
        const r = f.radius * (0.25 + 0.75 * easeOut(u));
        const g = ctx.createRadialGradient(f.x, f.y, r * 0.6, f.x, f.y, r);
        g.addColorStop(0, 'rgba(178,102,255,0)');
        g.addColorStop(0.85, 'rgba(178,102,255,0.14)');
        g.addColorStop(1, 'rgba(178,102,255,0)');
        ctx.globalAlpha = env * (this.reduced ? 0.5 : 1);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (f.kind === 'splash') {
        ctx.globalAlpha = env * 0.6;
        ctx.fillStyle = f.color;
        const r = f.radius * easeOut(u);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r, 3.5 * (1 - u) + 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Effects drawn over orbs (dissolving ghosts, motes, beams). */
  drawOver(ctx, t, drawIcon) {
    const D = CONFIG.orbDiameterPx;
    const art = this.art;
    // Attenuate peaks when many glows resolve together.
    const live = this.ghosts.filter((g) => g.t >= 0 && g.t < 0.3).length;
    const atten = (1 / Math.sqrt(Math.max(1, live / 3))) * (this.reduced ? 0.45 : 1);
    for (const g of this.ghosts) {
      if (g.t < 0) {
        // not yet dissolving: keep the orb visible
        art.drawOrb(ctx, g.x, g.y, D, g.color, g.wild, g.s * 2 || 0, 0, t);
        continue;
      }
      const u = g.t / g.dur;
      const scale = 1 + 0.06 * u;
      art.drawOrb(ctx, g.x, g.y, D * scale, g.color, g.wild, g.s * 2 || 0, 0, t, { alpha: Math.max(0, 1 - u * 1.15) });
      // glow ramps in over 90 ms and out over the rest
      const inA = Math.min(1, g.t / 0.09);
      const outA = Math.max(0, 1 - Math.max(0, g.t - 0.09) / (g.dur - 0.09));
      const glowA = g.peak * atten * inA * outA;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = glowA * 0.55;
      const glow = art.glowFor(g.color, g.wild);
      ctx.drawImage(glow, g.x - D * 0.75, g.y - D * 0.75, D * 1.5, D * 1.5);
      ctx.globalAlpha = glowA * 0.9;
      const glyph = art.glyphGlowFor(g.color, g.wild);
      ctx.drawImage(glyph, g.x - D * 0.45, g.y - D * 0.45, D * 0.9, D * 0.9);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      if (m.delay < 0) continue;
      const u = m.life / m.max;
      ctx.globalAlpha = Math.min(1, m.life / 0.1) * (1 - u) * 0.85;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size * (1 - u * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (const f of this.fx) {
      if (f.kind === 'beam') this.drawBeam(ctx, f);
      else if (f.kind === 'fadeIcon' && drawIcon) drawIcon(f.ptype, f.x, f.y, 1 - f.t / f.dur);
    }
  }

  drawBeam(ctx, f) {
    const D = CONFIG.orbDiameterPx;
    const env = fadeEnv(f.t, f.dur, 0.1);
    const len = 1600;
    const w0 = CONFIG.frostBaseWidth * D;
    const w1 = (CONFIG.frostBaseWidth + CONFIG.frostWidthGain * (len / D)) * D;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle);
    // Low-contrast icy band (never a bright full-width flash).
    const g = ctx.createLinearGradient(0, -w1 / 2, 0, w1 / 2);
    g.addColorStop(0, 'rgba(190,232,255,0)');
    g.addColorStop(0.5, 'rgba(190,232,255,0.16)');
    g.addColorStop(1, 'rgba(190,232,255,0)');
    ctx.globalAlpha = env * (this.reduced ? 0.5 : 1);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -w0 / 2);
    ctx.lineTo(len, -w1 / 2);
    ctx.lineTo(len, w1 / 2);
    ctx.lineTo(0, w0 / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(225,245,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

function easeOut(u) {
  return 1 - (1 - u) * (1 - u);
}

/** Soft envelope: ≥ 80 ms fade in and a long fade out. */
function fadeEnv(t, dur, fadeIn = 0.09) {
  const a = Math.min(1, t / fadeIn);
  const b = Math.max(0, Math.min(1, (dur - t) / Math.max(0.1, dur * 0.6)));
  return a * b;
}
