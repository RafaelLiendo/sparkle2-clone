// Synthesised audio (§7.4): dry ceramic clicks (pool balls / mahjong tiles), a quick
// descending click cluster on collapse, stone crack + crystalline shimmer on pops that
// steps up a scale with the combo. Ambient bed: soft pads, a sparse flute, wind.
// No bloops, boings, chimes or failure stings.

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.music = null;
    this.noise = null;
    this.musicStarted = false;
    this.lastClick = 0;
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx.connect(this.master);
    this.music.connect(this.master);
    this.applyVolumes();
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.startMusic();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.sfx.gain.value = s.muted ? 0 : s.sfxVolume;
    this.music.gain.value = s.muted ? 0 : s.musicVolume * 0.5;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // --- primitives --------------------------------------------------------------

  /** Dry ceramic click: sharp attack, short clean decay, slight pitch variation. */
  click(intensity = 0.5, pitch = 1, when = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const v = Math.min(1, Math.max(0.08, intensity));
    const p = pitch * (0.94 + Math.random() * 0.12);
    // noise transient
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = (2600 + v * 1800) * p;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + v * 0.015);
    src.connect(bp).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.06);
    // two inharmonic partials (ceramic body)
    for (const [f, a] of [
      [3150, 0.16],
      [4870, 0.08],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * p * (0.9 + v * 0.2);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(a * v, t + 0.001);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      o.connect(og).connect(this.sfx);
      o.start(t);
      o.stop(t + 0.06);
    }
  }

  /** Stone crack: low, dry noise burst. */
  crack(intensity = 0.6, when = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(400, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45 * intensity, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(lp).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + 0.15);
  }

  /** Short crystalline shimmer on a pentatonic step. */
  shimmer(step, gain = 0.07, when = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const semis = PENTA[Math.max(0, Math.min(PENTA.length - 1, step))];
    const f0 = 880 * Math.pow(2, semis / 12);
    for (const [mul, a, dec] of [
      [1, 1, 0.55],
      [2.01, 0.35, 0.35],
      [3.98, 0.12, 0.2],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f0 * mul;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.linearRampToValueAtTime(gain * a, t + 0.012);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(og).connect(this.sfx);
      o.start(t);
      o.stop(t + dec + 0.05);
    }
  }

  softTone(freq, dur, gain, type = 'sine', dest = this.sfx, when = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.2, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  whoosh(dur = 0.35, gain = 0.1, freq = 900) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(freq * 0.6, t);
    bp.frequency.exponentialRampToValueAtTime(freq * 1.6, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  // --- game events ---------------------------------------------------------------

  handle(events) {
    if (!this.ready) return;
    let pops = 0;
    for (const ev of events) {
      switch (ev.type) {
        case 'fire':
          this.whoosh(0.16, 0.035, 1400);
          break;
        case 'insert':
          this.click(0.45 + Math.min(0.5, (ev.speed || 27) / 60), 1);
          break;
        case 'snap': {
          // collapse: a quick descending cluster of clicks — the core payoff
          const v = Math.min(1, 0.35 + (ev.speed || 0) / 50);
          for (let i = 0; i < 3; i++) this.click(v * (1 - i * 0.2), 1.08 - i * 0.07, i * 0.028);
          break;
        }
        case 'pusherContact':
          this.click(0.2, 0.7);
          break;
        case 'pop': {
          const when = pops * 0.05;
          pops++;
          this.crack(Math.min(1, 0.45 + ev.points.length * 0.06), when);
          this.shimmer(Math.min(10, ev.combo || 0), 0.06, when + 0.01);
          break;
        }
        case 'dissolve':
          this.crack(0.3);
          break;
        case 'drop':
          this.shimmer(7, 0.035);
          this.shimmer(9, 0.03, 0.08);
          break;
        case 'collect':
          this.shimmer(5, 0.05);
          this.shimmer(8, 0.045, 0.07);
          this.shimmer(10, 0.04, 0.14);
          break;
        case 'swap':
          this.click(0.2, 1.3);
          break;
        case 'beam':
          this.whoosh(0.6, 0.12, 2400);
          break;
        case 'blast':
          this.crack(1);
          this.softTone(110, 0.8, 0.12, 'sine');
          break;
        case 'fireSpinner':
          this.whoosh(0.45, 0.1, 700);
          break;
        case 'butterflies':
          this.shimmer(4, 0.03);
          this.shimmer(6, 0.03, 0.12);
          break;
        case 'rune':
          this.softTone(523.25, 1.2, 0.04, 'triangle');
          break;
        case 'sealed':
          [0, 4, 7, 12].forEach((s, i) => this.softTone(261.63 * Math.pow(2, s / 12), 2.2, 0.04, 'triangle', this.sfx, i * 0.12));
          break;
        case 'drain':
          this.softTone(73.4, 3.5, 0.1, 'sine');
          break;
        case 'won':
          [0, 7, 12, 16].forEach((s, i) => this.softTone(293.66 * Math.pow(2, s / 12), 2.6, 0.035, 'triangle', this.sfx, i * 0.2));
          break;
        default:
          break;
      }
    }
  }

  ui() {
    this.click(0.25, 1.15);
  }

  // --- progress cues: soft and slow, in the family of the seal / win tones ------------

  /** New enchantment: a rising triangle arpeggio with a shimmer on top. */
  reward(when = 0) {
    [0, 4, 7, 11, 14].forEach((s, i) => this.softTone(392 * Math.pow(2, s / 12), 2.4, 0.032, 'triangle', this.sfx, when + i * 0.14));
    this.shimmer(8, 0.03, when + 0.7);
  }

  /** Recovered key: a low, bell-like fifth. */
  keyChime(when = 0) {
    this.softTone(146.83, 3.2, 0.06, 'sine', this.sfx, when);
    this.softTone(220, 3, 0.04, 'triangle', this.sfx, when + 0.22);
    this.shimmer(5, 0.025, when + 0.25);
  }

  /** World Map after a first clear: the route inks onward. */
  mapReveal() {
    this.softTone(329.63, 1.8, 0.03, 'triangle', this.sfx, 0.3);
    this.softTone(440, 2, 0.03, 'triangle', this.sfx, 0.55);
  }

  // --- ambient music bed -----------------------------------------------------------

  startMusic() {
    if (this.musicStarted || !this.ctx) return;
    this.musicStarted = true;
    const ctx = this.ctx;
    // Wind / nature bed: slowly swelling filtered noise.
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const wl = ctx.createBiquadFilter();
    wl.type = 'lowpass';
    wl.frequency.value = 420;
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.03;
    lfo.connect(lfoG).connect(wg.gain);
    wind.connect(wl).connect(wg).connect(this.music);
    wind.start();
    lfo.start();

    // Pad: slow chord changes (Am – F – C – G – Em – Am), soft detuned voices.
    const chords = [
      [57, 60, 64, 69],
      [53, 57, 60, 65],
      [48, 55, 60, 64],
      [55, 59, 62, 67],
      [52, 55, 59, 64],
      [57, 60, 64, 72],
    ];
    const padOut = ctx.createBiquadFilter();
    padOut.type = 'lowpass';
    padOut.frequency.value = 900;
    padOut.connect(this.music);
    let idx = 0;
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const playChord = () => {
      if (!this.ctx) return;
      const t = ctx.currentTime;
      const chord = chords[idx++ % chords.length];
      for (const n of chord) {
        for (const det of [-4, 4]) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = midi(n - 12);
          o.detune.value = det;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.018, t + 3);
          g.gain.linearRampToValueAtTime(0.014, t + 7);
          g.gain.linearRampToValueAtTime(0.0001, t + 10.5);
          o.connect(g).connect(padOut);
          o.start(t);
          o.stop(t + 11);
        }
      }
      // sparse flute-like melody (sine + gentle vibrato), sometimes silent
      if (Math.random() < 0.7) {
        const notes = Math.random() < 0.5 ? 2 : 3;
        for (let k = 0; k < notes; k++) {
          const n = chord[Math.floor(Math.random() * chord.length)] + 12;
          const when = 1.5 + k * (1.6 + Math.random() * 1.2);
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = midi(n);
          const vib = ctx.createOscillator();
          vib.frequency.value = 5;
          const vg = ctx.createGain();
          vg.gain.value = 3;
          vib.connect(vg).connect(o.frequency);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t + when);
          g.gain.linearRampToValueAtTime(0.022, t + when + 0.35);
          g.gain.linearRampToValueAtTime(0.0001, t + when + 2.2);
          o.connect(g).connect(this.music);
          o.start(t + when);
          vib.start(t + when);
          o.stop(t + when + 2.4);
          vib.stop(t + when + 2.4);
        }
      }
      setTimeout(playChord, 9000);
    };
    playChord();
  }
}
