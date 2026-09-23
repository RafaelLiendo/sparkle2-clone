// Level scene renderer. Reads game state; never mutates it.

import { CONFIG, RUNE_PIPS } from '../config.js';
import { COLORS } from '../defs.js';
import { makeAbyssLip, makeCanvasEl, paintBackground, paintPathGroove } from './background.js';
import { drawPowerupIcon, ICON_TINT } from './icons.js';
import { OrbArt } from './orbArt.js';
import { Vfx } from './vfx.js';

const W = CONFIG.canvasW;
const H = CONFIG.canvasH;

const AMMO_TINT = {
  firebolt: '#FFB347',
  purple: '#C77DFF',
  wild: '#F2E6D0',
  frost: '#BFE8FF',
  decay: '#A8C860',
  spark: '#FFF0C8',
};

const HUD_ICON = {
  slow: 'slow',
  backwards: 'backwards',
  retreat: 'backwards',
  butterflies: 'butterflies',
  fireflies: 'fireflies',
  wrathOfStars: 'wrathOfStars',
};

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.settings = settings;
    this.art = new OrbArt();
    this.vfx = new Vfx(this.art, settings);
    this.scale = 1;
    this.layers = null;
    this.layerKey = null;
    this.game = null;
  }

  /** Match the backing store to the displayed size (DPR-aware, capped at 2×). */
  resize(cssWidth) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.round(cssWidth * dpr);
    const bh = Math.round((bw * H) / W);
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
      this.layerKey = null;
    }
    this.scale = bw / W;
  }

  setGame(game) {
    this.game = game;
    this.vfx.clear();
    this.layerKey = null;
  }

  buildLayers(game) {
    const key = `${game.level.id}@${this.canvas.width}`;
    if (this.layerKey === key) return;
    const bw = this.canvas.width;
    const bh = this.canvas.height;
    const mk = () => {
      const c = makeCanvasEl(bw, bh);
      const g = c.getContext('2d');
      g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      return [c, g];
    };
    const [bg, bgc] = mk();
    paintBackground(bgc, game.level.theme);
    const grooves = game.paths.map((p) => {
      const [c, g] = mk();
      paintPathGroove(g, p);
      return c;
    });
    const lips = game.paths.map((p) => makeAbyssLip(p));
    this.layers = { bg, grooves, lips };
    this.layerKey = key;
  }

  handleEvents(events) {
    for (const ev of events) this.vfx.handle(ev);
  }

  update(dt) {
    this.vfx.update(dt);
  }

  // ---------------------------------------------------------------------------

  draw(game, t, view) {
    const ctx = this.ctx;
    this.buildLayers(game);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.layers.bg, 0, 0);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    this.vfx.drawUnder(ctx, game);

    game.tracks.forEach((track, i) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.layers.grooves[i], 0, 0);
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      this.drawAbyssDread(ctx, track, t);
      this.drawTrack(ctx, track, t);
    });

    this.drawIcons(ctx, game, t);
    this.drawSlinger(ctx, game, t);
    if (view.showGuide && game.state === 'playing') this.drawGuide(ctx, game, t);
    this.drawProjectiles(ctx, game, t);
    this.drawCritters(ctx, game, t);
    this.vfx.drawOver(ctx, t, (type, x, y, a) => drawPowerupIcon(ctx, type, x, y, CONFIG.runeIconRadius * CONFIG.orbDiameterPx, t, a * 0.8, null, this.settings.reducedFlashing));
    this.drawHud(ctx, game, t);
  }

  drawTrack(ctx, track, t) {
    const D = CONFIG.orbDiameterPx;
    const path = track.path;
    const art = this.art;
    const items = [];
    const pt = { x: 0, y: 0 };
    for (const orb of track.orbs) {
      const s = orb.s + orb.visOff;
      path.pointAt(s, pt);
      let x = pt.x;
      let y = pt.y;
      if (orb.fly) {
        const u = orb.fly.t;
        const e = 1 - (1 - u) * (1 - u);
        x = orb.fly.x + (x - orb.fly.x) * e;
        y = orb.fly.y + (y - orb.fly.y) * e;
      }
      if (x < -D || y < -D || x > W + D || y > H + D) continue;
      let size = D;
      let dark = 0;
      let alpha = 1;
      if (s > path.visibleEnd) {
        const depth = Math.min(1, (s - path.visibleEnd) / path.abyssRadius);
        size = D * (1 - 0.55 * depth);
        dark = 0.85 * depth;
        if (s > path.length) alpha = Math.max(0, 1 - (s - path.length) / 0.6);
      }
      if (alpha <= 0) continue;
      items.push({ orb, x, y, s, size, dark, alpha });
    }
    for (const it of items) if (!it.dark) art.drawShadow(ctx, it.x, it.y, it.size);
    for (const it of items) {
      art.drawOrb(ctx, it.x, it.y, it.size, it.orb.color, it.orb.wild, it.s * 2, path.angleAt(it.s), t, {
        dark: it.dark,
        alpha: it.alpha,
        flash: it.orb.flash,
      });
    }
    for (const p of track.pushers) this.drawPusher(ctx, path, p);
    const lip = this.layers.lips[track.index];
    ctx.drawImage(lip.canvas, path.end.x - lip.size / 2, path.end.y - lip.size / 2);
  }

  /** Dread, not panic: the maw darkens and a slow violet haze gathers while orbs sink. */
  drawAbyssDread(ctx, track, t) {
    const path = track.path;
    const k = Math.min(1, track.graceT / CONFIG.abyssGrace);
    if (k <= 0 && !track.anyInsideAbyss()) return;
    const R = path.abyssRadius * CONFIG.orbDiameterPx;
    const { x, y } = path.end;
    const pulse = 0.85 + 0.15 * Math.sin(t * 2.2);
    const g = ctx.createRadialGradient(x, y, R * 0.8, x, y, R * 2.2);
    g.addColorStop(0, `rgba(70,20,90,${0.35 * k * pulse})`);
    g.addColorStop(1, 'rgba(70,20,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, R * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPusher(ctx, path, p) {
    const D = CONFIG.orbDiameterPx;
    if (p.s < -1.5 || p.s > path.length) return;
    const pos = path.pointAt(p.s);
    const a = path.angleAt(p.s);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(4, 6, D * 0.42, D * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    const gold = ctx.createLinearGradient(0, -D * 0.4, 0, D * 0.4);
    gold.addColorStop(0, '#F6DC8C');
    gold.addColorStop(0.45, '#C8962E');
    gold.addColorStop(1, '#6E4A12');
    ctx.fillStyle = gold;
    ctx.strokeStyle = '#4a3008';
    ctx.lineWidth = 1.5;
    // forked hook: a hub with two curved prongs cradling the tail orb
    ctx.beginPath();
    ctx.moveTo(-D * 0.28, -D * 0.1);
    ctx.quadraticCurveTo(-D * 0.1, -D * 0.46, D * 0.34, -D * 0.4);
    ctx.quadraticCurveTo(D * 0.1, -D * 0.28, D * 0.02, -D * 0.1);
    ctx.lineTo(D * 0.02, D * 0.1);
    ctx.quadraticCurveTo(D * 0.1, D * 0.28, D * 0.34, D * 0.4);
    ctx.quadraticCurveTo(-D * 0.1, D * 0.46, -D * 0.28, D * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-D * 0.2, 0, D * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,200,0.6)';
    ctx.beginPath();
    ctx.arc(-D * 0.24, -D * 0.05, D * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawIcons(ctx, game, t) {
    const r = CONFIG.runeIconRadius * CONFIG.orbDiameterPx;
    const loaded = game.slinger.loaded;
    const wipeColor = loaded && loaded.kind === 'normal' ? loaded.color : loaded && loaded.kind === 'splash' ? loaded.color : null;
    for (const ic of game.icons) {
      const bob = Math.sin(ic.t * 2 + ic.phase) * 3;
      const fadeIn = Math.min(1, ic.t / 0.25);
      const fadeOut = Math.min(1, ic.ttl / 1.2);
      drawPowerupIcon(ctx, ic.type, ic.x, ic.y + bob, r, t, fadeIn * (0.35 + 0.65 * fadeOut), ic.type === 'colourWipe' ? { color: wipeColor } : null, this.settings.reducedFlashing);
    }
  }

  drawSlinger(ctx, game, t) {
    const s = game.slinger;
    const D = CONFIG.orbDiameterPx;
    const art = this.art;
    const empty = s.queue.length === 0;
    ctx.save();
    ctx.translate(s.x, s.y);
    // plinth
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(5, 8, 78, 0, Math.PI * 2);
    ctx.fill();
    const pg = ctx.createRadialGradient(-25, -30, 10, 0, 0, 78);
    pg.addColorStop(0, '#4d4a40');
    pg.addColorStop(1, '#1d1c17');
    ctx.fillStyle = pg;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      ctx.lineTo(Math.cos(a) * 76, Math.sin(a) * 76);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,140,100,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Rune Circle: 12 pips lit proportionally (§1.5)
    const lit = game.pipsLit();
    const dim = empty ? 0.4 : 1;
    ctx.strokeStyle = 'rgba(20,16,10,0.7)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, 0, 60, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < RUNE_PIPS; i++) {
      const a = -Math.PI / 2 + (i / RUNE_PIPS) * Math.PI * 2;
      const px = Math.cos(a) * 60;
      const py = Math.sin(a) * 60;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a + Math.PI / 2);
      const on = i < lit;
      if (on) {
        const glowA = (game.sealed ? 0.35 + 0.1 * Math.sin(t * 1.5) : 0.35) * dim * (this.settings.reducedFlashing ? 0.5 : 1);
        const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
        gg.addColorStop(0, `rgba(255,210,122,${glowA})`);
        gg.addColorStop(1, 'rgba(255,210,122,0)');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = on ? `rgba(255,214,130,${0.95 * dim})` : 'rgba(120,105,80,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(3.5, 0);
      ctx.lineTo(0, 5);
      ctx.lineTo(-3.5, 0);
      ctx.closePath();
      ctx.moveTo(0, -3);
      ctx.lineTo(0, 3);
      ctx.stroke();
      ctx.restore();
    }
    // cradle + queue rotate with aim; cosmetic recoil along the axis
    ctx.rotate(s.angle);
    ctx.translate(-s.kick * 7, 0);
    const sizes = [1, 0.66, 0.52, 0.42];
    const offsets = [10, -34, -62, -86];
    for (let i = s.queue.length - 1; i >= 1; i--) {
      const d = D * sizes[i];
      art.drawShadow(ctx, offsets[i], 0, d, 0.6);
      art.drawAmmo(ctx, s.queue[i], offsets[i], 0, d, t, 0, this.settings.reducedFlashing);
    }
    // cradle arms
    ctx.strokeStyle = '#8a6a2a';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(offsets[0], 0, D * 0.58, -2.4, -0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(offsets[0], 0, D * 0.58, 0.9, 2.4);
    ctx.stroke();
    ctx.strokeStyle = '#d4ab55';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(offsets[0], 0, D * 0.58, -2.4, -0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(offsets[0], 0, D * 0.58, 0.9, 2.4);
    ctx.stroke();
    if (s.queue[0]) {
      art.drawShadow(ctx, offsets[0], 0, D, 0.7);
      art.drawAmmo(ctx, s.queue[0], offsets[0], 0, D, t, 0, this.settings.reducedFlashing);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.arc(offsets[0], 0, D * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawGuide(ctx, game, t) {
    const g = game.aimGuide();
    const loaded = game.slinger.loaded;
    let tint = '#E8DCC0';
    if (loaded) {
      if (loaded.kind === 'normal' || loaded.kind === 'splash') tint = COLORS[loaded.color].glow;
      else tint = AMMO_TINT[loaded.kind] || tint;
    }
    const dx = g.x1 - g.x0;
    const dy = g.y1 - g.y0;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len;
    const uy = dy / len;
    const gap = 16;
    const off = (t * 18) % gap;
    ctx.fillStyle = tint;
    for (let d = off + 26; d < len; d += gap) {
      const fade = Math.min(1, (len - d) / 40 + 0.25);
      ctx.globalAlpha = 0.5 * fade;
      ctx.beginPath();
      ctx.arc(g.x0 + ux * d, g.y0 + uy * d, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = tint;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(g.x1, g.y1, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawProjectiles(ctx, game, t) {
    const D = CONFIG.orbDiameterPx;
    for (const p of game.projectiles) {
      const d = p.r * 2 * D;
      const ang = Math.atan2(p.dy, p.dx);
      if (p.kind === 'firebolt') {
        this.drawFireball(ctx, p.x, p.y, d, '#FFB347', ang);
        continue;
      }
      const ammo = { kind: p.kind, color: p.color };
      this.art.drawAmmo(ctx, ammo, p.x, p.y, d, t, ang, this.settings.reducedFlashing);
    }
    for (const p of game.pellets) {
      this.drawFireball(ctx, p.x, p.y, p.r * 2 * CONFIG.orbDiameterPx, p.kind === 'spark' ? '#FFF0C8' : '#FF9A40', Math.atan2(p.dy, p.dx));
    }
  }

  drawFireball(ctx, x, y, d, color, ang) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, d);
    g.addColorStop(0, 'rgba(255,250,230,0.9)');
    g.addColorStop(0.35, hexA(color, 0.7));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(-d * 0.3, 0, d * 1.3, d * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawCritters(ctx, game, t) {
    for (const e of game.registry.entries) {
      if (!e.actors) continue;
      for (const a of e.actors()) {
        if (a.kind === 'butterfly') this.drawButterfly(ctx, a);
        else if (a.kind === 'firefly') this.drawFirefly(ctx, a);
        else if (a.kind === 'star') this.drawStar(ctx, a);
      }
    }
  }

  drawButterfly(ctx, a) {
    const flap = Math.abs(Math.sin(a.t * 9));
    ctx.save();
    ctx.translate(a.x, a.y - 8 + Math.sin(a.t * 3) * 4);
    ctx.rotate(a.angle + Math.PI / 2);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
    g.addColorStop(0, 'rgba(156,203,255,0.3)');
    g.addColorStop(1, 'rgba(156,203,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(190,225,255,0.85)';
    ctx.save();
    ctx.scale(0.35 + 0.65 * flap, 1);
    ctx.beginPath();
    ctx.ellipse(-9, -5, 9, 7, -0.5, 0, Math.PI * 2);
    ctx.ellipse(9, -5, 9, 7, 0.5, 0, Math.PI * 2);
    ctx.ellipse(-6, 6, 6, 5, 0.4, 0, Math.PI * 2);
    ctx.ellipse(6, 6, 6, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#2a3440';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(0, 10);
    ctx.stroke();
    ctx.restore();
  }

  drawFirefly(ctx, a) {
    const pulse = 0.75 + 0.25 * Math.sin(a.t * 4);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, 16);
    g.addColorStop(0, `rgba(230,250,140,${0.8 * pulse})`);
    g.addColorStop(1, 'rgba(230,250,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawStar(ctx, a) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.angle);
    ctx.globalCompositeOperation = 'lighter';
    const tail = ctx.createLinearGradient(-70, 0, 0, 0);
    tail.addColorStop(0, 'rgba(255,232,160,0)');
    tail.addColorStop(1, 'rgba(255,232,160,0.55)');
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.moveTo(-70, 0);
    ctx.lineTo(0, -5);
    ctx.lineTo(0, 5);
    ctx.closePath();
    ctx.fill();
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
    g.addColorStop(0, 'rgba(255,250,230,0.95)');
    g.addColorStop(1, 'rgba(255,232,160,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Timed-effect HUD (reads the registry generically). No numbers, no countdowns. */
  drawHud(ctx, game, t) {
    const seen = new Set();
    const list = [];
    for (const e of game.registry.entries) {
      const icon = HUD_ICON[e.type];
      if (!icon || seen.has(e.type)) continue;
      seen.add(e.type);
      list.push({ icon, f: e.fraction ? e.fraction() : 1 });
    }
    let x = W - 40;
    for (const it of list) {
      drawPowerupIcon(ctx, it.icon, x, 40, 18, t, 0.45 + 0.55 * Math.min(1, it.f * 1.5), null, true);
      x -= 46;
    }
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export { ICON_TINT };
