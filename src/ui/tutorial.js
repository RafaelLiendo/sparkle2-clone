// How to Play: a short scripted day. The game rolls the line in and takes aim on its own,
// then stops at each lesson and waits for the one input it asks for (fire at the marked
// spot, swap, or continue); anything else is ignored. The script and the aims come from
// planTutorial(), so every shot lands where the lesson needs it.

import { CONFIG } from '../config.js';
import { applyBeat, newTutorialGame, planTutorial } from '../game/tutorialPlan.js';

const STEP = 1 / CONFIG.simHz;
const D = CONFIG.orbDiameterPx;
const COARSE = matchMedia('(pointer: coarse)');
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');
const SLOW_MO = 0.45;

const popOf = (color, combo) => (ev) => ev.type === 'pop' && ev.combo === combo && ev.points.every((p) => p.color === color);

/**
 * One lesson per beat. `prompt` is [mouse, touch]; while the action plays out, `react` pairs
 * a game event with the line the card shows once it happens.
 */
const LESSONS = {
  fire1: {
    title: 'Aim and fire',
    text: 'Orbs roll along the track toward the Abyss. Your Slinger has taken aim at the <b>green</b> orb.',
    prompt: ['Click the green orb to fire', 'Tap the green orb to fire'],
    react: [[(ev) => ev.type === 'insert', 'Two greens side by side. One more makes a match…']],
  },
  fire2: {
    title: 'Match three',
    text: 'Three or more orbs of one colour touching crumble away. Fire once more to complete the set.',
    prompt: ['Click the greens to fire', 'Tap the greens to fire'],
    react: [[popOf(2, 1), 'Matched! When the colours on either side of a gap match, it pulls itself closed.']],
  },
  swap: {
    title: 'Swap orbs',
    text: 'No greens left. The Slinger holds a <b>red</b> orb, with a <b>yellow</b> one waiting behind it. Yellow is the one you want.',
    prompt: ['Right-click to swap them', 'Tap the Slinger to swap them'],
    react: [[(ev) => ev.type === 'swap', 'Yellow is loaded now.']],
  },
  fire3: {
    title: 'Combos',
    text: 'Matches in a row build a combo, and every <b>third</b> one drops a power-up. Fire between the two yellows and watch what follows.',
    prompt: ['Click between the yellows', 'Tap between the yellows'],
    react: [
      [popOf(3, 2), 'The yellows match…'],
      [popOf(0, 3), '…and the reds roll together and match on their own. Three in a row!'],
    ],
  },
  collect: {
    title: 'Power-ups',
    text: 'Three in a row: a power-up! The recoil has opened a gap in the line. Shoot the power-up through it before it closes.',
    prompt: ['Click the power-up', 'Tap the power-up'],
    react: [[(ev) => ev.type === 'collect', '<b>Purple Fire</b> loaded: a flame that blasts every orb around the spot it lands.']],
  },
  blast: {
    title: 'Use them well',
    text: 'Power-ups are strong. Keep them for the moment they do the most good. Fire the Purple Flame into the middle of the line.',
    prompt: ['Click the middle of the line', 'Tap the middle of the line'],
    react: [[(ev) => ev.type === 'sealed', 'The Rune Circle is complete!']],
  },
  end: {
    title: 'The day is won',
    text: 'Every orb you destroy fills the <b>Rune Circle</b> around the Slinger. When the Circle is complete and the last orbs are gone, the day is won.',
    prompt: ['Click anywhere to continue', 'Tap anywhere to continue'],
    react: [],
  },
};

const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const angleLerp = (a, b, u) => a + (((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * u;

export class TutorialRun {
  /** @param app the App (renderer, audio, settings, ui) */
  constructor(app, { onFinish }) {
    this.app = app;
    this.onFinish = onFinish;
    const plan = planTutorial();
    this.beats = plan.beats;
    this.slow = plan.slow;
    this.game = newTutorialGame();
    this.step = 0;
    this.acc = 0;
    this.index = 0; // the next beat
    this.holding = false;
    this.clock = 0; // real seconds since the start
    this.holdAt = 0; // clock time the current hold began
    this.nudgeAt = -10; // clock time of the latest ignored input
    this.aimStart = null;
    this.last = null; // the lesson just completed
    this.reaction = ''; // the card's line while that lesson's action plays out
    this.callouts = [];
  }

  get beat() {
    return this.beats[this.index] || null;
  }

  /** The dotted guide shows while the Slinger takes aim and while a shot waits. */
  get showGuide() {
    const b = this.beat;
    return !!b && b.action === 'fire' && (this.holding || this.step >= b.aimFrom);
  }

  // ---------------------------------------------------------------------------
  // Stepping

  /** Run the fixed-step sim for `dt` real seconds, stopping at the next beat. */
  advance(dt) {
    this.clock += dt;
    if (this.holding) return;
    const scale = this.slow.some(([a, b]) => this.step >= a && this.step < b) ? SLOW_MO : 1;
    this.acc += dt * scale;
    let n = 0;
    while (!this.atBeat() && this.acc >= STEP && n < 24) {
      this.aimTick();
      this.game.update(STEP);
      this.step++;
      this.acc -= STEP;
      n++;
    }
    if (n >= 24) this.acc = 0;
    if (this.atBeat()) this.hold();
  }

  atBeat() {
    return !!this.beat && this.step === this.beat.pauseAt;
  }

  /** Ease the Slinger onto the beat's angle; only the angle at the shot counts, so this is cosmetic. */
  aimTick() {
    const b = this.beat;
    if (!b || b.angle == null || this.step < b.aimFrom) return;
    const s = this.game.slinger;
    this.aimStart ??= s.angle;
    const u = Math.min(1, (this.step + 1 - b.aimFrom) / Math.max(1, b.pauseAt - b.aimFrom));
    s.angle = angleLerp(this.aimStart, b.angle, easeInOut(u));
  }

  hold() {
    this.holding = true;
    this.holdAt = this.clock;
    this.acc = 0;
    const b = this.beat;
    if (b.angle != null) this.game.slinger.angle = b.angle;
    this.aimStart = null;
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Input

  /**
   * A player input: 'fire' (left click / tap release, with its logical point), 'swap'
   * (right click / tap on the Slinger / two-finger tap) or 'other'. Only the input the
   * current lesson asks for does anything.
   */
  input(kind, p) {
    if (!this.holding) return;
    const b = this.beat;
    let ok = b.action === 'continue';
    if (b.action === 'swap') ok = kind === 'swap';
    if (b.action === 'fire') {
      const reach = b.target.r + (COARSE.matches ? 60 : 35);
      ok = kind === 'fire' && !!p && Math.hypot(p.x - b.target.x, p.y - b.target.y) <= reach;
    }
    if (!ok) {
      this.nudgeAt = this.clock;
      return;
    }
    if (b.action === 'continue') {
      this.holding = false;
      this.onFinish();
      return;
    }
    this.holding = false;
    this.last = b;
    this.reaction = '';
    applyBeat(this.game, b);
    this.handleEvents(this.game.events.slice(), false); // a swap reports at once
    this.index++;
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Feedback

  /** The card reacts as the lesson's action plays out; calm labels count the combo up. */
  handleEvents(events, callouts = true) {
    const react = this.last && !this.holding ? LESSONS[this.last.id].react : [];
    let text = null;
    for (const ev of events) {
      if (callouts && ev.type === 'pop' && ev.combo > 0) this.callouts.push({ text: ev.combo === 1 ? 'Match' : `Combo ×${ev.combo}`, x: ev.x, y: ev.y - 50, t: 0 });
      for (const [when, line] of react) if (when(ev)) text = line;
    }
    if (text !== null && text !== this.reaction) {
      this.reaction = text;
      this.render();
    }
  }

  /** The lesson card (DOM): the prompt while waiting, a short reaction while the action plays. */
  render() {
    const el = this.app.ui.querySelector('.tut-card');
    if (!el) return;
    const touch = COARSE.matches ? 1 : 0;
    const total = this.beats.length;
    if (this.holding) {
      const L = LESSONS[this.beat.id];
      el.className = 'tut-card waiting';
      el.innerHTML = `<p class="tut-step">How to Play · ${this.index + 1} of ${total}</p>
        <h3>${L.title}</h3>
        <p class="tut-text">${L.text}</p>
        <p class="tut-prompt"><span class="tut-glyph ${touch ? 'touch' : 'mouse'}${this.beat.action === 'swap' && !touch ? ' right' : ''}" aria-hidden="true"></span>${L.prompt[touch]}</p>`;
      return;
    }
    const text = this.last ? this.reaction : 'Watch the line of orbs roll in…';
    el.className = `tut-card playing${text ? '' : ' empty'}`;
    el.innerHTML = `<p class="tut-step">How to Play</p><p class="tut-text">${text}</p>`;
  }

  // ---------------------------------------------------------------------------
  // Overlay (canvas, drawn over the scene)

  drawOverlay(ctx, dt) {
    const k = this.app.renderer.scale;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    this.drawCallouts(ctx, dt);
    if (!this.holding) return;
    const b = this.beat;
    const tgt = b.target;
    const t = this.clock - this.holdAt;
    const fade = Math.min(1, t / 0.35);
    const still = REDUCED_MOTION.matches;
    // dim the field, leaving a pool of light on what the lesson is about
    const r0 = tgt.r * 1.5;
    const g = ctx.createRadialGradient(tgt.x, tgt.y, r0, tgt.x, tgt.y, r0 + 190);
    g.addColorStop(0, 'rgba(6,5,3,0)');
    g.addColorStop(1, `rgba(6,5,3,${0.42 * fade})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);
    // pulsing ring; an ignored input makes it bump once
    const nudge = Math.max(0, 1 - (this.clock - this.nudgeAt) / 0.35);
    const pulse = still ? 0 : Math.sin(t * 3.2) * 3;
    ctx.save();
    ctx.globalAlpha = fade * (0.55 + (still ? 0.2 : 0.25 * Math.sin(t * 3.2)));
    ctx.strokeStyle = '#F2D58C';
    ctx.lineWidth = 2 + nudge * 1.5;
    ctx.beginPath();
    ctx.arc(tgt.x, tgt.y, tgt.r + 6 + pulse + nudge * 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (b.action !== 'continue') this.drawGhost(ctx, b, t, fade, still);
  }

  /** A ghost cursor (or fingertip) that shows the input: it glides to the target and clicks. */
  drawGhost(ctx, b, t, fade, still) {
    const tgt = b.target;
    const touch = COARSE.matches;
    const period = 2.4;
    const u = still ? 1 : (t % period) / period;
    const glide = easeInOut(Math.min(1, u / 0.45));
    const hx = b.action === 'swap' ? tgt.x + tgt.r * 0.35 : tgt.x;
    const hy = b.action === 'swap' ? tgt.y + tgt.r * 0.35 : tgt.y;
    const x = hx + (1 - glide) * 70;
    const y = hy + (1 - glide) * 80;
    const press = still ? 0 : Math.max(0, 1 - Math.abs(u - 0.55) / 0.08);
    const ripple = u - 0.55;
    ctx.save();
    ctx.globalAlpha = fade * (u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1);
    if (!still && ripple > 0 && ripple < 0.3) {
      ctx.strokeStyle = `rgba(242,213,140,${0.6 * (1 - ripple / 0.3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hy, 10 + ripple * 90, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (touch) {
      ctx.fillStyle = 'rgba(233,220,192,0.35)';
      ctx.strokeStyle = 'rgba(233,220,192,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 15 - press * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (b.action === 'swap') {
      drawMouse(ctx, x + 14, y + 14, press);
    } else {
      drawArrow(ctx, x, y, press);
    }
    ctx.restore();
  }

  drawCallouts(ctx, dt) {
    const alive = [];
    for (const c of this.callouts) {
      c.t += this.holding ? Math.max(dt * 3, 0) : dt; // a waiting lesson clears the stage
      if (c.t > 1.8) continue;
      alive.push(c);
      if (c.t < 0) continue;
      const a = Math.min(1, c.t / 0.25) * (c.t > 1.2 ? 1 - (c.t - 1.2) / 0.6 : 1);
      const rise = REDUCED_MOTION.matches ? 0 : c.t * 14;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = '600 22px Cinzel, Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(10,8,5,0.8)';
      ctx.strokeText(c.text, c.x, c.y - rise);
      ctx.fillStyle = '#F2D58C';
      ctx.fillText(c.text, c.x, c.y - rise);
      ctx.restore();
    }
    this.callouts = alive;
  }
}

/** Arrow pointer with its tip at (x, y). */
function drawArrow(ctx, x, y, press) {
  const s = 1 - press * 0.12;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 26);
  ctx.lineTo(7, 20);
  ctx.lineTo(12, 31);
  ctx.lineTo(17, 29);
  ctx.lineTo(12, 18);
  ctx.lineTo(21, 18);
  ctx.closePath();
  ctx.fillStyle = '#E9DCC0';
  ctx.strokeStyle = '#1A1610';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** A small mouse with its right button lit, centred on (x, y). */
function drawMouse(ctx, x, y, press) {
  const w = 26;
  const h = 38;
  ctx.save();
  ctx.translate(x - w / 2, y - h / 2);
  ctx.fillStyle = '#E9DCC0';
  ctx.strokeStyle = '#1A1610';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = press > 0 ? '#F2B84C' : '#D4AB55';
  ctx.beginPath();
  ctx.roundRect(w / 2 + 1, 2, w / 2 - 3, 14, [0, 10, 0, 0]);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, 16);
  ctx.moveTo(0, 16);
  ctx.lineTo(w, 16);
  ctx.stroke();
  ctx.restore();
}
