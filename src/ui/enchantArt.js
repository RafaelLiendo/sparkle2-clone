// Enchantment medallions (§5) as inline SVG: a gold bezel around a tinted glass orb, with
// one simple motif per enchantment. The bezel, glass and glint are CSS (`.ench-icon`), so
// states (selected, locked, Reduced Flashing) stay in the stylesheet.

// A butterfly centred on (0, 0), about 28 wide.
const BUTTERFLY = (wing, dot) =>
  `<g class="e-wings"><path d="M0-1C-5-12-15-12-14-4c1 5 7 6 14 3z" fill="${wing}"/><path d="M0 1c-6 1-10 6-7 10 3 3 6-3 7-10z" fill="${wing}"/>` +
  `<path d="M0-1C5-12 15-12 14-4c-1 5-7 6-14 3z" fill="${wing}"/><path d="M0 1c6 1 10 6 7 10-3 3-6-3-7-10z" fill="${wing}"/></g>` +
  `<circle cx="-8" cy="-5" r="1.8" fill="${dot}"/><circle cx="8" cy="-5" r="1.8" fill="${dot}"/>` +
  '<rect x="-1" y="-7" width="2" height="16" rx="1" fill="#1d1230"/>' +
  '<path d="M-.5-7l-3-4M.5-7l3-4" stroke="#1d1230" stroke-width="1" fill="none"/>';

// An orb with a highlight, as on the line.
const ORB = (x, y, r, fill, hi) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/><circle cx="${x - r * 0.32}" cy="${y - r * 0.32}" r="${r * 0.35}" fill="${hi}" opacity=".75"/>`;

/** Rune Fire: a rune ring with fireballs bursting out of it. */
function runeFire() {
  let fire = '';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const p = (r) => `${(32 + c * r).toFixed(1)} ${(32 + s * r).toFixed(1)}`;
    fire += `<path d="M${p(14)}L${p(21)}" stroke="#ffb45c" stroke-width="1.6" opacity=".7"/>`;
    fire += `<circle cx="${(32 + c * 23).toFixed(1)}" cy="${(32 + s * 23).toFixed(1)}" r="3.2" fill="#ff9a3c"/>`;
    fire += `<circle cx="${(32 + c * 23).toFixed(1)}" cy="${(32 + s * 23).toFixed(1)}" r="1.6" fill="#fff0b8"/>`;
  }
  return (
    '<circle cx="32" cy="32" r="12" fill="none" stroke="#6fb6e6" stroke-width="2"/>' +
    '<circle cx="32" cy="32" r="8.5" fill="none" stroke="#6fb6e6" stroke-width="1" stroke-dasharray="2 2.4" opacity=".8"/>' +
    '<path d="M30 27v10M30 29.5l5-2.5M30 33l5-2.5" stroke="#ffd36a" stroke-width="2" stroke-linecap="round" fill="none"/>' +
    fire
  );
}

/** Per enchantment: glass tint (light, dark) and motif, on a 64×64 box. */
const ART = {
  // --- Handling ---
  speedUnleashed: {
    bg: ['#2f8f8a', '#0a2629'],
    art:
      '<g stroke="#bff7ee" stroke-linecap="round" opacity=".8"><path d="M9 24h20M5 32h22M11 40h18" stroke-width="3"/></g>' +
      '<circle cx="41" cy="32" r="12" fill="#7fe8da"/><circle cx="41" cy="32" r="12" fill="none" stroke="#e8fffb" stroke-width="2"/>' +
      '<circle cx="37" cy="28" r="4" fill="#fff" opacity=".85"/>',
  },
  tranquility: {
    bg: ['#3f8f3c', '#0b220d'],
    art:
      '<ellipse cx="32" cy="47" rx="17" ry="3.4" fill="none" stroke="#a8e890" stroke-width="1.6" opacity=".7"/>' +
      '<ellipse cx="32" cy="52" rx="11" ry="2.2" fill="none" stroke="#a8e890" stroke-width="1.2" opacity=".45"/>' +
      '<path d="M32 42c-11 0-17-7-19-15 9 0 15 5 19 15z" fill="#5cbf3c"/>' +
      '<path d="M32 42c11 0 17-7 19-15-9 0-15 5-19 15z" fill="#5cbf3c"/>' +
      '<path d="M32 12c8 9 9 18 0 30-9-12-8-21 0-30z" fill="#b6f28a"/>' +
      '<path d="M32 22c3 5 3 10 0 16-3-6-3-11 0-16z" fill="#effde0" opacity=".8"/>',
  },
  eternitySwap: {
    bg: ['#5b3cae', '#140b2c'],
    art:
      '<g fill="none" stroke="#e4d8ff" stroke-width="3.2" stroke-linecap="round">' +
      '<path d="M16.96 26.53A16 16 0 0 1 40 18.14"/><path d="M47.04 37.47A16 16 0 0 1 24 45.86"/></g>' +
      '<path d="M44.8 20.9L41.75 15.11 37.4 21.9z" fill="#e4d8ff"/><path d="M19.2 43.1L22.25 48.89 26.6 42.1z" fill="#e4d8ff"/>' +
      ORB(32, 32, 8.5, '#b89cff', '#fff'),
  },
  powerMagnetism: {
    bg: ['#a3327f', '#2a0922'],
    art:
      '<path d="M24 23q8-5 16 0M21 27q11-7 22 0" stroke="#ffb3df" stroke-width="1.5" fill="none" stroke-dasharray="2 3" opacity=".8"/>' +
      '<path d="M32 5l2.2 5.3 5.3 2.2-5.3 2.2L32 20l-2.2-5.3-5.3-2.2 5.3-2.2z" fill="#ffe6f6"/>' +
      '<path d="M21 31v7a11 11 0 0 0 22 0v-7" fill="none" stroke="#f06ab8" stroke-width="7"/>' +
      '<path d="M21 31v5M43 31v5" stroke="#eef0f4" stroke-width="7"/>',
  },
  // --- Ammo ---
  hornOfPlenty: {
    bg: ['#2f7d3c', '#08200e'],
    art:
      '<path d="M12 46c-3-2-2-6 1-6 2 0 2 3 0 3" fill="none" stroke="#e8b93e" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M13 42c3-11 12-18 28-20l5-1 3 17-6 0c-11 0-19 3-25 8z" fill="#e8b93e"/>' +
      '<path d="M24 33c1 4 2 7 1 10M32 28c1 4 2 8 1 12" stroke="#a8761a" stroke-width="2" fill="none"/>' +
      '<ellipse cx="46.5" cy="29.5" rx="4" ry="9" transform="rotate(-8 46.5 29.5)" fill="#6b440c" stroke="#ffe08a" stroke-width="1.6"/>' +
      '<circle cx="53" cy="22" r="1.6" fill="#fff3c0"/><circle cx="55" cy="30" r="1.2" fill="#fff3c0"/><circle cx="52" cy="37" r="1.4" fill="#fff3c0"/>',
  },
  suddenFire: {
    bg: ['#8a3410', '#1e0904'],
    art:
      '<path d="M35 15L9 51l39-21z" fill="#e8641c" opacity=".55"/>' +
      '<path d="M38 20L17 46l29-17z" fill="#ffb347" opacity=".8"/>' +
      '<circle cx="42" cy="23" r="10" fill="#ff9a3c"/><circle cx="42" cy="23" r="6.5" fill="#ffd27a"/><circle cx="43" cy="22" r="3.5" fill="#fff7d6"/>',
  },
  callOfTheWild: {
    bg: ['#2a4596', '#060a1f'],
    art:
      '<path d="M4 26c10-10 20 4 30-6s18-4 26-10" stroke="#6af0c0" stroke-width="5" fill="none" opacity=".55" stroke-linecap="round"/>' +
      '<path d="M6 33c10-8 18 2 28-4s16-6 24-12" stroke="#e07ae0" stroke-width="3" fill="none" opacity=".45" stroke-linecap="round"/>' +
      '<circle cx="36" cy="36" r="13" fill="#e4eaff" opacity=".9"/><circle cx="36" cy="36" r="17" fill="#e4eaff" opacity=".15"/>' +
      '<circle cx="14" cy="14" r="1" fill="#fff"/><circle cx="50" cy="40" r=".9" fill="#fff"/><circle cx="24" cy="9" r=".8" fill="#fff"/>' +
      '<path d="M10 64L20 50l14-3 12 3 12 14z" fill="#05070f"/>' +
      '<path d="M24 50l1-10c0-4 2-7 5-8l2-8 2 3 4-6 .5 5.5c1 2 0 4-2 5l-1 4c3 4 3 9 2 15z" fill="#05070f"/>',
  },
  flamePurple: {
    bg: ['#5a2394', '#12061f'],
    art:
      '<path d="M32 10c6 7 11 13 9 21-1 6-5 9-9 9s-8-3-9-9c-1-5 2-9 5-12 0 4 1 6 3 7-1-6 0-10 1-16z" fill="#c07bff"/>' +
      '<path d="M32 23c3 4 5 7 4 10-1 3-3 4-4 4s-3-1-4-4c0-3 2-6 4-10z" fill="#f1dcff"/>' +
      '<path d="M13 43c4 5 26 6 38 0l3-7-5 2-4 4c-7 2-15 2-22 0l-4-4-6-2z" fill="#f0c8a0"/>' +
      '<path d="M17 47c6 3 22 3 30 0" stroke="#c49a74" stroke-width="1.4" fill="none"/>',
  },
  // --- Runes ---
  headStart: {
    bg: ['#2f6464', '#081a1d'],
    art:
      '<path d="M21 10h22l5 8v30l-6 6H22l-6-6V18z" fill="#6f787c"/>' +
      '<path d="M21 10h22l5 8H16z" fill="#8c9599"/>' +
      '<path d="M29 22v26M29 28l10-6M29 35l10-6" stroke="#ffd36a" stroke-width="7" stroke-linecap="round" opacity=".25" fill="none"/>' +
      '<path d="M29 22v26M29 28l10-6M29 35l10-6" stroke="#ffe08a" stroke-width="3" stroke-linecap="round" fill="none"/>',
  },
  retreatOrders: {
    bg: ['#3b4d72', '#0b1120'],
    art:
      '<rect x="16" y="9" width="30" height="40" rx="4" fill="#c9d1da" transform="rotate(-6 31 29)"/>' +
      '<g stroke="#7d8894" stroke-width="2" stroke-linecap="round" fill="none" transform="rotate(-6 31 29)">' +
      '<path d="M22 16v7M22 18l4-2M30 16l3 7 3-7M40 16v7l-3-3M22 28h16M22 33h12"/></g>' +
      '<path d="M50 46H28" stroke="#5fb0ea" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M30 38l-11 8 11 8z" fill="#5fb0ea"/>',
  },
  marchOfTheFurious: {
    bg: ['#43307a', '#0d0920'],
    art:
      '<circle cx="32" cy="32" r="22" fill="none" stroke="#8d7fd0" stroke-width="1.6" stroke-dasharray="3 3.5"/>' +
      '<path d="M32 12v4M52 32h-4M32 52v-4M12 32h4" stroke="#b9adf0" stroke-width="2" stroke-linecap="round"/>' +
      `<g transform="translate(32 31) scale(1.15)">${BUTTERFLY('#c89bff', '#f6e8ff')}</g>`,
  },
  runeFire: { bg: ['#1f335f', '#050917'], art: runeFire() },
  // --- Stones ---
  tar: {
    bg: ['#4a4a38', '#0b0b08'],
    art:
      '<path d="M34 5c0 7-4 10-4 15 0 3.5 2 6 4 6s4-2.5 4-6c0-5-4-8-4-15z" fill="#1b1a17" stroke="#8a8672" stroke-width="1.2"/>' +
      '<circle cx="32.6" cy="19" r="1.2" fill="#a8a490"/>' +
      '<path d="M11 34h42c0 10-9 18-21 18s-21-8-21-18z" fill="#c4ccb1"/>' +
      '<path d="M15 40c3 7 10 10 17 10" stroke="#e6ecd6" stroke-width="2" fill="none" opacity=".7"/>' +
      '<ellipse cx="32" cy="34" rx="21" ry="5.5" fill="#151412"/>' +
      '<ellipse cx="26" cy="33" rx="6" ry="1.4" fill="#4a4840"/>',
  },
  marchBlue: {
    bg: ['#1f5596', '#051226'],
    art:
      ORB(22, 46, 8, '#2f7fdc', '#cfe6ff') +
      ORB(40, 48, 7, '#2f7fdc', '#cfe6ff') +
      `<g transform="translate(22 19) scale(.7) rotate(-15)">${BUTTERFLY('#7fc4ff', '#e6f4ff')}</g>` +
      `<g transform="translate(43 26) scale(.55) rotate(18)">${BUTTERFLY('#7fc4ff', '#e6f4ff')}</g>`,
  },
  redNoMore: {
    bg: ['#781226', '#1d0307'],
    art:
      '<path d="M19 28a13 13 0 0 1 26 0c0 5-2 8-5 11l-3-3-3 4-3-4-3 4-3-4-3 3c-2-3-3-7-3-11z" fill="#d8363a"/>' +
      '<circle cx="27" cy="23" r="4" fill="#ffc7c0" opacity=".75"/>' +
      '<circle cx="25" cy="47" r="2.8" fill="#d8363a"/><circle cx="33" cy="49" r="2.3" fill="#d8363a" opacity=".85"/>' +
      '<circle cx="40" cy="45" r="1.8" fill="#d8363a" opacity=".7"/><circle cx="29" cy="55" r="1.6" fill="#d8363a" opacity=".55"/>' +
      '<circle cx="37" cy="56" r="1.2" fill="#d8363a" opacity=".4"/>',
  },
  orbsUnhatched: {
    bg: ['#4f6a38', '#0c1508'],
    art:
      '<circle cx="32" cy="40" r="17" fill="#ffe66a" opacity=".18"/><circle cx="32" cy="40" r="10" fill="#ffe66a" opacity=".3"/>' +
      '<ellipse cx="22" cy="24" rx="10" ry="4.5" transform="rotate(-30 22 24)" fill="#f2f6ff" opacity=".55"/>' +
      '<ellipse cx="42" cy="24" rx="10" ry="4.5" transform="rotate(30 42 24)" fill="#f2f6ff" opacity=".55"/>' +
      '<ellipse cx="32" cy="41" rx="5.5" ry="9" fill="#fff08a"/>' +
      '<ellipse cx="32" cy="27" rx="4.5" ry="5" fill="#b8322a"/><circle cx="32" cy="20" r="3.4" fill="#8a2018"/>' +
      '<path d="M31 17l-4-6M33 17l4-6" stroke="#8a2018" stroke-width="1.2" fill="none"/>',
  },
};

/** The empty socket: a smoky black orb. */
const NONE = {
  bg: ['#34322e', '#050505'],
  art:
    '<g fill="none" stroke="#8a8578" stroke-linecap="round" opacity=".45">' +
    '<path d="M26 50c5-6-3-11 3-17s3-11 8-14" stroke-width="2.4"/><path d="M36 52c3-5-1-8 3-12" stroke-width="1.6"/></g>',
};

/** Not unlocked yet: a dim sealed socket with a lock. */
const LOCKED = {
  bg: ['#2c2820', '#0c0a08'],
  art:
    '<path d="M25 31v-5a7 7 0 0 1 14 0v5" fill="none" stroke="#7a6d52" stroke-width="3.4"/>' +
    '<rect x="21" y="30" width="22" height="17" rx="3" fill="#7a6d52"/><circle cx="32" cy="37" r="2.4" fill="#2c2820"/>' +
    '<path d="M32 38v4" stroke="#2c2820" stroke-width="2"/>',
};

/**
 * An enchantment medallion.
 * @param id    enchantment id, or 'none' for an empty socket
 * @param state 'on' (unlocked) or 'locked'
 */
export function enchantIcon(id, { size = 56, state = 'on', cls = '' } = {}) {
  const a = state === 'locked' ? LOCKED : ART[id] || NONE;
  const classes = ['ench-icon', state, id === 'none' ? 'empty' : '', cls].filter(Boolean).join(' ');
  return `<span class="${classes}" style="--s:${size}px;--g1:${a.bg[0]};--g2:${a.bg[1]}" aria-hidden="true">
    <svg viewBox="0 0 64 64">${a.art}</svg></span>`;
}

/** Ids with a motif, for tests. */
export const ENCHANT_ART_IDS = Object.keys(ART);
