// The portrait "turn your device sideways" screen. Until the game is full screen (or
// installed), it first offers full screen the way this device allows it: a button where
// the Fullscreen API exists (Android turns to landscape by itself), and Add to Home Screen
// on iPhone, whose Safari can't make a page full screen.

import { fullscreenSupported, isFullscreen, isStandalone, toggleFullscreen } from '../fullscreen.js';

const ROTATE_ICON = '<svg class="rotate-icon" viewBox="0 0 48 48" aria-hidden="true"><rect x="15" y="6" width="18" height="30" rx="3" /><path d="M8 30a16 16 0 0 0 16 12l-3-3m3 3-3 3" /></svg>';
const FS_GLYPH = '<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>';
const SHARE_GLYPH = '<svg class="glyph" viewBox="0 0 24 24" aria-label="Share"><path d="M12 3v12M8 7l4-4 4 4M7 10H5v11h14V10h-2" /></svg>';

let bound = false;

/** Fill #rotate-hint for the current full-screen state; call again whenever it changes. */
export function renderRotateHint() {
  const el = document.getElementById('rotate-hint');
  if (!el) return;
  if (!bound) {
    bound = true;
    matchMedia('(display-mode: fullscreen), (display-mode: standalone)').addEventListener('change', renderRotateHint);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-act=fullscreen]')) toggleFullscreen();
    });
  }
  const sideways = '<p class="rotate-main">Turn your device sideways to play</p>';
  if (isFullscreen() || isStandalone()) {
    el.innerHTML = ROTATE_ICON + sideways;
    return;
  }
  const or = `<p class="rotate-or">${ROTATE_ICON}or turn your device sideways to play without full screen</p>`;
  if (fullscreenSupported()) {
    el.innerHTML = `<p class="rotate-main">Play in full screen</p>
      <p class="rotate-text">The game fills the screen and turns to landscape.</p>
      <button class="btn primary" type="button" data-act="fullscreen">${FS_GLYPH} Full screen</button>
      ${or}`;
    return;
  }
  el.innerHTML = `<p class="rotate-main">Play in full screen</p>
    <ol class="rotate-steps">
      <li>Tap Share ${SHARE_GLYPH} in Safari's toolbar</li>
      <li>Choose <b>Add to Home Screen</b></li>
      <li>Open the game from its new icon: it plays full screen, without the browser bars</li>
    </ol>
    ${or}`;
}
