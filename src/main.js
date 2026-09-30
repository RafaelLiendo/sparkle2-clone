import { App } from './app.js';
import { applyTuningOverrides } from './config.js';
import { DIFFICULTY_BY_ID } from './defs.js';

applyTuningOverrides(location.search);
const params = new URLSearchParams(location.search);

const app = new App({
  stage: document.getElementById('stage'),
  canvas: document.getElementById('game'),
  ui: document.getElementById('ui'),
  fsButton: document.getElementById('fs-btn'),
  debug: params.has('debug'),
});

// `?difficulty=hard` overrides the saved difficulty for this session (it reaches the save
// only if something else persists meanwhile).
const difficulty = params.get('difficulty');
if (DIFFICULTY_BY_ID[difficulty]) {
  app.settings.difficulty = difficulty;
  app.showTitle();
}
// `?day=d5` jumps straight into a day (handy for testing).
const day = params.get('day');
if (day) app.startDay(day);
// `?scene=map|enchant|options` opens a screen directly (dev convenience).
const scene = params.get('scene');
if (scene === 'map') app.showMap();
else if (scene === 'enchant') app.showEnchantments(() => app.showTitle());
else if (scene === 'options') app.showOptions(() => app.showTitle());

window.__app = app;
