// The five enchanted keys (§6.1) as inline SVG. Keys are never named on screen: each one
// is a key icon with its own gem, and the name lives only in tooltips and aria labels.

import { DAYS } from '../levels.js';

/** Gem colour set in each key's bow, so the five keys tell apart at a glance. */
export const KEY_GEMS = {
  'Key of Moss': '#7cc46a',
  'Key of Tides': '#5fb0ea',
  'Key of Embers': '#f08a3c',
  'Key of Stars': '#e9ecff',
  'Key of Night': '#a77ce8',
};

/** Key names in story order. */
export const KEY_NAMES = DAYS.filter((d) => d.key).map((d) => d.key);

// One silhouette, drawn twice: once stroked thick for the outline, once filled on top,
// so the outline hugs the union of the shapes. Horizontal, bow on the left.
const SHAPE =
  '<circle cx="15" cy="32" r="10"/><circle cx="15" cy="21.5" r="3.6"/><circle cx="4.8" cy="32" r="3.6"/>' +
  '<circle cx="15" cy="42.5" r="3.6"/><rect x="23" y="29.5" width="37" height="5" rx="1.5"/>' +
  '<rect x="26" y="26.5" width="3.5" height="11" rx="1"/><rect x="49" y="33" width="4.5" height="9" rx="1"/>' +
  '<rect x="55" y="33" width="5" height="7" rx="1"/>';

/**
 * A key icon.
 * @param name  key name, for its gem colour
 * @param state 'have' (gold), 'empty' (a faint outline: not found yet) or 'embossed'
 *   (pressed into a wax seal)
 */
export function keyIcon(name, { state = 'have', size = 40, cls = '' } = {}) {
  const gem = KEY_GEMS[name] || '#f2d58c';
  return `<svg class="key-icon ${state}${cls ? ` ${cls}` : ''}" viewBox="0 0 64 64" width="${size}" height="${size}" style="--gem:${gem}" aria-hidden="true">
    <g transform="rotate(-35 32 32)">
      <g class="k-edge">${SHAPE}</g>
      <g class="k-body">${SHAPE}</g>
      <path class="k-shine" d="M8.5 27.5a8 8 0 0 1 9-5.5M31 31h27" />
      <circle class="k-hole" cx="15" cy="32" r="6.6" />
      <circle class="k-gem" cx="15" cy="32" r="5.2" />
      <circle class="k-spark" cx="13.4" cy="30.4" r="1.5" />
    </g></svg>`;
}

/**
 * The five key slots in story order: a gold key where recovered, a faint outline where not.
 * `justGot` names a key that settles into its slot, starting `settle` seconds in.
 */
export function keyRing(collected, { justGot = null, settle = 0, cls = '' } = {}) {
  const slots = KEY_NAMES.map((name) => {
    const have = collected.includes(name);
    const got = have && name === justGot;
    const title = have ? name : 'A key not yet found';
    return `<span class="key-slot${have ? ' have' : ''}${got ? ' just-got' : ''}" title="${title}">${keyIcon(name, { state: 'empty' })}${
      have ? keyIcon(name, { cls: 'over' }) : ''
    }</span>`;
  }).join('');
  return `<div class="key-ring${cls ? ` ${cls}` : ''}" style="--settle:${settle}s" role="img" aria-label="Keys recovered: ${collected.length} of ${KEY_NAMES.length}">${slots}</div>`;
}
