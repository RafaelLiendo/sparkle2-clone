// Fullscreen API with the `webkit` fallback older iPad Safari needs. iPhone Safari has no
// element fullscreen at all; there the web app manifest (Add to Home Screen) covers it.

const doc = document;

export const fullscreenSupported = () => !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);

export const isFullscreen = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);

/** True when running as an installed web app (Add to Home Screen). */
export const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;

/** 'ios' | 'android' | 'desktop', for platform-specific full-screen instructions. */
export function platform() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch points give it away
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export async function toggleFullscreen() {
  try {
    if (isFullscreen()) {
      await (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
      return;
    }
    const el = doc.documentElement;
    await (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
    // Android only; everywhere else this rejects or is missing, which is fine
    await screen.orientation?.lock?.('landscape').catch(() => {});
  } catch {
    // refused (no user gesture, or blocked by the browser): stay as we are
  }
}

export function onFullscreenChange(fn) {
  doc.addEventListener('fullscreenchange', fn);
  doc.addEventListener('webkitfullscreenchange', fn);
}
