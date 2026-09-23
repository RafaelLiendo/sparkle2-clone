import { App } from './app.js';
import { applyTuningOverrides } from './config.js';

applyTuningOverrides(location.search);
const params = new URLSearchParams(location.search);

const app = new App({
  stage: document.getElementById('stage'),
  canvas: document.getElementById('game'),
  ui: document.getElementById('ui'),
  debug: params.has('debug'),
});

// `?day=d5` jumps straight into a day (handy for testing).
const day = params.get('day');
if (day) app.startDay(day);
// `?scene=map|enchant|options` opens a screen directly (dev convenience).
const scene = params.get('scene');
if (scene === 'map') app.showMap();
else if (scene === 'enchant') app.showEnchantments(() => app.showTitle());
else if (scene === 'options') app.showOptions(() => app.showTitle());

window.__app = app;
