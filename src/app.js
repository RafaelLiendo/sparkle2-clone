// App shell: scenes, DOM overlays, input and the fixed-step loop.

import { Audio } from './audio.js';
import { CONFIG } from './config.js';
import { colorName, DIFFICULTIES, DIFFICULTY_BY_ID, ENCHANT_BY_ID, ENCHANT_GROUPS, ENCHANTMENTS, POWERUP_IDS, POWERUPS } from './defs.js';
import { fullscreenSupported, isFullscreen, isStandalone, onFullscreenChange, toggleFullscreen } from './fullscreen.js';
import { Game } from './game/game.js';
import { buildLevel, DAY_BY_ID, DAYS, EPILOGUE, powerupsForTier, PROLOGUE } from './levels.js';
import { dayNovelty, newlyOpenedDays } from './progress.js';
import { makeCanvasEl, paintBackground } from './render/background.js';
import { drawPowerupIcon } from './render/icons.js';
import { Renderer } from './render/renderer.js';
import {
  clearsToUnlock,
  enchantmentForClear,
  equip,
  equippedInGroup,
  isAvailable,
  isCompleted,
  keysCollected,
  loadSave,
  sanitizeLoadout,
  unlockedEnchantments,
  unseenEnchantments,
  writeSave,
} from './save.js';
import { TouchGestures } from './touchGestures.js';
import { enchantIcon } from './ui/enchantArt.js';
import { keyIcon, keyRing } from './ui/keyArt.js';
import { paintMap } from './ui/mapArt.js';
import { renderRotateHint } from './ui/rotateHint.js';
import { TutorialRun } from './ui/tutorial.js';

const W = CONFIG.canvasW;
const H = CONFIG.canvasH;
const STEP = 1 / CONFIG.simHz;
// title-ring angular speed (rad/s) per difficulty; spread wider than the gameplay
// multiplier so a difficulty change is obvious at a glance (~31 s, ~10 s, ~4.5 s per lap)
const TITLE_SPIN = { normal: 0.2, hard: 0.6, nightmare: 1.4 };

/** "Purple stones", "Purple and Black stones". */
const stonesPhrase = (ids) => `${ids.map(colorName).join(' and ')} stones`;

// touch devices get touch hints, larger buttons and the portrait pause
const COARSE = matchMedia('(pointer: coarse)');
const PORTRAIT_TOUCH = matchMedia('(orientation: portrait) and (pointer: coarse)');

// A recovered key starts settling into its key-ring slot this long (s) after the screen opens,
// on the World Map and on the win screen; it lands KEY_LAND s later, with a soft clack.
const KEY_SETTLE = { map: 1.3, win: 1.0 };
const KEY_LAND = 0.55;

const TICK = '<svg class="tick" viewBox="0 0 32 32" aria-hidden="true"><path d="M9 16.5l4.5 4.5L23 11" /></svg>';

/** "1 more day", "3 more days". */
const moreDays = (n) => `${n} more ${n === 1 ? 'day' : 'days'}`;

// The Slinger at the heart of the Enchantments menu, its four sockets around it.
const SLINGER_EMBLEM = `<svg class="slinger-emblem" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="54" fill="#1b1a17" stroke="#4d4636" stroke-width="3"/>
  <circle cx="60" cy="60" r="44" fill="none" stroke="#2e2b24" stroke-width="8"/>
  <path d="M36 44v14a24 24 0 0 0 48 0V44" fill="none" stroke="#b8bec6" stroke-width="7" stroke-linecap="round"/>
  <path d="M36 44v14a24 24 0 0 0 48 0V44" fill="none" stroke="#eef1f4" stroke-width="2" stroke-linecap="round" opacity=".6"/>
  <circle cx="60" cy="46" r="15" fill="#d4ab55"/><circle cx="55" cy="41" r="5" fill="#fff4cc" opacity=".8"/>
  <circle cx="60" cy="86" r="8" fill="#6f5a2e"/><circle cx="57.5" cy="83.5" r="2.6" fill="#d9c08a" opacity=".7"/>
</svg>`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class App {
  constructor({ stage, canvas, ui, fsButton, debug }) {
    this.stage = stage;
    this.fsButton = fsButton;
    this.canvas = canvas;
    this.ui = ui;
    this.debug = debug;
    this.save = loadSave();
    sanitizeLoadout(this.save);
    this.settings = this.save.options;
    this.audio = new Audio(this.settings);
    this.renderer = new Renderer(canvas, this.settings);
    this.ctx = canvas.getContext('2d');
    this.scene = 'title';
    this.game = null;
    this.day = null;
    this.paused = false;
    this.endTimer = 0;
    this.endShown = false;
    this.acc = 0;
    this.last = performance.now();
    this.time = 0;
    this.pointer = { x: W / 2, y: H / 2, type: 'mouse' };
    this.tutorial = null; // the How to Play run, while it plays
    this.gestures = new TouchGestures({
      aim: (x, y) => {
        this.pointer.x = x;
        this.pointer.y = y;
        if (!this.tutorial) this.game?.aimAt(x, y);
      },
      fire: () => (this.tutorial ? this.tutorial.input('fire', { x: this.pointer.x, y: this.pointer.y }) : this.game?.fire()),
      swap: () => (this.tutorial ? this.tutorial.input('swap') : this.game?.swap()),
      onSlinger: (x, y, r) => !!this.game && Math.hypot(x - this.game.slinger.x, y - this.game.slinger.y) < r,
    });
    this.staticLayer = null;
    this.staticKey = null;
    this.fps = 0;
    this.titlePhase = 0;
    this.titleSpin = null;
    this.titleGrow = null;
    this.celebration = null; // map reveal owed after a first clear, played when the map next shows

    this.applyReducedFlashing();
    this.fit();
    window.addEventListener('resize', () => this.fit());
    // iOS reports rotation and toolbar changes more reliably through visualViewport
    window.visualViewport?.addEventListener('resize', () => this.fit());
    onFullscreenChange(() => {
      this.fit();
      this.syncFullscreenButton();
      renderRotateHint();
    });
    renderRotateHint();
    this.initFullscreenButton();
    canvas.addEventListener('contextrestored', () => {
      this.staticKey = null;
    });
    this.bindInput();
    this.showTitle();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------------------
  // Layout

  fit() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const k = Math.min(vw / W, vh / H);
    this.stage.style.transform = `translate(${(vw - W * k) / 2}px, ${(vh - H * k) / 2}px) scale(${k})`;
    this.renderer.resize(W * k);
    this.staticKey = null;
  }

  toLogical(ev) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
  }

  persist() {
    writeSave(this.save);
  }

  applyReducedFlashing() {
    this.ui.classList.toggle('reduced-flashing', !!this.settings.reducedFlashing);
  }

  // ---------------------------------------------------------------------------
  // Input

  bindInput() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointermove', (e) => {
      const p = this.toLogical(e);
      this.pointer.type = e.pointerType;
      if (e.pointerType !== 'mouse') {
        if (this.playable()) this.gestures.move(e.pointerId, p.x, p.y);
        return;
      }
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      if (this.scene === 'level' && this.game && !this.tutorial) this.game.aimAt(p.x, p.y);
    });
    c.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (!this.playable()) return;
      const p = this.toLogical(e);
      this.pointer.type = e.pointerType;
      if (e.pointerType === 'mouse' && this.tutorial) {
        this.tutorial.input(e.button === 0 ? 'fire' : e.button === 2 ? 'swap' : 'other', p);
        return;
      }
      if (e.pointerType === 'mouse') {
        if (e.button === 0) {
          this.game.aimAt(p.x, p.y);
          this.game.fire();
        } else if (e.button === 2) {
          this.game.swap();
        }
        return;
      }
      // touch / pen: see TouchGestures (hold aims, release fires, two fingers or the Slinger swap)
      c.setPointerCapture?.(e.pointerId);
      this.gestures.down(e.pointerId, p.x, p.y);
    });
    c.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') return;
      if (!this.playable()) {
        this.gestures.reset();
        return;
      }
      const p = this.toLogical(e);
      this.gestures.up(e.pointerId, p.x, p.y);
    });
    c.addEventListener('pointercancel', (e) => this.gestures.cancel(e.pointerId));
    c.addEventListener(
      'wheel',
      (e) => {
        if (this.scene === 'level' && this.game && !this.paused) {
          e.preventDefault();
          if (!this.tutorial) this.game.swap();
        }
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('blur', () => this.autoPause());
    document.addEventListener('visibilitychange', () => document.hidden && this.autoPause());
    // turning a phone upright hides the stage behind the rotate hint, so the day waits
    PORTRAIT_TOUCH.addEventListener('change', (e) => e.matches && this.autoPause());
  }

  /** A level is running and accepts shots. */
  playable() {
    return this.scene === 'level' && !!this.game && !this.paused;
  }

  // ---------------------------------------------------------------------------
  // Fullscreen

  initFullscreenButton() {
    const b = this.fsButton;
    if (!b) return;
    b.hidden = !fullscreenSupported();
    b.addEventListener('click', () => {
      this.audio.unlock();
      toggleFullscreen();
    });
    this.syncFullscreenButton();
  }

  syncFullscreenButton() {
    const b = this.fsButton;
    if (!b) return;
    const on = isFullscreen();
    b.classList.toggle('on', on);
    b.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
    b.title = on ? 'Exit full screen (F)' : 'Full screen (F)';
    this.ui.querySelectorAll('[data-act=fullscreen]').forEach((el) => (el.textContent = this.fullscreenLabel()));
  }

  fullscreenLabel() {
    return isFullscreen() ? 'Exit full screen' : 'Full screen';
  }

  onKey(e) {
    if (e.code === 'KeyF' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && fullscreenSupported()) {
      e.preventDefault();
      toggleFullscreen();
      return;
    }
    if (this.scene !== 'level' || !this.game) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      if (this.paused) this.resume();
      else if (this.game.state === 'playing') this.pauseGame();
      return;
    }
    if (this.paused || this.tutorial) return;
    if (e.code === 'Space' || e.code === 'KeyS') {
      e.preventDefault();
      this.game.swap();
    }
    if (this.debug) this.debugKey(e);
  }

  debugKey(e) {
    const g = this.game;
    const keys = '1234567890qwert';
    const i = keys.indexOf(e.key);
    if (i >= 0 && i < POWERUP_IDS.length) g.spawnIcon(this.pointer.x, this.pointer.y, POWERUP_IDS[i]);
    else if (e.key === 'y') g.addRune(g.runeTarget);
    else if (e.key === 'u') g.spawnIcon(this.pointer.x, this.pointer.y);
  }

  autoPause() {
    if (this.scene === 'level' && this.game && this.game.state === 'playing' && !this.paused) this.pauseGame();
  }

  // ---------------------------------------------------------------------------
  // Loop

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;

    if (this.scene === 'level' && this.game) {
      const tut = this.tutorial;
      if (!this.paused) {
        if (tut) {
          tut.advance(dt);
        } else {
          this.acc += dt;
          let steps = 0;
          while (this.acc >= STEP && steps < 24) {
            this.game.update(STEP);
            this.acc -= STEP;
            steps++;
          }
          if (steps >= 24) this.acc = 0;
        }
        const events = this.game.drainEvents();
        this.renderer.handleEvents(events);
        this.audio.handle(events);
        this.notePowerupsSeen(events);
        tut?.handleEvents(events);
        this.renderer.update(dt);
        if (!tut) this.checkEnd(dt);
      }
      const showGuide = tut ? tut.showGuide : this.pointer.type === 'mouse' || this.gestures.holding;
      this.renderer.draw(this.game, this.time, { showGuide: showGuide && !this.paused });
      tut?.drawOverlay(this.ctx, this.paused ? 0 : dt);
      if (this.debug) this.drawDebug();
    } else {
      this.drawStatic(dt);
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  drawStatic(dt) {
    const key = `${this.scene}:${this.canvas.width}:${this.save.completed.length}`;
    if (this.staticKey !== key) {
      const layer = makeCanvasEl(this.canvas.width, this.canvas.height);
      const g = layer.getContext('2d');
      const k = this.canvas.width / W;
      g.setTransform(k, 0, 0, k, 0, 0);
      if (this.scene === 'map') paintMap(g, this.save);
      else paintBackground(g, 'title-marsh');
      this.staticLayer = layer;
      this.staticKey = key;
    }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(this.staticLayer, 0, 0);
    if (this.scene === 'title') this.drawTitleOrnament(dt);
  }

  drawTitleOrnament(dt) {
    const ctx = this.ctx;
    const k = this.canvas.width / W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const t = this.time;
    const cx = W / 2;
    const cy = 250;
    // a slow ring of stone orbs circling the title, spinning faster and widening by one
    // marble per step on harder difficulties; spin and size ease toward their targets so
    // switching difficulty never jumps the ring
    const ease = Math.min(1, dt * 3);
    const target = TITLE_SPIN[this.settings.difficulty] ?? TITLE_SPIN.normal;
    this.titleSpin ??= target;
    this.titleSpin += (target - this.titleSpin) * ease;
    this.titlePhase += this.titleSpin * dt;
    const step = Math.max(0, DIFFICULTIES.findIndex((d) => d.id === this.settings.difficulty));
    const growTarget = step * CONFIG.orbDiameterPx;
    this.titleGrow ??= growTarget;
    this.titleGrow += (growTarget - this.titleGrow) * ease;
    const rx = 200 + this.titleGrow;
    const ry = (120 / 250) * rx; // keep the ring's tilt as it widens
    const art = this.renderer.art;
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.titlePhase;
      const x = cx + Math.cos(a) * rx;
      const y = cy + Math.sin(a) * ry;
      const depth = (Math.sin(a) + 1) / 2;
      const d = 34 + depth * 22;
      art.drawShadow(ctx, x, y, d, 0.6);
      art.drawOrb(ctx, x, y, d, i % 6, false, a * 4, a + Math.PI / 2, t, { dark: 0.45 * (1 - depth) });
    }
  }

  drawDebug() {
    const ctx = this.ctx;
    ctx.setTransform(this.renderer.scale, 0, 0, this.renderer.scale, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(8, H - 58, 330, 50);
    ctx.fillStyle = '#e8dcc0';
    ctx.font = '12px monospace';
    const g = this.game;
    ctx.fillText(`fps ${this.fps.toFixed(0)}  orbs ${g.orbCount()}  combo ${g.combo}  rune ${g.runeProgress}/${g.runeTarget}`, 14, H - 40);
    ctx.fillText(`state ${g.state}  pend ${g.pending.length}  buf ${g.slinger.buffer}  grace ${g.tracks.map((t) => t.graceT.toFixed(1)).join('/')}`, 14, H - 22);
  }

  /** A power-up counts as known once collected; its icons stop carrying a name caption. */
  notePowerupsSeen(events) {
    const unseen = this.renderer.unseenPowerups;
    for (const ev of events) {
      if (ev.type !== 'collect' || !unseen.has(ev.ptype)) continue;
      unseen.delete(ev.ptype);
      this.save.seenPowerups.push(ev.ptype);
      this.persist();
    }
  }

  checkEnd(dt) {
    const g = this.game;
    if (this.endShown || (g.state !== 'won' && g.state !== 'lost')) return;
    this.endTimer += dt;
    if (this.endTimer < (g.state === 'won' ? 1.6 : 0.8)) return;
    this.endShown = true;
    if (g.state === 'won') this.onWin();
    else this.showFail();
  }

  // ---------------------------------------------------------------------------
  // Scenes

  setUI(html) {
    this.ui.innerHTML = html;
    this.stage.dataset.scene = this.scene;
    this.gestures.reset();
  }

  bindClicks(map) {
    for (const [sel, fn] of Object.entries(map)) {
      this.ui.querySelectorAll(sel).forEach((el) =>
        el.addEventListener('click', (e) => {
          this.audio.unlock();
          this.audio.ui();
          fn(e, el);
        }),
      );
    }
  }

  /** A small canvas that `paintSwatches` fills with a stone of palette colour `id`. */
  orbSwatch(id, size = 36) {
    return `<canvas class="swatch" data-orb="${id}" data-size="${size}" aria-hidden="true"></canvas>`;
  }

  /** A small canvas that `paintSwatches` fills with a power-up icon. */
  powerupSwatch(type, size = 44) {
    return `<canvas class="swatch" data-pup="${type}" data-size="${size}" aria-hidden="true"></canvas>`;
  }

  /** Paint every swatch canvas under `root` at the stage's current resolution. */
  paintSwatches(root) {
    const k = this.renderer.scale;
    root.querySelectorAll('canvas.swatch').forEach((c) => {
      const size = Number(c.dataset.size);
      c.style.width = c.style.height = `${size}px`;
      c.width = c.height = Math.round(size * k);
      const ctx = c.getContext('2d');
      ctx.setTransform(k, 0, 0, k, 0, 0);
      const m = size / 2;
      if (c.dataset.orb != null) {
        const d = size * 0.74;
        this.renderer.art.drawShadow(ctx, m, m, d, 0.6);
        this.renderer.art.drawOrb(ctx, m, m, d, Number(c.dataset.orb), false, 0.9, -Math.PI / 2, 0);
      } else {
        drawPowerupIcon(ctx, c.dataset.pup, m, m, size * 0.3, 0, 1, null, this.settings.reducedFlashing);
      }
    });
  }

  /** Class for Enchantments buttons: a gold dot while an unlocked enchantment is unseen. */
  enchantBtnClass() {
    return unseenEnchantments(this.save).length ? ' has-new' : '';
  }

  /** Normal / Hard / Nightmare selector; wire its buttons to `pickDifficulty`. */
  difficultyPicker() {
    const cur = this.settings.difficulty;
    const btns = DIFFICULTIES.map(
      (d) => `<button class="seg-btn" data-diff="${d.id}" role="radio" aria-checked="${d.id === cur}">${esc(d.name)}</button>`,
    ).join('');
    return `<div class="difficulty"><span class="lbl">Difficulty</span><div class="seg" role="radiogroup" aria-label="Difficulty">${btns}</div></div>`;
  }

  pickDifficulty(btn) {
    this.settings.difficulty = btn.dataset.diff;
    this.persist();
    btn.parentElement.querySelectorAll('[data-diff]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
  }

  /** Day name plus the difficulty the running game was started on. */
  dayLabel() {
    if (this.tutorial) return 'How to Play';
    const diff = DIFFICULTY_BY_ID[this.game?.difficulty];
    return diff ? `${this.day.name} · ${diff.name}` : this.day.name;
  }

  showTitle() {
    this.scene = 'title';
    this.game = null;
    this.tutorial = null;
    const started = this.save.completed.length > 0;
    this.setUI(`
      <div class="screen title-screen">
        <div class="title-block">
          <h1>Sparkle 2 Clone</h1>
          <p class="subtitle">The Five Keys</p>
        </div>
        <nav class="menu">
          <button class="btn primary" data-act="story">${started ? 'Continue the Story' : 'Begin the Story'}</button>
          <button class="btn${this.enchantBtnClass()}" data-act="enchant">Enchantments</button>
          <button class="btn" data-act="options">Options</button>
        </nav>
        ${this.difficultyPicker()}
        <div class="title-help">
          <button class="btn small" data-act="howto">How to Play</button>
          <p class="hint">${this.controlsHint()}</p>
        </div>
      </div>`);
    this.bindClicks({
      '[data-act=story]': () => (this.save.seenTutorial ? this.showMap() : this.startTutorial()),
      '[data-act=howto]': () => this.startTutorial(),
      '[data-act=enchant]': () => this.showEnchantments(() => this.showTitle()),
      '[data-act=options]': () => this.showOptions(() => this.showTitle()),
      '[data-diff]': (e, el) => this.pickDifficulty(el),
    });
  }

  controlsHint() {
    if (!COARSE.matches) return 'Aim with the mouse · click to fire · right-click, wheel or Space to swap';
    const hint = 'Hold to aim · lift to fire · tap with two fingers or tap the Slinger to swap';
    // iPhone Safari cannot go full screen from a page; an installed web app can
    return fullscreenSupported() || isStandalone() ? hint : `${hint}<br>Add to Home Screen to play full screen`;
  }

  /**
   * A wax seal. Its colour is the day's state (`done` / `open` / `locked`); a key day carries
   * its key, pressed into the wax until recovered and gold after, and a cleared day a tick.
   */
  seal(state, key = null) {
    let inner = '';
    if (key) {
      inner = keyIcon(key, { state: 'embossed' });
      if (state === 'done') inner += keyIcon(key, { cls: 'over' });
    } else if (state === 'done') {
      inner = TICK;
    }
    return `<span class="seal ${state}${key ? ' key' : ''}" aria-hidden="true">${inner}</span>`;
  }

  /** Hand over the owed map reveal, if any (it plays once). */
  takeCelebration() {
    const c = this.celebration;
    this.celebration = null;
    return c;
  }

  /**
   * @param celebrate { done, opened, key } from a first clear: the cleared seal turns,
   *   newly reachable days unveil in turn and a recovered key settles into its slot
   */
  showMap(celebrate = null) {
    this.scene = 'map';
    this.game = null;
    this.tutorial = null;
    const nodes = DAYS.map((d) => {
      const done = isCompleted(this.save, d.id);
      const open = isAvailable(this.save, d);
      const state = done ? 'done' : open ? 'open' : 'locked';
      let cls = state;
      let style = `left:${d.map.x}px;top:${d.map.y}px`;
      const opened = celebrate?.opened.indexOf(d.id) ?? -1;
      if (celebrate?.done === d.id) cls += ' just-done';
      if (opened >= 0) {
        cls += ' just-opened';
        style += `;--delay:${(0.9 + opened * 0.35).toFixed(2)}s`;
      }
      const keyNote = d.key ? (done ? ', key recovered' : ', holds a key') : '';
      return `<button class="map-node ${cls}${d.key ? ' key' : ''}" style="${style}"
        data-day="${d.id}" ${open ? '' : 'disabled'} aria-label="${esc(d.name)}${done ? ' (complete)' : open ? '' : ' (locked)'}${keyNote}">
        ${this.seal(state, d.key)}<span class="label">${esc(d.name)}</span></button>`;
    }).join('');
    const legend = `<div class="map-legend" role="note" aria-label="Legend">
        <h3>Legend</h3>
        <ul>
          <li>${this.seal('done')}<span>Cleared</span></li>
          <li>${this.seal('open')}<span>Ready to play</span></li>
          <li>${this.seal('locked')}<span>Locked</span></li>
          <li>${this.seal('open', DAYS.find((d) => d.key).key)}<span>Holds a key</span></li>
        </ul>
      </div>`;
    this.setUI(`
      <div class="screen map-screen">
        ${nodes}
        ${legend}
        <div class="key-plaque">${keyRing(keysCollected(this.save), { justGot: celebrate?.key, settle: KEY_SETTLE.map })}</div>
        <div class="map-bar">
          <button class="btn small" data-act="back">Title</button>
          <button class="btn small${this.enchantBtnClass()}" data-act="enchant">Enchantments</button>
          <button class="btn small" data-act="howto">How to Play</button>
          <button class="btn small" data-act="options">Options</button>
        </div>
      </div>`);
    if (celebrate) {
      this.audio.mapReveal();
      if (celebrate.key) this.audio.keySettle(KEY_SETTLE.map + KEY_LAND);
    }
    this.bindClicks({
      '[data-act=back]': () => this.showTitle(),
      '[data-act=enchant]': () => this.showEnchantments(() => this.showMap()),
      '[data-act=options]': () => this.showOptions(() => this.showMap()),
      '[data-act=howto]': () => this.startTutorial(),
      '[data-day]': (e, el) => this.showDayIntro(el.dataset.day),
    });
    if (!this.save.seenPrologue) {
      this.modal(`<h2>Prologue</h2><p class="story">${esc(PROLOGUE)}</p>
        <div class="row"><button class="btn primary" data-act="ok">Take up the Slinger</button></div>`, {
        '[data-act=ok]': () => {
          this.save.seenPrologue = true;
          this.persist();
          this.closeModal();
        },
      });
    }
  }

  modal(inner, handlers) {
    this.closeModal();
    const el = document.createElement('div');
    el.className = 'modal-wrap';
    el.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${inner}</div>`;
    this.ui.appendChild(el);
    for (const [sel, fn] of Object.entries(handlers)) {
      el.querySelectorAll(sel).forEach((b) =>
        b.addEventListener('click', (e) => {
          this.audio.unlock();
          this.audio.ui();
          fn(e, b);
        }),
      );
    }
    const first = el.querySelector('button.primary') || el.querySelector('button');
    first?.focus();
    return el;
  }

  closeModal() {
    this.ui.querySelectorAll('.modal-wrap').forEach((m) => m.remove());
  }

  /** What a day holds: its stones (new ones marked) and any power-ups it adds to the drops. */
  dayPreview(d) {
    const { newColors, newPowerups } = dayNovelty(d);
    const stones = d.colors
      .map((c) => {
        const isNew = newColors.includes(c);
        return `<span class="stone${isNew ? ' new' : ''}" title="${esc(colorName(c))}">${this.orbSwatch(c)}${isNew ? '<em>New</em>' : ''}</span>`;
      })
      .join('');
    const warn = newColors.length ? `<p class="novelty">${esc(stonesPhrase(newColors))} join the line — a harder day.</p>` : '';
    const pups = newPowerups.length
      ? `<div class="new-pups"><span class="lbl">New power-ups may drop</span><ul>${newPowerups
          .map((t) => `<li>${this.powerupSwatch(t)}<span><b>${esc(POWERUPS[t].name)}</b>${esc(POWERUPS[t].text)}</span></li>`)
          .join('')}</ul></div>`
      : '';
    return `<div class="preview"><div class="stones" aria-label="Stones: ${esc(d.colors.map(colorName).join(', '))}"><span class="lbl">Stones</span>${stones}</div>${warn}${pups}</div>`;
  }

  /** A key day's medallion: the key as an outline until recovered, then gold with a tick. */
  keyMedal(d, done) {
    const label = done ? `${d.key} recovered` : 'This day holds a key';
    return `<span class="key-medal${done ? ' have' : ''}" role="img" title="${esc(label)}" aria-label="${esc(label)}">
      ${keyIcon(d.key, { state: done ? 'have' : 'empty', size: 50 })}${done ? `<span class="medal-tick">${TICK}</span>` : ''}</span>`;
  }

  /** The enchantment a day's first clear unlocks, apart from its key. */
  unlockCard(ench, done) {
    return `<div class="unlock-card${done ? ' earned' : ''}">
      ${enchantIcon(ench.id, { size: 52 })}
      <span class="unlock-body">
        <span class="reveal-lbl">${done ? `Unlocked${TICK}` : 'Clear the day to unlock'}</span>
        <b>${esc(ench.name)}</b><span class="unlock-text">${esc(ench.text)}</span>
      </span></div>`;
  }

  showDayIntro(id) {
    const d = DAY_BY_ID[id];
    const done = isCompleted(this.save, id);
    const unlocked = unlockedEnchantments(this.save);
    const ench = enchantmentForClear(this.save, id);
    const el = this.modal(
      `${d.key ? this.keyMedal(d, done) : ''}
      <h2>${esc(d.name)}</h2>
      <p class="story">${esc(d.intro)}</p>
      ${this.dayPreview(d)}
      ${ench ? this.unlockCard(ench, done) : ''}
      <div class="row">
        <button class="btn" data-act="cancel">Back</button>
        ${unlocked.length ? `<button class="btn${this.enchantBtnClass()}" data-act="enchant">Enchantments</button>` : ''}
        <button class="btn primary" data-act="go">Begin the day</button>
      </div>`,
      {
        '[data-act=cancel]': () => this.closeModal(),
        '[data-act=enchant]': () => this.showEnchantments(() => this.showDayIntro(id)),
        '[data-act=go]': () => this.startDay(id),
      },
    );
    el.querySelector('.modal').classList.add('intro');
    this.paintSwatches(el);
  }

  /**
   * The Enchantments menu, in two steps: the Slinger with one socket per group, then a
   * group's picker. Enchantments not looked at before carry a "New" tag until the menu
   * closes; `highlight` opens straight on that enchantment's picker (the one just unlocked).
   * Nothing is auto-equipped.
   */
  showEnchantments(onDone, { highlight } = {}) {
    const unlocked = new Set(unlockedEnchantments(this.save));
    const fresh = new Set(unseenEnchantments(this.save));
    const NEW = '<span class="new-tag">New</span>';
    const el = this.modal('', {});
    const box = el.querySelector('.modal');
    box.classList.add('enchant');
    const members = (g) => ENCHANTMENTS.filter((e) => e.group === g);
    const on = (sel, fn) =>
      box.querySelectorAll(sel).forEach((b) =>
        b.addEventListener('click', () => {
          this.audio.unlock();
          this.audio.ui();
          fn(b);
        }),
      );

    const overview = (focusGroup = null) => {
      const sockets = ENCHANT_GROUPS.map((grp, g) => {
        const list = members(g);
        const open = list.some((e) => unlocked.has(e.id));
        const cur = equippedInGroup(this.save, g);
        const isNew = list.some((e) => fresh.has(e.id));
        const name = !open
          ? `Opens after ${moreDays(clearsToUnlock(this.save, list[0].id))}`
          : cur
            ? ENCHANT_BY_ID[cur].name
            : 'Empty';
        const icon = enchantIcon(open ? cur || 'none' : 'none', { size: 76, state: open ? 'on' : 'locked' });
        return `<button class="socket s${g}${open ? '' : ' locked'}${isNew ? ' new' : ''}" data-group="${g}" ${open ? '' : 'disabled'}
          aria-label="${esc(`${grp.name} socket: ${name}`)}">${icon}<span class="socket-body">
          <span class="socket-group">${esc(grp.name)}${isNew ? NEW : ''}</span><span class="socket-name">${esc(name)}</span></span></button>`;
      }).join('');
      const waiting = ENCHANT_GROUPS.findIndex((grp, g) => members(g).some((e) => fresh.has(e.id)) && !equippedInGroup(this.save, g));
      const hint =
        waiting < 0
          ? 'One enchantment in each socket. Choose a socket to change it.'
          : `New enchantment ready for the ${ENCHANT_GROUPS[waiting].name} socket.`;
      box.innerHTML = `<h2>Enchant the Slinger</h2>
        <p class="muted${waiting < 0 ? '' : ' ench-hint'}">${hint}</p>
        <div class="sockets">${sockets}${SLINGER_EMBLEM}</div>
        <div class="row"><button class="btn primary" data-act="done">Done</button></div>`;
      on('[data-group]', (b) => picker(Number(b.dataset.group)));
      on('[data-act=done]', () => {
        this.save.seenEnchantments = [...unlocked];
        this.persist();
        this.closeModal();
        onDone();
      });
      (box.querySelector(`[data-group="${focusGroup}"]`) || box.querySelector('[data-act=done]')).focus();
    };

    const picker = (g, sel = equippedInGroup(this.save, g) || 'none') => {
      const cur = equippedInGroup(this.save, g) || 'none';
      const isOpen = (id) => id === 'none' || unlocked.has(id);
      const medals = ['none', ...members(g).map((e) => e.id)].map((id) => {
        const name = id === 'none' ? 'None' : ENCHANT_BY_ID[id].name;
        return `<button class="medal${id === sel ? ' sel' : ''}" data-pick="${id}" aria-pressed="${id === sel}"
          aria-label="${esc(`${name}${isOpen(id) ? '' : ' (locked)'}${id === cur ? ' (equipped)' : ''}`)}">
          ${enchantIcon(id, { size: 86, state: isOpen(id) ? 'on' : 'locked' })}${fresh.has(id) ? NEW : ''}${
            id === cur && id !== 'none' ? `<span class="medal-on" title="Equipped">${TICK}</span>` : ''
          }</button>`;
      }).join('');
      let name = 'None';
      let text = 'Leave this socket empty.';
      if (sel !== 'none') {
        name = ENCHANT_BY_ID[sel].name;
        text = isOpen(sel) ? ENCHANT_BY_ID[sel].text : `Clear ${moreDays(clearsToUnlock(this.save, sel))} to unlock.`;
      }
      const label = sel === cur && sel !== 'none' ? 'Equipped' : 'Equip';
      box.innerHTML = `<h2>Select Enchantment</h2>
        <p class="muted">${esc(ENCHANT_GROUPS[g].name)} socket</p>
        <div class="medals">${medals}</div>
        <div class="ench-detail${isOpen(sel) ? '' : ' locked'}"><b>${esc(name)}</b><span>${esc(text)}</span></div>
        <div class="row"><button class="btn" data-act="back">Back</button>
          <button class="btn primary" data-act="equip" ${sel === cur || !isOpen(sel) ? 'disabled' : ''}>${label}</button></div>`;
      on('[data-pick]', (b) => picker(g, b.dataset.pick));
      on('[data-act=back]', () => overview(g));
      on('[data-act=equip]', () => {
        equip(this.save, g, sel === 'none' ? null : sel);
        this.persist();
        overview(g);
      });
      box.querySelector(`[data-pick="${sel}"]`)?.focus();
    };

    if (ENCHANT_BY_ID[highlight]) picker(ENCHANT_BY_ID[highlight].group, highlight);
    else overview();
  }

  showOptions(onDone) {
    const o = this.settings;
    const el = this.modal(
      `<h2>Options</h2>
      ${this.difficultyPicker()}
      <p class="muted">Applies from the next day you begin.</p>
      <label class="opt"><input type="checkbox" data-opt="reducedFlashing" ${o.reducedFlashing ? 'checked' : ''}>
        <span>Reduced Flashing <em>— softer glows, fewer rings and motes</em></span></label>
      <label class="opt"><input type="checkbox" data-opt="muted" ${o.muted ? 'checked' : ''}><span>Mute all sound</span></label>
      <label class="opt range"><span>Music</span><input type="range" min="0" max="1" step="0.05" data-opt="musicVolume" value="${o.musicVolume}"></label>
      <label class="opt range"><span>Effects</span><input type="range" min="0" max="1" step="0.05" data-opt="sfxVolume" value="${o.sfxVolume}"></label>
      <div class="danger-zone">
        <button class="btn small" data-act="reset">Erase story progress…</button>
      </div>
      <div class="row"><button class="btn primary" data-act="done">Done</button></div>`,
      {
        '[data-act=done]': () => {
          this.closeModal();
          onDone();
        },
        '[data-diff]': (e, b) => this.pickDifficulty(b),
        '[data-act=reset]': (e, b) => {
          if (b.dataset.armed) {
            this.save.completed = [];
            this.save.loadout = [];
            this.save.seenPrologue = false;
            this.save.seenTutorial = false;
            this.save.seenEnchantments = [];
            this.save.seenPowerups = [];
            this.persist();
            b.textContent = 'Progress erased';
            b.disabled = true;
            this.staticKey = null;
          } else {
            b.dataset.armed = '1';
            b.textContent = 'Click again to erase all progress';
          }
        },
      },
    );
    el.querySelectorAll('[data-opt]').forEach((inp) =>
      inp.addEventListener('input', () => {
        const k = inp.dataset.opt;
        o[k] = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
        this.audio.applyVolumes();
        this.applyReducedFlashing();
        this.persist();
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Level

  startDay(id) {
    const day = DAY_BY_ID[id];
    this.closeModal();
    this.tutorial = null;
    this.day = day;
    const level = buildLevel(day);
    this.game = new Game(level, {
      seed: (Math.random() * 2 ** 31) | 0,
      enchantments: this.save.loadout,
      powerups: powerupsForTier(day.tier),
      difficulty: this.settings.difficulty,
    });
    this.renderer.setGame(this.game);
    this.renderer.unseenPowerups = new Set(POWERUP_IDS.filter((t) => !this.save.seenPowerups.includes(t)));
    this.celebration = null;
    this.scene = 'level';
    this.paused = false;
    this.endTimer = 0;
    this.endShown = false;
    this.acc = 0;
    this.game.aimAt(this.pointer.x, this.pointer.y);
    // a day that brings new stones says so up front, before the line arrives (§7.6: no surprise spikes)
    const { newColors } = dayNovelty(day);
    const news = newColors.length
      ? `<div class="banner-news">${newColors.map((c) => this.orbSwatch(c, 30)).join('')}<span>New: ${esc(stonesPhrase(newColors))}</span></div>`
      : '';
    this.setUI(`
      <div class="screen level-screen">
        <button class="icon-btn pause-btn" data-act="pause" aria-label="Pause">❚❚</button>
        <div class="day-banner${news ? ' long' : ''}">${esc(this.dayLabel())}${news}</div>
      </div>`);
    this.paintSwatches(this.ui);
    this.bindClicks({ '[data-act=pause]': () => this.pauseGame() });
  }

  pauseGame() {
    if (!this.game || this.paused) return;
    this.paused = true;
    this.gestures.reset();
    this.game.pause();
    if (this.tutorial) {
      this.modal(
        `<h2>Paused</h2><p class="muted">How to Play</p>
        <div class="col">
          <button class="btn primary" data-act="resume">Resume</button>
          <button class="btn" data-act="skip">Skip the tutorial</button>
          <button class="btn" data-act="options">Options</button>
          ${fullscreenSupported() ? `<button class="btn" data-act="fullscreen">${this.fullscreenLabel()}</button>` : ''}
          <button class="btn" data-act="title">Back to the Title</button>
        </div>`,
        {
          '[data-act=resume]': () => this.resume(),
          '[data-act=skip]': () => this.finishTutorial(),
          '[data-act=options]': () => this.showOptions(() => this.pauseAgain()),
          '[data-act=fullscreen]': () => toggleFullscreen(),
          '[data-act=title]': () => this.showTitle(),
        },
      );
      return;
    }
    this.modal(
      `<h2>Paused</h2><p class="muted">${esc(this.dayLabel())}</p>
      <div class="col">
        <button class="btn primary" data-act="resume">Resume</button>
        <button class="btn" data-act="restart">Restart the day</button>
        <button class="btn" data-act="options">Options</button>
        ${fullscreenSupported() ? `<button class="btn" data-act="fullscreen">${this.fullscreenLabel()}</button>` : ''}
        <button class="btn" data-act="map">Retreat to the Map</button>
      </div>`,
      {
        '[data-act=resume]': () => this.resume(),
        '[data-act=fullscreen]': () => toggleFullscreen(),
        '[data-act=restart]': () => this.startDay(this.day.id),
        '[data-act=options]': () => this.showOptions(() => this.pauseAgain()),
        '[data-act=map]': () => this.showMap(),
      },
    );
  }

  /** How to Play: the scripted tutorial day. It always ends on the map. */
  startTutorial() {
    this.closeModal();
    this.tutorial = new TutorialRun(this, { onFinish: () => this.finishTutorial() });
    this.game = this.tutorial.game;
    this.day = null;
    this.renderer.setGame(this.game);
    this.renderer.unseenPowerups = new Set(POWERUP_IDS.filter((t) => !this.save.seenPowerups.includes(t)));
    this.celebration = null;
    this.scene = 'level';
    this.paused = false;
    this.endTimer = 0;
    this.endShown = false;
    this.acc = 0;
    this.setUI(`
      <div class="screen level-screen">
        <button class="icon-btn pause-btn" data-act="pause" aria-label="Pause">❚❚</button>
        <div class="tut-card" role="status" aria-live="polite"></div>
      </div>`);
    this.tutorial.render();
    this.bindClicks({ '[data-act=pause]': () => this.pauseGame() });
  }

  /** Finished or skipped: the tutorial counts as seen, and the map opens. */
  finishTutorial() {
    if (!this.save.seenTutorial) {
      this.save.seenTutorial = true;
      this.persist();
    }
    this.showMap();
  }

  pauseAgain() {
    this.paused = false;
    this.pauseGame();
  }

  resume() {
    this.closeModal();
    this.paused = false;
    this.last = performance.now();
  }

  onWin() {
    const d = this.day;
    const first = !isCompleted(this.save, d.id);
    if (first) {
      this.save.completed.push(d.id);
      this.persist();
      this.celebration = { done: d.id, opened: newlyOpenedDays(this.save, d.id), key: d.key };
    }
    const ench = first ? enchantmentForClear(this.save, d.id) : null;
    const gotKey = first && d.key;
    // the key turns into view, then settles into the key ring; the enchantment follows
    const keyHero = gotKey
      ? `<div class="key-hero" role="img" aria-label="You recovered the ${esc(d.key)}">
          <span class="key-halo"></span>${keyIcon(d.key, { size: 104 })}</div>
        ${keyRing(keysCollected(this.save), { justGot: d.key, settle: KEY_SETTLE.win, cls: 'win-ring' })}`
      : '';
    const enchAt = gotKey ? KEY_SETTLE.win + KEY_LAND + 0.25 : 0.35;
    const enchCard = ench
      ? `<div class="reveal"><div class="reveal-item ench-reveal" style="--delay:${enchAt}s">
          <span class="reveal-lbl">New enchantment · ${esc(ENCHANT_GROUPS[ench.group].name)}</span>${enchantIcon(ench.id, { size: 72 })}
          <span class="reveal-name">${esc(ench.name)}</span><span class="reveal-text">${esc(ench.text)}</span></div></div>`
      : '';
    const finale = d.id === DAYS[DAYS.length - 1].id;
    const buttons = ench
      ? `<button class="btn" data-act="again">Play again</button>
         <button class="btn" data-act="map">Continue</button>
         <button class="btn primary" data-act="enchant">Choose enchantments</button>`
      : `<button class="btn" data-act="again">Play again</button>
         <button class="btn primary" data-act="map">Continue</button>`;
    const el = this.modal(
      `<h2>The Circle is sealed</h2><p class="muted">${esc(this.dayLabel())}</p>
      ${keyHero}
      ${enchCard}
      ${finale ? `<p class="story">${esc(EPILOGUE)}</p>` : ''}
      <div class="row">${buttons}</div>`,
      {
        '[data-act=again]': () => this.startDay(d.id),
        '[data-act=map]': () => this.showMap(this.takeCelebration()),
        '[data-act=enchant]': () => {
          // the map waits underneath; its reveal plays once the menu is closed
          this.showMap();
          this.showEnchantments(() => this.showMap(this.takeCelebration()), { highlight: ench.id });
        },
      },
    );
    if (ench) el.querySelector('.modal').classList.add('roomy');
    // each reveal has its own cue
    if (gotKey) {
      this.audio.keyChime(0.35);
      this.audio.keySettle(KEY_SETTLE.win + KEY_LAND);
    }
    if (ench) this.audio.reward(enchAt);
  }

  showFail() {
    this.modal(
      `<h2>The Abyss has taken the line</h2><p class="muted">${esc(this.dayLabel())}</p>
      <div class="row"><button class="btn" data-act="map">Retreat to the Map</button>
      <button class="btn primary" data-act="again">Try again</button></div>`,
      {
        '[data-act=again]': () => this.startDay(this.day.id),
        '[data-act=map]': () => this.showMap(),
      },
    );
  }
}

