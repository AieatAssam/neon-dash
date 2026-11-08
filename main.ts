import Phaser from 'phaser';
import { GAMEPLAY_COLORS as C, UI_CSS_COLORS } from './src/art/palette';
import {
  challengeProgress, createGame, step, enterVertical,
  VERTICAL_APPROACH_CUE_X, VERTICAL_SECTION_START_X, VERTICAL_WARP_SECONDS,
  type Game, type Input,
} from './core';
import { mergeProgress } from './achievements.js';
import { viewportWorldSize, runnerScreenShare, runwayScreenShare, isPortrait } from './viewport';
import { GlowCache, glowRasterMetrics } from './glow-cache';
import { BeatClock, beatEnvelope, musicPosition, musicNeedsSync, BEAT_SECONDS } from './rhythm';
import { createCheckpoint, restoreCheckpoint, type PracticeCheckpoint } from './practice';
import { collectShield } from './powerups';
import { createVerticalSection, createVerticalSectionCourse, createVerticalSectionOrbs, verticalSectionLength, VERTICAL_WALL_INSET, VERTICAL_WIDTH } from './vertical-section';
import { RunnerTrail } from './runner-visuals';
import { drawBackdrop, skyPaletteFor } from './src/render/backdrop';
import { drawWorld, PHASE_COLORS, type GlowFn } from './src/render/world';
import { drawShaft, shaftTransform } from './src/render/shaft';
import { Fx } from './src/fx';
import { Audio2, type Sfx } from './src/audio';
import { Teacher, type Prompt } from './src/teach';
import { botFor, courseInput, nextJump, type Bot } from './src/autoplay';

for (const [name, color] of Object.entries(UI_CSS_COLORS)) document.documentElement.style.setProperty(name, color);

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const viewportEl = $('viewport');
const canvas = $('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const params = new URLSearchParams(location.search);

/** The level is one fixed course, so best % means something across sessions. */
const LEVEL_SEED = 7;
type MenuMode = 'challenge' | 'endless' | 'practice';
type Mode = 'title' | 'running' | 'paused' | 'dying' | 'over';

// ---------------------------------------------------------------- storage
const store = {
  get(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch {} },
};
let progress: any = { bestDistance: 0, challengeBest: 0, challengeWins: 0, runs: 0, unlocked: [] };
try {
  const saved = JSON.parse(store.get('neon-dash-progress', 'null'));
  if (saved && typeof saved === 'object') progress = { ...progress, ...saved, unlocked: Array.isArray(saved.unlocked) ? saved.unlocked : [] };
} catch {}
let menuMode: MenuMode = (['challenge', 'endless', 'practice'] as const).find(m => m === store.get('neon-dash-mode', 'challenge')) ?? 'challenge';
let vibration = store.get('neon-dash-vibration', 'on') !== 'off';

// ---------------------------------------------------------------- systems
const audio = new Audio2(new URL('./assets/space-city.mp3', import.meta.url).href);
audio.enabled = store.get('neon-dash-sound', 'on') !== 'off';
const beatClock = new BeatClock();
const fx = new Fx();
const teacher = new Teacher(touch);
const trail = new RunnerTrail();
const shaftTrail = new RunnerTrail();
const glowCache = new GlowCache<{ canvas: HTMLCanvasElement; pad: number }>(10 * 1024 * 1024, 160);
let view = { width: 390, height: 844, dpr: 1 };

const glow: GlowFn = (key, x, y, w, h, blur, color, draw, alpha = 1) => {
  const t = ctx.getTransform();
  const { scale, radius } = glowRasterMetrics(Math.hypot(t.a, t.b), view.dpr, blur);
  if (radius <= 0) return;
  const cacheKey = `${key}:${Math.round(w)}:${Math.round(h)}:${scale}:${radius}:${color}`;
  let sprite = glowCache.get(cacheKey);
  if (!sprite) {
    const pad = Math.ceil((radius * 2 + 6) / scale);
    const image = document.createElement('canvas');
    image.width = Math.ceil((w + 2 * pad) * scale); image.height = Math.ceil((h + 2 * pad) * scale);
    const g = image.getContext('2d')!;
    g.setTransform(scale, 0, 0, scale, pad * scale, pad * scale);
    g.shadowColor = color; g.shadowBlur = radius;
    draw(g);
    sprite = { canvas: image, pad };
    glowCache.set(cacheKey, sprite, image.width * image.height);
  }
  const previous = ctx.globalAlpha;
  ctx.globalAlpha = previous * alpha;
  ctx.drawImage(sprite.canvas, x - sprite.pad, y - sprite.pad, sprite.canvas.width / scale, sprite.canvas.height / scale);
  ctx.globalAlpha = previous;
};

// ---------------------------------------------------------------- run state
let mode: Mode = 'title';
let runMode: MenuMode = menuMode;
let seed = LEVEL_SEED;
let game: Game = newGame();
let demo: Game | null = null;
let attempt = 0;
let checkpoints: PracticeCheckpoint[] = [];
let checkpointMarks: number[] = [];
let lastCheckpointAt = 0;
let accumulator = 0;
let lastFrame = 0;
let timeScale = 1;
let bot: Bot | null = null;
let forcedSeed: number | null = Number(params.get('seed')) || null;
let botName = '';
let streak = 0;
let lastPerfectAt = -10;
let rotation = 0;
let squash = 1;
let diedAt = 0;
let prompt: Prompt | null = null;
let cueShown = false;
let warpStartedAt = 0;
let shaftEnteredAt = 0;
let shaftExitedAt = 0;
let lastShaft: Game['verticalState'] = null;
let lastShaftSnapshot: Game['verticalState'] = null;
let newBest = false;
let frameCost = 16;
let bloom = !reducedMotion && params.get('bloom') !== 'off';

// Input
const jumpPointers = new Set<number>();
let keyJump = false;
let jumpQueued = false;
let toggleQueued = false;

function newGame(): Game {
  return createGame({ seed, mode: runMode === 'endless' ? 'endless' : 'challenge' });
}

function haptic(pattern: number | number[]) {
  if (vibration && !reducedMotion && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
}
function sfx(name: Sfx) { audio.play(name); }

// ---------------------------------------------------------------- UI helpers
const ui = {
  overlay: $('overlay'), titleCard: $('titleCard'), resultCard: $('resultCard'), pause: $('pauseOverlay'),
  teach: $('teach'), banner: $('banner'), phaseBtn: $('phaseBtn'), jumpBtn: $('jumpBtn'),
  pauseBtn: $('pauseBtn'), soundBtn: $('soundBtn'), progressFill: $('progressFill'), progressText: $('progressText'),
  bestMark: $('bestMark'), practiceBadge: $('practiceBadge'), status: $('status'),
};
let shownTeach = '';
let shownBanner = '';
function setTeach(text: string, big = false) {
  if (text === shownTeach) return;
  shownTeach = text;
  ui.teach.hidden = !text;
  ui.teach.textContent = text;
  ui.teach.classList.toggle('big', big);
  if (text) ui.status.textContent = text;
}
function setBanner(text: string) {
  if (text === shownBanner) return;
  shownBanner = text;
  ui.banner.hidden = !text;
  ui.banner.textContent = text;
}
function updateSoundButton() {
  ui.soundBtn.textContent = audio.enabled ? '♫' : '♪';
  ui.soundBtn.setAttribute('aria-pressed', String(audio.enabled));
  ui.soundBtn.setAttribute('aria-label', audio.enabled ? 'Mute sound' : 'Turn sound on');
  const pauseSound = document.getElementById('pauseSoundBtn');
  if (pauseSound) { pauseSound.textContent = audio.enabled ? 'SOUND ON' : 'SOUND OFF'; pauseSound.setAttribute('aria-pressed', String(audio.enabled)); }
}
function updateVibrationButton() {
  const button = $('vibrationBtn');
  button.hidden = typeof navigator.vibrate !== 'function';
  button.textContent = vibration ? 'VIBRATION ON' : 'VIBRATION OFF';
  button.setAttribute('aria-pressed', String(vibration));
}
function bestText(m: MenuMode): string {
  if (m === 'challenge') return progress.challengeBest ? `BEST ${progress.challengeBest}%` : '';
  if (m === 'endless') return progress.bestDistance ? `BEST ${Math.floor(progress.bestDistance / 10)}m` : '';
  return 'CHECKPOINTS SAVE AS YOU GO';
}
function hintText(m: MenuMode): string {
  const tap = touch ? 'Tap to jump' : 'Space to jump';
  if (m === 'endless') return `${tap} · how far can you go?`;
  if (m === 'practice') return `${tap} · no records saved`;
  return `${tap} · reach 100%`;
}
function refreshTitle() {
  $('bestLine').textContent = bestText(menuMode);
  $('overlayHint').textContent = hintText(menuMode);
  document.querySelectorAll<HTMLInputElement>('input[name=gameMode]').forEach(input => { input.checked = input.value === menuMode; });
}
function setPlaying(on: boolean) {
  viewportEl.classList.toggle('playing', on);
}
function percent(g = game): number {
  if (g.state.status === 'won') return 100;
  return Math.floor(challengeProgress(g.state.distance, g.config.runnerX, g.config.finishX));
}

// ---------------------------------------------------------------- flow
function showTitle() {
  mode = 'title';
  bot = null;
  setPlaying(false);
  ui.overlay.hidden = false; ui.overlay.classList.remove('result');
  ui.titleCard.hidden = false; ui.resultCard.hidden = true; ui.pause.hidden = true;
  ui.pauseBtn.hidden = true; ui.phaseBtn.hidden = true; ui.jumpBtn.hidden = true; ui.practiceBadge.hidden = true;
  setTeach(''); setBanner('');
  audio.music.pause();
  runMode = menuMode;
  attempt = 0;
  seed = forcedSeed ?? (menuMode === 'endless' ? 1 + Math.floor(Math.random() * 0xfffffff) : LEVEL_SEED);
  game = newGame();
  demo = reducedMotion ? null : createGame({ seed: 3, mode: 'endless' });
  fx.clear();
  refreshTitle();
}

function start(options: { keepHeld?: boolean } = {}) {
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
  audio.unlock();
  runMode = menuMode;
  seed = forcedSeed ?? (runMode === 'endless' ? 1 + Math.floor(Math.random() * 0xfffffff) : LEVEL_SEED);
  game = newGame();
  demo = null;
  mode = 'running';
  attempt++;
  checkpoints = []; checkpointMarks = []; lastCheckpointAt = 0;
  resetRunPresentation();
  if (!options.keepHeld) { jumpPointers.clear(); keyJump = false; }
  jumpQueued = false; toggleQueued = false;
  setPlaying(true);
  ui.overlay.hidden = true; ui.pause.hidden = true;
  ui.pauseBtn.hidden = false; ui.phaseBtn.hidden = false; ui.jumpBtn.hidden = !touch;
  ui.practiceBadge.hidden = runMode !== 'practice';
  ui.bestMark.hidden = runMode !== 'challenge' || !progress.challengeBest;
  ui.bestMark.style.left = `${progress.challengeBest || 0}%`;
  ui.status.textContent = `Attempt ${attempt}`;
  beatClock.reset();
  try { audio.music.currentTime = 0; } catch {}
  playMusic();
}

function resetRunPresentation() {
  accumulator = 0; lastFrame = 0; timeScale = 1;
  streak = 0; rotation = 0; squash = 1; prompt = null; cueShown = false; newBest = false;
  warpStartedAt = 0; shaftEnteredAt = 0; shaftExitedAt = 0; lastShaft = null; lastShaftSnapshot = null;
  fx.clear(); teacher.reset();
  trail.reset(); shaftTrail.reset();
  recordTrail();
  setTeach(''); setBanner('');
  viewportEl.classList.remove('shaft');
}

function practiceRespawn() {
  const restored = checkpoints.length ? restoreCheckpoint(checkpoints[checkpoints.length - 1]) : null;
  game = restored || newGame();
  attempt++;
  mode = 'running';
  const keep = checkpointMarks;
  resetRunPresentation();
  checkpointMarks = keep;
  lastCheckpointAt = game.state.time;
  ui.overlay.hidden = true;
  viewportEl.classList.toggle('shaft', Boolean(game.verticalState));
  if (game.verticalState) shaftEnteredAt = performance.now() - 2000;
  syncMusic(true);
}

function pause() {
  if (mode === 'running') {
    mode = 'paused';
    jumpPointers.clear(); keyJump = false;
    ui.pause.hidden = false;
    ui.pauseBtn.setAttribute('aria-pressed', 'true');
    audio.music.pause();
    ($('resumeBtn') as HTMLButtonElement).focus();
  } else if (mode === 'paused') {
    mode = 'running';
    lastFrame = 0;
    ui.pause.hidden = true;
    ui.pauseBtn.setAttribute('aria-pressed', 'false');
    playMusic();
  }
}

function die() {
  mode = 'dying';
  diedAt = performance.now();
  timeScale = 1;
  const s = game.state;
  sfx('death');
  haptic([40, 30, 70]);
  fx.shake(.75);
  fx.flashOnce(C.danger, .5);
  const [x, y] = runnerWorldCenter();
  fx.burst(x, y, 26, PHASE_COLORS[s.phase], { speed: 420, life: .9, size: 7, gravity: 600, shape: 1 });
  fx.burst(x, y, 30, C.danger, { speed: 300, life: .6, size: 3, gravity: 200 });
  fx.burst(x, y, 12, C.white, { speed: 520, life: .35, size: 2.5, gravity: 0, shape: 2 });
  audio.setRate(1);
  audio.music.pause();
  setTeach(''); setBanner('');
  if (runMode === 'practice') return;
  const pct = percent();
  if (runMode === 'challenge') newBest = pct > (progress.challengeBest || 0);
  else newBest = Math.floor(s.distance) > (progress.bestDistance || 0);
  saveProgress(pct);
}

function saveProgress(pct: number) {
  if (bot || runMode === 'practice') return;
  progress = mergeProgress(progress, game.state, runMode === 'endless' ? 'endless' : 'challenge', pct);
  store.set('neon-dash-progress', JSON.stringify(progress));
}

function showResult() {
  mode = 'over';
  setPlaying(false);
  const s = game.state;
  const won = s.status === 'won';
  ui.overlay.hidden = false; ui.overlay.classList.add('result');
  ui.titleCard.hidden = true; ui.resultCard.hidden = false;
  ui.resultCard.classList.toggle('won', won);
  ui.pauseBtn.hidden = true; ui.phaseBtn.hidden = true; ui.jumpBtn.hidden = true;
  $('resultKicker').textContent = won ? (runMode === 'practice' ? 'PRACTICE COMPLETE' : 'LEVEL COMPLETE') : `ATTEMPT ${attempt}`;
  $('resultScore').textContent = runMode === 'endless' ? `${Math.floor(s.distance / 10)}m` : `${won ? 100 : percent()}%`;
  const best = $('resultBest');
  best.classList.toggle('new', newBest);
  best.textContent = won ? `${s.stats.orbs} ORBS` : newBest ? 'NEW BEST!' : runMode === 'practice' ? '' : bestText(runMode);
  ui.status.textContent = won ? 'Level complete.' : `Run ended at ${$('resultScore').textContent}. Tap to retry.`;
}

function win() {
  sfx('win'); haptic([25, 40, 25, 40, 80]);
  fx.flashOnce(C.platform, .45);
  const [x, y] = runnerWorldCenter();
  for (const color of [C.gold, C.cyan, C.violet, C.platform]) fx.burst(x + 40, y - 40, 22, color, { speed: 420, life: 1.4, size: 5, gravity: 260, shape: 1 });
  newBest = runMode === 'challenge' && (progress.challengeBest || 0) < 100;
  saveProgress(100);
  audio.music.pause();
  mode = 'dying';
  diedAt = performance.now() - 200;
}

function retry() { start({ keepHeld: false }); }

// ---------------------------------------------------------------- music
function syncMusic(force = false) {
  const m = audio.music;
  if (!audio.enabled || mode !== 'running' || m.readyState === 0 || m.seeking) return;
  if (force || musicNeedsSync(m.currentTime, game.state.time, m.duration)) {
    try { m.currentTime = musicPosition(game.state.time, m.duration); } catch {}
  }
}
function playMusic() {
  if (!audio.enabled || mode !== 'running') return;
  syncMusic(true);
  audio.music.play().then(() => syncMusic()).catch(() => {});
}

// ---------------------------------------------------------------- input
function press() {
  if (mode === 'title') return;
  if (mode === 'over' || (mode === 'dying' && performance.now() - diedAt > 200)) { if (runMode === 'practice' && mode === 'dying') return; retry(); return; }
  if (mode !== 'running' || bot) return;
  if (game.verticalState) toggleQueued = true;
  else jumpQueued = true;
}
function heldJump(): boolean { return jumpPointers.size > 0 || keyJump; }

canvas.addEventListener('pointerdown', e => { e.preventDefault(); jumpPointers.add(e.pointerId); press(); });
ui.overlay.addEventListener('pointerdown', e => {
  if (mode !== 'over' || (e.target as HTMLElement).closest('#menuBtn')) return;
  if ((e.target as HTMLElement).closest('#retryBtn')) return;
  e.preventDefault(); retry();
});
ui.jumpBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); jumpPointers.add(e.pointerId); press(); });
ui.phaseBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (mode === 'running' && !bot) toggleQueued = true; });
ui.phaseBtn.addEventListener('click', e => { e.stopPropagation(); if (e.detail === 0 && mode === 'running') toggleQueued = true; });
window.addEventListener('pointerup', e => { jumpPointers.delete(e.pointerId); });
window.addEventListener('pointercancel', e => { jumpPointers.delete(e.pointerId); });
window.addEventListener('keydown', e => {
  const codes = ['Space', 'ArrowUp', 'KeyW', 'KeyX', 'ShiftLeft', 'ShiftRight', 'KeyP', 'Escape', 'KeyR', 'Enter'];
  if (!codes.includes(e.code)) return;
  if (e.target instanceof HTMLInputElement || (e.target instanceof HTMLButtonElement && (e.code === 'Space' || e.code === 'Enter'))) return;
  e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Enter') { if (mode === 'title' || mode === 'over') start(); return; }
  if (mode === 'title' && ['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { keyJump = true; start({ keepHeld: true }); return; }
  if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { keyJump = true; press(); }
  else if (['KeyX', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { if (mode === 'running' && !bot) toggleQueued = true; else if (mode === 'over') retry(); }
  else if (e.code === 'KeyR') { if (mode !== 'title') retry(); }
  else if (mode === 'running' || mode === 'paused') pause();
});
window.addEventListener('keyup', e => { if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) keyJump = false; });
window.addEventListener('blur', () => { jumpPointers.clear(); keyJump = false; if (mode === 'running' && !bot) pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'running' && !bot) pause(); });

$('playBtn').addEventListener('click', () => start());
$('retryBtn').addEventListener('click', () => retry());
$('menuBtn').addEventListener('click', () => showTitle());
$('resumeBtn').addEventListener('click', () => pause());
$('restartBtn').addEventListener('click', () => retry());
$('titleBtn').addEventListener('click', () => showTitle());
ui.pauseBtn.addEventListener('click', () => pause());
function toggleSound() {
  audio.enabled = !audio.enabled;
  store.set('neon-dash-sound', audio.enabled ? 'on' : 'off');
  audio.unlock();
  if (audio.enabled) playMusic(); else audio.music.pause();
  updateSoundButton();
}
ui.soundBtn.addEventListener('click', toggleSound);
const pauseSound = document.createElement('button');
pauseSound.className = 'toggle'; pauseSound.id = 'pauseSoundBtn';
pauseSound.addEventListener('click', toggleSound);
$('vibrationBtn').before(pauseSound);
$('vibrationBtn').addEventListener('click', () => {
  vibration = !vibration;
  store.set('neon-dash-vibration', vibration ? 'on' : 'off');
  updateVibrationButton();
});
document.querySelectorAll<HTMLInputElement>('input[name=gameMode]').forEach(input => input.addEventListener('change', () => {
  menuMode = input.value as MenuMode;
  store.set('neon-dash-mode', menuMode);
  showTitle();
}));

// ---------------------------------------------------------------- simulation tick
function runnerWorldCenter(): [number, number] {
  const s = game.state;
  if (game.verticalState) return [game.verticalState.x, game.verticalState.y];
  return [s.distance + s.runner.x + s.runner.width / 2, s.runner.y + s.runner.height / 2];
}
function recordTrail() {
  const s = game.state;
  trail.record(s.time, s.distance + s.runner.x + s.runner.width / 2, s.runner.y + s.runner.height / 2);
  if (game.verticalState) shaftTrail.record(s.time, game.verticalState.x, game.verticalState.y);
}

function maybeCheckpoint() {
  if (runMode !== 'practice') return;
  const s = game.state;
  if (s.time - lastCheckpointAt < 2.5 || game.verticalWarp !== null) return;
  if (game.verticalState) {
    const v = game.verticalState;
    const gateNear = game.verticalObstacles.some(o => o.y + o.height > v.y - 20 && o.y < v.y + 260);
    if (gateNear || Math.abs(v.vx) > 30) return;
  } else {
    if (!s.runner.grounded) return;
    const x = s.distance + s.runner.x;
    const danger = [...s.obstacles, ...s.terrain].some(o => o.x + o.width > x - 30 && o.x < x + s.speed * .9);
    if (danger) return;
  }
  const checkpoint = createCheckpoint(game);
  if (!checkpoint) return;
  checkpoints.push(checkpoint);
  lastCheckpointAt = s.time;
  if (!game.verticalState) checkpointMarks.push(s.distance + s.runner.x + s.runner.width / 2);
  const [x, y] = runnerWorldCenter();
  fx.burst(x, y, 10, C.platform, { speed: 140, life: .5, size: 3, gravity: 0 });
}

function stepOnce() {
  const s = game.state;
  const wasShaft = Boolean(game.verticalState);
  const wasWarp = game.verticalWarp !== null;
  const before = {
    jumps: s.stats.jumps, grounded: s.runner.grounded, orbs: s.stats.orbs, phase: s.phase,
    charges: s.powerUps.shieldCharges, used: s.powerUps.shieldsUsed, cleared: s.stats.cleared,
  };
  const target = wasShaft ? null : nextJump(game);
  let input: Input;
  if (bot) input = bot(game);
  else input = { jump: wasShaft ? false : jumpQueued || heldJump(), togglePhase: toggleQueued };
  jumpQueued = false; toggleQueued = false;
  step(game, input);
  recordTrail();
  const [cx, cy] = runnerWorldCenter();
  const color = PHASE_COLORS[s.phase];
  if (s.stats.jumps > before.jumps) {
    sfx('jump');
    squash = 1.22;
    fx.burst(cx, s.runner.y + s.runner.height, 7, C.white, { speed: 90, angle: Math.PI, spread: 1.6, life: .3, size: 2.5, gravity: -40 });
    if (target && Math.abs(target.ttc - target.aim) < .045 && s.time - lastPerfectAt > 1.2) {
      lastPerfectAt = s.time;
      fx.popup('PERFECT', cx, cy - 40, C.cyan, 18, .7);
      sfx('perfect');
    }
  }
  if (!before.grounded && s.runner.grounded && !game.verticalState) {
    squash = .76;
    sfx('land');
    fx.burst(cx, s.runner.y + s.runner.height, 8, color, { speed: 120, angle: -Math.PI / 2, spread: Math.PI, life: .32, size: 2.5, gravity: 400 });
  }
  if (s.stats.orbs > before.orbs) {
    sfx('orb'); haptic(10);
    fx.burst(cx, cy, 14, C.gold, { speed: 200, life: .45, size: 3, gravity: 0 });
  }
  if (s.phase !== before.phase) {
    sfx('phase');
    fx.burst(cx, cy, 12, color, { speed: 230, life: .3, size: 2.5, gravity: 0 });
  }
  if (s.powerUps.shieldsUsed > before.used) {
    sfx('shieldBreak'); haptic([20, 20, 30]);
    fx.flashOnce(C.white, .35); fx.shake(.35);
    fx.burst(cx, cy, 24, C.cyan, { speed: 340, life: .6, size: 4, gravity: 300, shape: 1 });
    fx.popup('SAVED!', cx, cy - 46, C.cyan, 22);
  } else if (s.powerUps.shieldCharges > before.charges) {
    sfx('shield'); haptic(15);
    fx.burst(cx, cy, 18, C.cyan, { speed: 220, life: .5, size: 3, gravity: 0 });
    fx.popup('SHIELD', cx, cy - 44, C.cyan, 20);
  }
  if (s.stats.cleared > before.cleared && s.status === 'running') {
    streak += s.stats.cleared - before.cleared;
    if (streak % 10 === 0) {
      fx.popup(`${streak} STREAK`, cx + 30, cy - 60, C.gold, 24, 1.1);
      sfx('streak');
    }
  }
  if (!wasWarp && game.verticalWarp !== null) {
    warpStartedAt = performance.now();
    sfx('whoosh'); haptic([15, 30, 15]);
    setBanner('GRAVITY TURNS!');
  }
  if (!wasShaft && game.verticalState) {
    shaftEnteredAt = performance.now();
    fx.clear();
    fx.flashOnce(C.white, .55);
    shaftTrail.reset();
    viewportEl.classList.add('shaft');
    ui.status.textContent = 'Gravity turned. Tap to swap walls.';
  }
  if (wasShaft && !game.verticalState && s.status === 'running') {
    shaftExitedAt = performance.now();
    fx.clear();
    fx.flashOnce(C.white, .45);
    sfx('whoosh');
    viewportEl.classList.remove('shaft');
    fx.popup('NICE!', cx + 40, cy - 70, C.platform, 30, 1.2);
  }
  if (!reducedMotion && !game.verticalState) {
    if (!s.runner.grounded) rotation += game.config.fixedStep * Math.PI / .69;
    else rotation += (Math.round(rotation / (Math.PI / 2)) * Math.PI / 2 - rotation) * .35;
  }
  maybeCheckpoint();
}

/** Presentation slow-mo: the simulation clock and the music slow together. */
function targetTimeScale(): number {
  if (mode !== 'running') return 1;
  if (game.verticalWarp !== null) return .42;
  if (game.verticalState && performance.now() - shaftEnteredAt < 450) return .55;
  if (prompt?.slow && !teacher.learned.has(prompt.lesson)) return .5;
  return 1;
}

function tick(now: number) {
  const realDt = lastFrame ? Math.min(.1, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  if (realDt > 0) frameCost = frameCost * .95 + realDt * 1000 * .05;
  const target = targetTimeScale();
  timeScale += (target - timeScale) * Math.min(1, realDt * (target < timeScale ? 9 : 4));
  if (mode === 'running') {
    accumulator += realDt * timeScale;
    while (accumulator >= game.config.fixedStep && game.state.status === 'running') {
      stepOnce();
      accumulator -= game.config.fixedStep;
    }
    if (game.state.status === 'dead') {
      die();
    } else if (game.state.status === 'won') win();
    else {
      audio.setRate(timeScale);
      if (audio.enabled && !audio.music.paused && timeScale > .98) syncMusic();
      updateCues();
    }
  } else if (mode === 'dying') {
    const age = now - diedAt;
    if (runMode === 'practice' && game.state.status === 'dead' && age > 420) practiceRespawn();
    else if (age > 380 && runMode !== 'practice') showResult();
    else if (age > 900) showResult();
  } else if (mode === 'title' && demo) {
    advanceDemo(realDt);
  }
  fx.update(realDt * (mode === 'dying' ? .6 : Math.max(.5, timeScale)));
  squash += (1 - squash) * Math.min(1, realDt * 14);
  render(now);
  adaptQuality();
}

function advanceDemo(dt: number) {
  if (!demo) return;
  for (let t = 0; t < dt; t += demo.config.fixedStep) {
    step(demo, courseInput(demo));
    if (demo.state.status !== 'running') { demo = createGame({ seed: 3, mode: 'endless' }); break; }
  }
}

function updateCues() {
  const s = game.state;
  prompt = teacher.update(game);
  if (game.verticalState) {
    // One line, the first time only: shown until the first gate row is behind the player.
    const learned = store.get('neon-dash-shaft', '') === 'done';
    if ((game.verticalCleared > 0 || game.verticalState.phase !== 0) && !learned) store.set('neon-dash-shaft', 'done');
    const text = learned ? '' : touch ? 'TAP TO SWAP WALLS' : 'SPACE TO SWAP WALLS';
    setTeach(text, true);
    setBanner(performance.now() - shaftEnteredAt < 1400 ? 'GRAVITY TURNS!' : '');
    ui.phaseBtn.classList.toggle('nudge', Boolean(text));
  } else {
    setTeach(prompt ? prompt.text : '');
    ui.phaseBtn.classList.toggle('nudge', prompt?.target === 'phase');
    const approaching = runMode !== 'endless' && !game.verticalComplete && s.distance >= VERTICAL_APPROACH_CUE_X && s.distance < VERTICAL_SECTION_START_X + 400;
    if (approaching && !cueShown) { cueShown = true; sfx('cue'); }
    setBanner(game.verticalWarp !== null ? 'GRAVITY TURNS!' : approaching ? 'GRAVITY TURNS AHEAD ▲' : '');
  }
  const pct = percent();
  if (runMode === 'endless') {
    ui.progressText.textContent = `${Math.floor(s.distance / 10)}m`;
    const best = Math.max(1, progress.bestDistance || 0);
    ui.progressFill.style.width = `${Math.min(100, s.distance / best * 100)}%`;
  } else {
    ui.progressText.textContent = `${pct}%`;
    ui.progressFill.style.width = `${pct}%`;
  }
  document.documentElement.style.setProperty('--phase', PHASE_COLORS[s.phase]);
}

// ---------------------------------------------------------------- render
const bloomA = document.createElement('canvas');
const bloomB = document.createElement('canvas');
function applyBloom() {
  const aw = Math.max(1, Math.round(canvas.width / 6)), ah = Math.max(1, Math.round(canvas.height / 6));
  if (bloomA.width !== aw || bloomA.height !== ah) { bloomA.width = aw; bloomA.height = ah; bloomB.width = Math.max(1, aw >> 1); bloomB.height = Math.max(1, ah >> 1); }
  const a = bloomA.getContext('2d')!, b = bloomB.getContext('2d')!;
  a.globalCompositeOperation = 'copy'; a.drawImage(canvas, 0, 0, aw, ah);
  // Squaring twice keeps only the bright light, then a further downsample spreads it.
  a.globalCompositeOperation = 'multiply'; a.drawImage(bloomA, 0, 0); a.drawImage(bloomA, 0, 0);
  b.globalCompositeOperation = 'copy'; b.drawImage(bloomA, 0, 0, bloomB.width, bloomB.height);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = .55; ctx.drawImage(bloomB, 0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = .35; ctx.drawImage(bloomA, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function adaptQuality() {
  if (frameCost > 26 && bloom) { bloom = false; fx.density = .6; }
}

function beatInfo() {
  const t = beatClock.sample(game.state.time, audio.enabled && !audio.music.paused ? audio.music.currentTime : undefined);
  const g = mode === 'title' && demo ? demo : game;
  const time = mode === 'title' && demo ? g.state.time : t;
  return { env: reducedMotion ? 0 : beatEnvelope(time), phase: ((time / BEAT_SECONDS) % 1 + 1) % 1 };
}

function horizontalFrame(g: Game) {
  const { width: w, height: h } = view;
  const world = viewportWorldSize(w, h);
  const scale = world.scale;
  const cameraX = world.width * runnerScreenShare(w, h) - g.config.runnerX;
  const runwayY = h * runwayScreenShare(w, h);
  const offsetY = runwayY / scale - g.config.groundY;
  const horizonY = Math.min(runwayY - 60, h * (isPortrait(w, h) ? .4 : .43));
  return { scale, cameraX, runwayY, offsetY, horizonY, world };
}

function drawHorizontal(g: Game, now: number, beat: { env: number; phase: number }, hideRunner: boolean) {
  const { width: w, height: h, dpr } = view;
  const f = horizontalFrame(g);
  const s = g.state;
  const section = Math.floor(s.distance / 5600);
  const into = s.distance % 5600;
  const blend = Math.max(0, Math.min(1, (into - 4800) / 800));
  drawBackdrop(ctx, {
    width: w, height: h, dpr, horizonY: f.horizonY, runwayY: f.runwayY,
    originX: (f.cameraX - s.distance) * f.scale, scale: f.scale,
    time: now / 1000, beat: beat.env, beatPhase: beat.phase,
    palette: skyPaletteFor(section), next: skyPaletteFor(section + 1), blend, reducedMotion,
  });
  const base = ctx.getTransform();
  ctx.save();
  ctx.transform(f.scale, 0, 0, f.scale, f.cameraX * f.scale, f.offsetY * f.scale);
  drawWorld(ctx, g, {
    width: f.world.width, height: f.world.height, cameraX: f.cameraX,
    glowUnit: g.config.runnerWidth * .9, time: now / 1000, beat: beat.env, beatPhase: beat.phase, reducedMotion,
    heat: Math.min(1, streak / 30), attempt, showAttempt: g === game && mode !== 'title', checkpoints: g === game ? checkpointMarks : [],
    squash: g === game ? squash : 1, rotation: g === game ? rotation : 0, hideRunner, challenge: runMode !== 'endless' && g === game,
  }, g === game ? trail : demoTrail(g), glow);
  if (g === game) {
    ctx.translate(-s.distance, 0);
    fx.drawParticles(ctx);
    fx.drawPopups(ctx);
  }
  ctx.restore();
  ctx.setTransform(base);
  return f;
}

const demoTrailBuffer = new RunnerTrail();
function demoTrail(g: Game) {
  const s = g.state;
  demoTrailBuffer.record(s.time, s.distance + s.runner.x + s.runner.width / 2, s.runner.y + s.runner.height / 2);
  return demoTrailBuffer;
}

function drawShaftView(now: number, beat: { env: number; phase: number }, state = game.verticalState!, hideRunner = false) {
  const { width: w, height: h } = view;
  drawShaft(ctx, {
    state, obstacles: game.verticalObstacles, orbs: game.verticalOrbs, shattered: game.verticalShattered,
    shield: game.state.powerUps.shieldCharges > 0,
  }, {
    width: w, height: h, time: now / 1000, beat: beat.env, beatPhase: beat.phase, reducedMotion,
    glowUnit: 22, heat: Math.min(1, streak / 30), hideRunner,
  }, shaftTrail, glow);
  const t = shaftTransform(w, h, state.y);
  ctx.save();
  ctx.translate(t.offsetX, t.offsetY);
  ctx.scale(t.scale, t.scale);
  fx.drawParticles(ctx);
  fx.drawPopups(ctx);
  ctx.restore();
}

const ease = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Rotate the horizontal scene a quarter turn around the runner, landing it
 * where the shaft runner sits, so the runway becomes the left wall. */
function drawRotated(now: number, beat: { env: number; phase: number }, p: number, entering: boolean) {
  const { width: w, height: h } = view;
  const e = ease(Math.max(0, Math.min(1, p)));
  const f = horizontalFrame(game);
  const s = game.state;
  const rx = (s.runner.x + s.runner.width / 2 + f.cameraX) * f.scale;
  const ry = (s.runner.y + s.runner.height / 2 + f.offsetY) * f.scale;
  const shaft = shaftTransform(w, h, 0);
  const tx = shaft.x + VERTICAL_WALL_INSET * shaft.scale, ty = h * shaft.runnerShare;
  const preview = entering
    ? createVerticalSection({ width: VERTICAL_WIDTH, height: 900, startX: VERTICAL_WALL_INSET })
    : lastShaft;
  if (preview) {
    ctx.save();
    drawShaftView(now, beat, { ...preview, phase: s.phase }, true);
    ctx.restore();
  }
  const amount = entering ? e : 1 - e;
  ctx.save();
  ctx.globalAlpha = entering ? 1 - Math.max(0, (p - .55) / .45) : Math.min(1, p / .35);
  ctx.translate(rx + (tx - rx) * amount, ry + (ty - ry) * amount);
  ctx.rotate(amount * Math.PI / 2);
  const zoom = 1 + (shaft.scale / f.scale - 1) * amount;
  ctx.scale(zoom, zoom);
  ctx.translate(-rx, -ry);
  drawHorizontal(game, now, beat, false);
  ctx.restore();
}

function render(now: number) {
  const { width: w, height: h, dpr } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const [shx, shy] = fx.offset(now / 1000, reducedMotion);
  ctx.translate(shx, shy);
  const beat = beatInfo();
  if (mode === 'title' && demo) drawHorizontal(demo, now, beat, false);
  else if (game.verticalWarp !== null && !game.verticalState) {
    const p = game.verticalWarp / VERTICAL_WARP_SECONDS;
    drawRotated(now, beat, p, true);
  } else if (game.verticalState) {
    const settle = Math.min(1, (now - shaftEnteredAt) / 380);
    ctx.save();
    if (!reducedMotion && settle < 1) {
      const z = 1 + (1 - ease(settle)) * .08;
      ctx.translate(w / 2, h / 2); ctx.scale(z, z); ctx.translate(-w / 2, -h / 2);
    }
    drawShaftView(now, beat, game.verticalState, mode === 'dying' || mode === 'over');
    ctx.restore();
  } else if (shaftExitedAt && now - shaftExitedAt < 650 && !reducedMotion && lastShaftSnapshot) {
    lastShaft = lastShaftSnapshot;
    drawRotated(now, beat, (now - shaftExitedAt) / 650, false);
  } else {
    drawHorizontal(game, now, beat, mode === 'dying' || mode === 'over');
  }
  if (bloom) applyBloom();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fx.drawFlash(ctx, w, h);
  if (game.verticalWarp !== null && !reducedMotion) {
    const p = game.verticalWarp / VERTICAL_WARP_SECONDS;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .5 * Math.sin(p * Math.PI);
    ctx.strokeStyle = C.white; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 28; i++) {
      const a = i * 2.39996, r0 = Math.min(w, h) * (.25 + ((i * 37) % 11) / 30 + p * .3), r1 = r0 + 40 + p * 120;
      ctx.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0);
      ctx.lineTo(w / 2 + Math.cos(a) * r1, h / 2 + Math.sin(a) * r1);
    }
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- harness
type PlayOptions = { seed?: number; mode?: MenuMode; bot?: 'good' | 'sloppy' | 'very-sloppy' | 'none'; botSeed?: number; skipTo?: number | 'cue' | 'warp' | 'vertical' | 'exit'; after?: number };
function harnessPlay(options: PlayOptions = {}) {
  menuMode = options.mode ?? 'challenge';
  refreshTitle();
  if (options.seed) forcedSeed = options.seed;
  start();
  botName = options.bot ?? 'good';
  bot = botName === 'none' ? null : botFor(botName as any, options.botSeed ?? 1);
  const skip = options.skipTo;
  if (skip !== undefined) {
    const until = (g: Game) => skip === 'cue' ? g.state.distance >= VERTICAL_APPROACH_CUE_X - 200
      : skip === 'warp' ? g.verticalWarp !== null
      : skip === 'vertical' ? Boolean(g.verticalState)
      : skip === 'exit' ? g.verticalComplete
      : g.state.time >= skip;
    // Fast-forwards always arrive alive; the requested bot (or the player) takes over afterwards.
    const driver = bot ?? botFor('good', 1);
    for (let i = 0; i < 120 * 200 && game.state.status === 'running' && !until(game); i++) step(game, driver(game));
    if (options.after) {
      const end = game.state.time + options.after;
      while (game.state.time < end && game.state.status === 'running') step(game, driver(game));
    }
    if (game.verticalState) { shaftEnteredAt = performance.now() - (options.after ?? 0) * 1000; viewportEl.classList.add('shaft'); }
    trail.reset(); shaftTrail.reset(); recordTrail();
    teacher.update(game);
    syncMusic(true);
  }
  return harnessState();
}
function harnessState() {
  const s = game.state;
  return {
    mode, status: s.status, time: s.time, distance: s.distance, percent: percent(), attempt,
    vertical: Boolean(game.verticalState), warp: game.verticalWarp, verticalComplete: game.verticalComplete,
    phase: s.phase, jumps: s.stats.jumps, orbs: s.stats.orbs, cleared: s.stats.cleared, streak, timeScale,
    teach: shownTeach, banner: shownBanner, bloom, frameCost,
  };
}
(window as any).__harness = {
  play: harnessPlay,
  state: harnessState,
  setBot(kind: PlayOptions['bot'], botSeed = 1) { bot = kind === 'none' || !kind ? null : botFor(kind, botSeed); },
  title: showTitle,
};

if (import.meta.env.DEV) {
  (window as any).__layoutTestState = (state: 'dead' | 'won') => {
    game.state.status = state;
    if (state === 'dead') { die(); showResult(); } else { win(); showResult(); }
  };
  (window as any).__setShieldCharged = (charged = true) => {
    game.state.powerUps = charged ? collectShield(game.state.powerUps) : { ...game.state.powerUps, shieldCharges: 0 };
  };
  (window as any).__touchTestState = () => ({ phase: game.state.phase, jumps: game.state.stats.jumps, runnerY: game.state.runner.y, jumpHeld: heldJump() });
  (window as any).__enterVerticalTest = (courseSeed = 1) => {
    game.verticalObstacles = createVerticalSectionCourse(courseSeed);
    game.verticalOrbs = createVerticalSectionOrbs(game.verticalObstacles);
    game.verticalLength = verticalSectionLength(game.verticalObstacles);
    game.verticalComplete = false;
    enterVertical(game);
    shaftEnteredAt = performance.now() - 6000;
    viewportEl.classList.add('shaft');
  };
  (window as any).__verticalTestState = () => ({
    active: Boolean(game.verticalState), complete: game.verticalComplete, phase: game.verticalState?.phase ?? game.state.phase,
    x: game.verticalState?.x ?? null, y: game.verticalState?.y ?? null,
    firstSafePhase: game.verticalObstacles.length ? (game.verticalObstacles[0].x === 0 ? 1 : 0) : 0,
  });
}

// ---------------------------------------------------------------- boot
updateSoundButton();
updateVibrationButton();
showTitle();
const autoplay = params.get('autoplay');
if (autoplay) {
  const skip = params.get('skip');
  harnessPlay({
    bot: autoplay as any, seed: Number(params.get('seed')) || LEVEL_SEED, botSeed: Number(params.get('botSeed')) || 1,
    mode: (params.get('mode') as MenuMode) || 'challenge',
    skipTo: skip === null ? undefined : (isNaN(Number(skip)) ? skip as any : Number(skip)), after: Number(params.get('after')) || 0,
  });
}

class RunScene extends Phaser.Scene {
  constructor() { super('run'); }
  update(time: number) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) { lastFrame = 0; return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    view = { width: rect.width, height: rect.height, dpr };
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.scale.width !== width || this.scale.height !== height) this.scale.resize(width, height);
    if (game.verticalState) lastShaftSnapshot = game.verticalState;
    tick(time);
  }
}

new Phaser.Game({
  type: Phaser.CANVAS,
  canvas,
  width: canvas.clientWidth || 680,
  height: canvas.clientHeight || 480,
  transparent: true,
  clearBeforeRender: false,
  scale: { mode: Phaser.Scale.NONE },
  scene: RunScene,
  audio: { noAudio: true },
});
