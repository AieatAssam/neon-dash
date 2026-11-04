import { ART_PALETTES, GAMEPLAY_COLORS, UI_CSS_COLORS } from './src/art/palette';
import Phaser from 'phaser';
import { RunnerTrail, RUNNER_FACE, RUNNER_TRAIL_DURATION, RUNNER_TRAIL_SEGMENTS } from './runner-visuals';
import { challengeProgress, createGame, step, floorPulseState } from './core';
import { ACHIEVEMENTS, mergeProgress } from './achievements.js';
import { resultDetail } from './result-copy.js';
import { viewportWorldSize } from './viewport';
import { upcomingAction, PREVIEW_SECONDS } from './upcoming-action';
import { GlowCache, glowRasterMetrics } from './glow-cache';
import { BeatClock, beatEnvelope, musicPosition, musicNeedsSync } from './rhythm';
import { createCheckpoint, restoreCheckpoint, type PracticeCheckpoint } from './practice';
import { scrollingTiles, blendHex } from './src/art/scrolling-background';
import { drawShieldMark, SHIELD_CYAN } from './powerup-visuals';
import { collectShield } from './powerups';

for (const [name, color] of Object.entries(UI_CSS_COLORS)) document.documentElement.style.setProperty(name, color);

const $ = (id: string): any => document.getElementById(id);
const canvas = $('game') as HTMLCanvasElement;
const surface = canvas;
const ctx = surface.getContext('2d')!;
// The static backdrop is composited by the browser instead of copied into every frame.
let backdropKey = '';
// Cache soft bloom at up to 1.5 device pixels per CSS pixel; outlines are still
// drawn on the full-resolution canvas so their edges remain crisp while objects move.
// Limit pixel storage across viewport sizes as well as the number of entries.
const glowCache = new GlowCache<{ canvas: HTMLCanvasElement; pad: number }>(8 * 1024 * 1024, 128);
function drawGlow(key: string, x: number, y: number, w: number, h: number, blur: number, color: string, draw: (g: CanvasRenderingContext2D) => void) {
 const transform = ctx.getTransform();
 const { scale, radius } = glowRasterMetrics(Math.hypot(transform.a, transform.b), viewportMetrics.dpr, blur);
 const cacheKey = [key, w, h, scale, radius, color].join(':');
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
 ctx.drawImage(sprite.canvas, x - sprite.pad, y - sprite.pad, sprite.canvas.width / scale, sprite.canvas.height / scale);
}


let runSeed = Math.floor(Math.random() * 0x100000000);
let selectedMode: 'challenge' | 'endless' = 'challenge';
let game: any = createGame({ seed: runSeed, mode: selectedMode });
let mode = 'ready';
let attempt = 0;
let activePractice = false;
let checkpoints: PracticeCheckpoint[] = [];
let progress = { bestDistance: 0, challengeBest: 0, challengeWins: 0, runs: 0, unlocked: [] };
try { const saved = JSON.parse(localStorage.getItem('neon-dash-progress')); if (saved && typeof saved === 'object') progress = { ...progress, ...saved, unlocked: Array.isArray(saved.unlocked) ? saved.unlocked : [] }; } catch {}
let best = Math.floor((Number(progress.bestDistance) || 0) / 10);
let jumpHeld = false;
const jumpPointerIds = new Set<number>();
let keyboardJumpHeld = false;
let jumpQueued = false;
let phaseQueued = false;
let accumulator = 0;
let lastTime = 0;
let rotation = 0;
const runnerTrail = new RunnerTrail();
function resetRunnerTrail() {
 runnerTrail.reset();
 runnerTrail.record(game.state.time, game.state.distance + game.state.runner.x + game.state.runner.width / 2, game.state.runner.y + game.state.runner.height / 2);
}
let audioEnabled = false;
let visualEvent = { name: '', at: -10000 };
let renderedMeters = -1;
let renderedLevel = -1;
let renderedPhase = -1;
let renderedProgress = -1;
let renderedOrbs = -1;
let viewportMetrics = { width: 680, height: 480, dpr: 1 };
let renderDirty = true;
const CYAN = GAMEPLAY_COLORS.cyan;
const VIOLET = GAMEPLAY_COLORS.violet;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const touchControls = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const startHint = touchControls ? 'Tap PLAY to start' : 'press <kbd>SPACE</kbd> to start';
const retryHint = touchControls ? 'Tap to retry' : 'or press <kbd>SPACE</kbd> to restart';
document.querySelectorAll('.menu-controls').forEach(el => { if (touchControls) el.innerHTML = '<span>Tap to jump</span><span>Tap the colour button to switch</span>'; });
$('overlayHint').innerHTML = startHint;
$('overlayDescription').innerHTML = 'Jump spikes and gaps; land on platforms. Matching-color beacons pull during jumps.<br>Switch colors to stop the pull; switch to the opposite color to pass gates. Gravity stays down.<br>Collect cyan shields to block one spike or gate cluster. Gaps and falls still hurt.<br>Pink spikes always hurt.';
let vibrationEnabled = true;
try { vibrationEnabled = localStorage.getItem('neon-dash-vibration') !== 'off'; } catch {}
const vibrationButton = $('vibrationBtn');
function updateVibrationButton() {
 vibrationButton.hidden = typeof navigator.vibrate !== 'function';
 vibrationButton.setAttribute('aria-pressed', String(vibrationEnabled));
 vibrationButton.setAttribute('aria-label', vibrationEnabled ? 'Disable vibration' : 'Enable vibration');
}
updateVibrationButton();
vibrationButton.addEventListener('click', () => {
 vibrationEnabled = !vibrationEnabled;
 try { localStorage.setItem('neon-dash-vibration', vibrationEnabled ? 'on' : 'off'); } catch {}
 if (!vibrationEnabled && typeof navigator.vibrate === 'function') navigator.vibrate(0);
 updateVibrationButton();
});
function haptic(pattern) { if (vibrationEnabled && !reducedMotion && typeof navigator.vibrate === 'function') navigator.vibrate(pattern); }
const music = new Audio(new URL('./assets/space-city.mp3', import.meta.url).href);
music.loop = true;
music.volume = .35;
const beatClock = new BeatClock();
const soundEffects = {
 jump: new Audio(new URL('./assets/sfx/jump02.ogg', import.meta.url).href),
 phase: new Audio(new URL('./assets/sfx/coin02.ogg', import.meta.url).href),
 orb: new Audio(new URL('./assets/sfx/coin03.ogg', import.meta.url).href),
 shield: new Audio(new URL('./assets/sfx/coin02.ogg', import.meta.url).href),
 shieldPickup: new Audio(new URL('./assets/sfx/coin03.ogg', import.meta.url).href),
 death: new Audio(new URL('./assets/sfx/alarm.ogg', import.meta.url).href),
 win: new Audio(new URL('./assets/sfx/coin03.ogg', import.meta.url).href),
};
for (const sound of Object.values(soundEffects)) sound.volume = .45;
const phaseButton = document.createElement('button');
phaseButton.className = 'phase-button';
phaseButton.id = 'phaseBtn';
phaseButton.hidden = true;
phaseButton.innerHTML = touchControls ? '<span>◈</span> CYAN' : '<span>◈</span> CYAN <kbd>X</kbd>';
phaseButton.setAttribute('aria-label', touchControls ? 'Switch phase. Cyan is active.' : 'Switch phase. Cyan is active. Keyboard X or Shift.');
$('viewport').append(phaseButton);
const phaseHint = document.createElement('span');
phaseHint.className = 'phase-help';
phaseHint.hidden = true;
phaseHint.textContent = touchControls ? 'TAP COLOUR BUTTON TO MATCH BEACON PULL' : 'X / SHIFT · MATCH BEACON COLOR TO FEEL ITS PULL';
$('viewport').append(phaseHint);
function updateBest() {
 $('bestLabel').textContent = selectedMode === 'challenge' ? 'BEST' : 'BEST';
 $('best').innerHTML = selectedMode === 'challenge' ? `${progress.challengeBest || 0}<span>%</span>` : `${best}<span>m</span>`;
}
updateBest();
function showObjective(newUnlocks = []) {
 const next = ACHIEVEMENTS.find(a => !progress.unlocked.includes(a.id));
 const unlocked = ACHIEVEMENTS.filter(a => newUnlocks.includes(a.id));
 const describe = text => text.replace(/(\d+) units/g, (_, n) => `${Number(n) / 10}m`).replace('neutral spikes', 'pink spikes');
 $('achievementUnlock').textContent = unlocked.length ? `✦ UNLOCKED · ${unlocked.map(a => a.name).join(' + ')}` : `${progress.unlocked.length} / ${ACHIEVEMENTS.length} ACHIEVEMENTS`;
 $('achievementGoal').textContent = next ? `NEXT · ${next.name.toUpperCase()} — ${describe(next.description)}` : 'ALL SIGNALS FOUND · CHASE A NEW BEST';
}
showObjective();

function syncMusic(force = false) {
 if (!audioEnabled || mode !== 'running' || music.readyState === 0 || music.seeking) return;
 if (force || musicNeedsSync(music.currentTime, game.state.time, music.duration)) {
  try { music.currentTime = musicPosition(game.state.time, music.duration); } catch {}
 }
}
function playMusic() {
 if (audioEnabled && mode === 'running') {
  syncMusic(true);
  music.play().then(() => syncMusic()).catch(() => {});
 }
}
function playSfx(name) {
 visualEvent = { name, at: performance.now() };
 haptic(name === 'death' ? [35, 35, 65] : name === 'win' ? [25, 45, 25, 45, 70] : name === 'orb' ? 18 : name === 'phase' ? 15 : 8);
 if (!audioEnabled) return;
 const sound = soundEffects[name];
 sound.currentTime = 0;
 sound.play().catch(() => {});
}
function updatePracticeControls() {
 $('practiceBadge').hidden = !activePractice;
 $('practiceControls').hidden = !activePractice || mode !== 'running';
 $('checkpointCount').textContent = `${checkpoints.length} checkpoint${checkpoints.length === 1 ? '' : 's'}`;
 $('removeCheckpointBtn').disabled = checkpoints.length === 0;
}
function clearJumpInput() {
 jumpPointerIds.clear(); keyboardJumpHeld = false; jumpHeld = false;
}
function start(newCircuit = false, preserveJumpInput = false) {
 if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
 activePractice = $('practiceMode').checked; checkpoints = [];
 if (newCircuit) runSeed = Math.floor(Math.random() * 0x100000000);
 game = createGame({ seed: runSeed, mode: selectedMode }); renderedProgress = -1; renderedMeters = -1; renderedLevel = -1; mode = 'running'; attempt++; accumulator = 0; rotation = 0;
 renderDirty = true; lastTime = 0; resetRunnerTrail();
 if (preserveJumpInput) jumpHeld = jumpPointerIds.size > 0 || keyboardJumpHeld; else clearJumpInput();
 jumpQueued = false; phaseQueued = false; music.currentTime = 0; beatClock.reset();
 $('attempt').textContent = String(attempt).padStart(2, '0');
 $('overlay').hidden = true; $('pauseOverlay').hidden = true; $('freshBtn').hidden = true; $('pauseBtn').style.display = 'block';
 phaseButton.hidden = false; phaseHint.hidden = false; $('jumpBtn').hidden = false;
 updatePracticeControls();
 $('status').textContent = touchControls ? `Attempt ${attempt}. Tap to jump. Tap the colour button to switch.` : `Attempt ${attempt}. Jump with Space. Switch phase with X.`;
 playMusic();
}
function pause() {
 if (mode === 'running') { clearJumpInput(); phaseButton.hidden = true; phaseHint.hidden = true; $('jumpBtn').hidden = true; mode = 'paused'; $('pauseOverlay').hidden = false; music.pause(); $('pauseBtn').setAttribute('aria-label', 'Resume game'); $('pauseBtn').setAttribute('aria-pressed', 'true'); $('resumeBtn').focus(); updatePracticeControls(); }
 else if (mode === 'paused') { phaseButton.hidden = false; phaseHint.hidden = false; $('jumpBtn').hidden = false; mode = 'running'; renderDirty = true; lastTime = 0; $('pauseOverlay').hidden = true; $('pauseBtn').setAttribute('aria-label', 'Pause game'); $('pauseBtn').setAttribute('aria-pressed', 'false'); $('pauseBtn').focus(); updatePracticeControls(); playMusic(); }
}
function finish() {
 const distance = meters();
 const previousUnlocks = progress.unlocked;
 const challengePercent = mode === 'won' || game.state.status === 'won' ? 100 : challengeProgress(game.state.distance, game.config.runnerX, game.config.finishX);
 if (!activePractice) {
  progress = mergeProgress(progress, game.state, selectedMode, challengePercent);
  best = Math.floor(progress.bestDistance / 10);
  try { localStorage.setItem('neon-dash-progress', JSON.stringify(progress)); } catch {}
 }
 showObjective(activePractice ? [] : progress.unlocked.filter(id => !previousUnlocks.includes(id)));
 updateBest();
 mode = game.state.status;
 updatePracticeControls();
 renderDirty = true;
 playSfx(mode === 'won' ? 'win' : 'death');
 music.pause();
 $('overlay').hidden = false; $('pauseBtn').style.display = 'none'; $('pauseBtn').setAttribute('aria-label', 'Pause game'); $('pauseBtn').setAttribute('aria-pressed', 'false');
 phaseButton.hidden = true; phaseHint.hidden = true; $('jumpBtn').hidden = true;
 $('overlayKicker').textContent = activePractice ? 'PRACTICE COMPLETE · NO RECORDS SAVED' : mode === 'won' ? 'CHALLENGE COMPLETE · MEDAL EARNED' : resultDetail({ mode: selectedMode, attempt, distance, level: game.state.level, challengePercent });
 $('overlayTitle').textContent = mode === 'won' ? 'COMPLETE!' : 'TRY AGAIN';
 $('overlayDescription').innerHTML = activePractice ? `PRACTICE RUN COMPLETE · ${game.state.stats.orbs} ORBS COLLECTED<br>Official records and achievements are unchanged.` : mode === 'won' ? `🏅 FINISHER MEDAL · ${game.state.stats.orbs} ORBS COLLECTED<br>Challenge complete! Ready for another run?` : `PINK SPIKES ARE ALWAYS DANGEROUS · ${game.state.stats?.cleared || 0} CLEARED · ${game.state.stats.orbs} ORBS<br>Practice the same circuit or choose a random one.`;
 $('playLabel').textContent = 'RETRY SAME CIRCUIT';
 $('freshBtn').hidden = false;
 $('seedText').textContent = `CIRCUIT SEED · ${runSeed}`;
 $('overlayHint').innerHTML = retryHint;
 $('status').textContent = mode === 'won' ? (touchControls ? 'Level complete! Tap to play again.' : 'Level complete! Press Space to play again.') : `Run ended at ${distance} meters. ${touchControls ? 'Tap to try again.' : 'Press Space to try again.'}`;
}
if (import.meta.env.DEV) {
 (window as any).__layoutTestState = (state: 'dead' | 'won') => { game.state.status = state; finish(); };
 (window as any).__setBackdropDistance = (distance: number) => { game.state.distance = distance; renderDirty = true; };
 (window as any).__setTestTerrain = (terrain: import('./core').Terrain[]) => { game.state.terrain = terrain; renderDirty = true; };
 (window as any).__setShieldCharged = (charged = true) => {
  game.state.powerUps = charged ? collectShield(game.state.powerUps) : { ...game.state.powerUps, shieldCharges: 0 };
  renderDirty = true;
 };
 (window as any).__touchTestState = () => ({ phase: game.state.phase, jumps: game.state.stats.jumps, runnerY: game.state.runner.y, jumpHeld });
}
function meters() { return Math.floor(game.state.distance / 10); }
function jump() { if (mode === 'ready' || mode === 'dead' || mode === 'won') start(false, true); if (mode === 'running') jumpQueued = true; }
function showTitle() {
 mode = 'ready'; activePractice = false; checkpoints = []; accumulator = 0; lastTime = 0;
 clearJumpInput(); jumpQueued = false; phaseQueued = false; music.pause();
 $('overlay').hidden = false; $('pauseOverlay').hidden = true; $('pauseBtn').style.display = 'none';
 $('pauseBtn').setAttribute('aria-label', 'Pause game'); $('pauseBtn').setAttribute('aria-pressed', 'false');
 phaseButton.hidden = true; phaseHint.hidden = true; $('jumpBtn').hidden = true; updatePracticeControls();
 runSeed = Math.floor(Math.random() * 0x100000000);
 attempt = 0; $('attempt').textContent = '01';
 game = createGame({ seed: runSeed, mode: selectedMode });
 rotation = 0; resetRunnerTrail();
 renderDirty = true;
 renderedProgress = -1; renderedMeters = -1; renderedLevel = -1;
 $('overlayKicker').textContent = selectedMode === 'challenge' ? 'CHALLENGE / REACH THE FINISH' : 'ENDLESS / GO FOR DISTANCE';
 $('overlayTitle').textContent = 'NEON DASH';
 $('overlayDescription').innerHTML = 'Jump spikes and gaps; land on platforms. Matching-color beacons pull during jumps.<br>Switch colors to stop the pull; switch to the opposite color to pass gates. Gravity stays down.<br>Collect cyan shields to block one spike or gate cluster. Gaps and falls still hurt.<br>Pink spikes always hurt.';
 $('playLabel').textContent = 'PLAY'; $('freshBtn').hidden = true; $('seedText').textContent = '';
 $('overlayHint').innerHTML = startHint; updateBest();
}
document.querySelectorAll<HTMLInputElement>('input[name=gameMode]').forEach(input => input.addEventListener('change', () => {
 selectedMode = input.value as 'challenge' | 'endless'; showTitle();
}));
$('titleBtn').addEventListener('click', () => { showTitle(); $('playBtn').focus(); });
$('checkpointBtn').addEventListener('click', () => {
 if (!activePractice || mode !== 'running') return;
 $('checkpointBtn').blur();
 const checkpoint = createCheckpoint(game);
 if (checkpoint) { checkpoints.push(checkpoint); updatePracticeControls(); $('status').textContent = `Checkpoint ${checkpoints.length} saved.`; }
});
$('removeCheckpointBtn').addEventListener('click', () => {
 if (!activePractice || mode !== 'running' || !checkpoints.length) return;
 $('removeCheckpointBtn').blur();
 checkpoints.pop(); updatePracticeControls(); $('status').textContent = 'Last checkpoint removed.';
});
function practiceRespawn() {
 const restored = checkpoints.length ? restoreCheckpoint(checkpoints[checkpoints.length - 1]) : null;
 game = restored || createGame({ seed: runSeed, mode: selectedMode });
 attempt++; $('attempt').textContent = String(attempt).padStart(2, '0');
 resetRunnerTrail();
 accumulator = 0; lastTime = 0; clearJumpInput(); jumpQueued = false; phaseQueued = false; rotation = 0;
 renderedProgress = -1; renderedMeters = -1; renderedLevel = -1; renderedOrbs = -1; renderDirty = true;
 beatClock.reset(); syncMusic(true);
 $('status').textContent = restored ? `Attempt ${attempt}. Returned to checkpoint.` : `Attempt ${attempt}. Returned to start.`;
}
$('playBtn').addEventListener('click', () => start(false));
$('freshBtn').addEventListener('click', () => start(true));
$('restartBtn').addEventListener('click', () => start(false));
$('pauseBtn').addEventListener('click', pause);
$('resumeBtn').addEventListener('click', pause);
 $('jumpBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); jumpPointerIds.add(e.pointerId); jumpHeld = true; jump(); });
phaseButton.addEventListener('click', e => { e.stopPropagation(); if (mode === 'running') phaseQueued = true; });
$('soundBtn').addEventListener('click', () => {
 if (audioEnabled && !music.paused) beatClock.sample(game.state.time, music.currentTime);
 audioEnabled = !audioEnabled;
 $('soundBtn').textContent = audioEnabled ? '♫' : '♪';
 $('soundBtn').setAttribute('aria-label', audioEnabled ? 'Mute sound' : 'Enable sound');
 $('soundBtn').setAttribute('aria-pressed', String(audioEnabled));
 if (audioEnabled) playMusic(); else music.pause();
});
window.addEventListener('keydown', e => {
 if (['Space', 'ArrowUp', 'KeyW', 'KeyX', 'ShiftLeft', 'ShiftRight', 'KeyP', 'Escape', 'KeyR'].includes(e.code)) {
  if ((e.target instanceof HTMLButtonElement && e.code === 'Space') || e.target instanceof HTMLInputElement) return;
  e.preventDefault(); if (e.repeat) return;
  if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { keyboardJumpHeld = true; jumpHeld = true; jump(); }
  else if (['KeyX','ShiftLeft','ShiftRight'].includes(e.code)) { if (mode === 'running') phaseQueued = true; }
  else if (e.code === 'KeyR') start(); else pause();
 }
});
window.addEventListener('keyup', e => { if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { keyboardJumpHeld = false; jumpHeld = jumpPointerIds.size > 0; } });
canvas.addEventListener('pointerdown', e => { e.preventDefault(); jumpPointerIds.add(e.pointerId); jumpHeld = true; jump(); });
window.addEventListener('pointerup', e => { jumpPointerIds.delete(e.pointerId); jumpHeld = jumpPointerIds.size > 0 || keyboardJumpHeld; });
window.addEventListener('pointercancel', e => { jumpPointerIds.delete(e.pointerId); jumpHeld = jumpPointerIds.size > 0 || keyboardJumpHeld; });
window.addEventListener('blur', () => { jumpPointerIds.clear(); keyboardJumpHeld = false; jumpHeld = false; if (mode === 'running') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'running') pause(); });

function render(time) {
 const { width, height } = viewportMetrics;
 const worldOffsetY = height * (viewportMetrics.width < 500 ? .62 : .72) - game.config.groundY;
 ctx.setTransform(surface.width/width,0,0,surface.height/height,0,0);
 const s = game.state;
 const c = game.config;
 const glowUnit = c.runnerWidth * surface.width / width;
 const color = s.phase === 0 ? CYAN : VIOLET;
 if (renderedPhase !== s.phase) {
  document.documentElement.style.setProperty('--phase', color);
  renderedPhase = s.phase;
 }
 const clock = reducedMotion ? 0 : time * .001;
 const beatTime = beatClock.sample(s.time, audioEnabled && !music.paused ? music.currentTime : undefined);
 const pulse = reducedMotion ? 1 : .82 + beatEnvelope(beatTime) * .18;
 const section = Math.floor(s.distance / 4800);
 const currentPalette = ART_PALETTES[section % ART_PALETTES.length];
 const nextPalette = ART_PALETTES[(section + 1) % ART_PALETTES.length];
 const fade = Math.round(Math.max(0, (s.distance % 4800 - 3600) / 1200) * 64) / 64;
 const palette = { ...currentPalette, ...Object.fromEntries(['top', 'horizon', 'floor', 'pink', 'blue'].map(key => [key, blendHex(currentPalette[key], nextPalette[key], fade)])) };
 const key = `${canvas.clientWidth}:${canvas.clientHeight}:${worldOffsetY}:${palette.top}:${palette.horizon}:${palette.floor}:${palette.pink}:${palette.blue}`;
 if (key !== backdropKey) {
  const groundPx = (worldOffsetY + c.groundY) * canvas.clientHeight / height;
  const floorEndPx = (worldOffsetY + height) * canvas.clientHeight / height;
  canvas.style.background = `linear-gradient(to bottom, transparent ${groundPx}px, ${palette.floor} ${groundPx}px, ${GAMEPLAY_COLORS.void} ${floorEndPx}px), radial-gradient(circle ${canvas.clientWidth * .65}px at 65% 48%, ${palette.pink}28 0%, ${palette.blue}0d 48%, ${palette.blue}00 100%), linear-gradient(to bottom, ${palette.top} 0%, ${palette.horizon} 70%, ${palette.floor} 100%)`;
  backdropKey = key;
 }
 ctx.clearRect(0, 0, width, height);
 const cameraX = canvas.clientWidth / canvas.clientHeight < .75 ? Math.min(0, width * .16 - c.runnerX) : 0;
 ctx.save(); ctx.translate(cameraX, worldOffsetY);
 // Monumental rings and angular skylines remain behind the collision silhouettes.
 for (const tile of scrollingTiles(s.distance * .07 - width * .68, width, 235, 1, 1)) {
  const i = tile.index;
  const x = tile.x;
  const y = 92 + tile.seed * 56;
  ctx.strokeStyle = i % 2 ? palette.blue + '42' : palette.pink + '52';
  ctx.lineWidth = i % 3 === 0 ? 2 : 1;
  ctx.beginPath(); ctx.arc(x, y, 83 + tile.seed * 20, Math.PI * 1.08, Math.PI * 2.84); ctx.stroke();
  ctx.strokeStyle = palette.blue + '70';
  ctx.beginPath(); ctx.arc(x, y, 89 + tile.seed * 20, Math.PI * 1.15, Math.PI * 1.35); ctx.stroke();
 }
 for (const tile of scrollingTiles(s.distance, width - cameraX, 110, .18, 1)) {
  const i = tile.index;
  const x = tile.x;
  const h = 55 + tile.seed * 84;
  ctx.fillStyle = GAMEPLAY_COLORS.void + 'd9';
  ctx.strokeStyle = (i % 2 ? palette.blue : palette.pink) + '65'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, c.groundY); ctx.lineTo(x, c.groundY - h);
  ctx.lineTo(x + 30, c.groundY - h - 22); ctx.lineTo(x + 76, c.groundY - h - 22); ctx.lineTo(x + 76, c.groundY); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = (i % 3 ? palette.blue : palette.pink) + '88';
  ctx.beginPath(); ctx.moveTo(x + 13, c.groundY - h + 9); ctx.lineTo(x + 13, c.groundY - 17); ctx.lineTo(x + 29, c.groundY - 17); ctx.stroke();
  ctx.fillStyle = palette.blue + '77'; ctx.fillRect(x + 52, c.groundY - h, 4, 4);
 }
 ctx.lineWidth = .7; ctx.strokeStyle = palette.blue + '22';
 ctx.beginPath();
 for (let x = -(s.distance * .32 % 65); x < width; x += 65) { ctx.moveTo(x, -worldOffsetY); ctx.lineTo(x, c.groundY); }
 ctx.stroke(); ctx.beginPath();
 for (let y = -worldOffsetY; y < c.groundY; y += 65) { ctx.moveTo(0, y); ctx.lineTo(width - cameraX, y); }
 ctx.stroke();
 // Cut holes in the runway so gaps remain legible against the background.
 ctx.save(); ctx.beginPath();
 let floorStart = 0;
 const worldRight = width - cameraX;
 // Terrain is appended in world order by the simulation. Avoid allocating and
 // sorting a filtered copy on every animation frame.
 for (const gap of s.terrain) {
  if (gap.kind !== 'gap') continue;
  const left = Math.max(0, Math.min(worldRight, gap.x - s.distance));
  const right = Math.max(0, Math.min(worldRight, gap.x + gap.width - s.distance));
  if (right <= floorStart || left >= worldRight) continue;
  ctx.rect(floorStart, c.groundY - 2, Math.max(0, left - floorStart), height);
  floorStart = right;
 }
 ctx.rect(floorStart, c.groundY - 2, Math.max(0, worldRight - floorStart), height); ctx.clip();
 ctx.strokeStyle = palette.pink + '58'; ctx.lineWidth = 1;
 ctx.beginPath();
 for (let x = -(s.distance % 70); x < width + 100; x += 70) { ctx.moveTo(x, c.groundY + 10); ctx.lineTo(x - 95, height); }
 ctx.stroke(); ctx.beginPath();
 for (let y = c.groundY + 18; y < height; y += 30) { ctx.moveTo(0, y); ctx.lineTo(width - cameraX, y); }
 ctx.stroke();
 // A hot white core and wide bloom make the runway read as emitted light.
 ctx.save();
 drawGlow('floor', 0, c.groundY + .5, worldRight, 0, glowUnit * pulse, color, g => { g.strokeStyle = color; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(worldRight, 0); g.stroke(); });
 ctx.strokeStyle = color; ctx.lineWidth = 3;
 ctx.beginPath(); ctx.moveTo(0, c.groundY + .5); ctx.lineTo(worldRight, c.groundY + .5); ctx.stroke();
 ctx.shadowBlur = 0; ctx.lineWidth = 1; ctx.strokeStyle = GAMEPLAY_COLORS.white; ctx.stroke();
 ctx.globalAlpha = .35; ctx.strokeStyle = palette.pink; ctx.beginPath(); ctx.moveTo(0, c.groundY + 7); ctx.lineTo(worldRight, c.groundY + 7); ctx.stroke(); ctx.restore();
 ctx.restore();
 for (const terrain of s.terrain) {
  const x = terrain.x - s.distance; if (x < -terrain.width || x > worldRight) continue;
  ctx.save();
  if (terrain.kind === 'gap') {
   ctx.fillStyle = GAMEPLAY_COLORS.void; ctx.fillRect(x, c.groundY, terrain.width, height);
   ctx.strokeStyle = GAMEPLAY_COLORS.danger; ctx.lineWidth = 2; ctx.beginPath();
   ctx.moveTo(x, c.groundY); ctx.lineTo(x, c.groundY + 12);
   ctx.moveTo(x + terrain.width, c.groundY); ctx.lineTo(x + terrain.width, c.groundY + 12); ctx.stroke();
  } else {
   drawGlow('platform', x, c.groundY - terrain.height, terrain.width, terrain.height, glowUnit * .5, GAMEPLAY_COLORS.platform, g => { g.fillStyle = GAMEPLAY_COLORS.platformFill; g.strokeStyle = GAMEPLAY_COLORS.platform; g.lineWidth = 2; g.fillRect(0, 0, terrain.width, terrain.height); g.strokeRect(0, 0, terrain.width, terrain.height); });
   ctx.fillStyle = GAMEPLAY_COLORS.platformFill; ctx.strokeStyle = GAMEPLAY_COLORS.platform; ctx.lineWidth = 2;
   ctx.fillRect(x, c.groundY - terrain.height, terrain.width, terrain.height);
   ctx.strokeRect(x, c.groundY - terrain.height, terrain.width, terrain.height);
   ctx.shadowBlur = 0; ctx.strokeStyle = GAMEPLAY_COLORS.white; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 3, c.groundY - terrain.height + 3); ctx.lineTo(x + terrain.width - 3, c.groundY - terrain.height + 3); ctx.stroke();
  }
  ctx.restore();
 }
 for (const field of s.attractionFields) {
  const x = field.x - s.distance; if (x < -field.radius - 20 || x > worldRight + field.radius + 20) continue;
  const fieldColor = field.phase === 0 ? CYAN : VIOLET;
  const active = field.phase === s.phase;
  ctx.save(); ctx.translate(x, field.y);
  ctx.globalAlpha = active ? .82 : .32;
  ctx.strokeStyle = fieldColor; ctx.fillStyle = fieldColor; ctx.lineWidth = 2;
  ctx.setLineDash(active ? [7, 5] : [3, 7]);
  ctx.beginPath(); ctx.arc(0, 0, field.radius, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalAlpha = active ? .12 : .04;
  ctx.beginPath(); ctx.arc(0, 0, field.radius - 3, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = active ? 1 : .45;
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
  // Four inward chevrons distinguish an attraction zone from a collision ring.
  for (const [sx, sy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
   const ax = sx * field.radius * .68, ay = sy * field.radius * .68;
   ctx.beginPath(); ctx.moveTo(ax + (sx ? -sx : -5), ay + (sy ? -5 : -sy));
   ctx.lineTo(ax - sx * 8, ay - sy * 8);
   ctx.lineTo(ax + (sx ? -sx : 5), ay + (sy ? 5 : -sy)); ctx.stroke();
  }
  const fieldLabelSize = Math.max(12, 12 * width / canvas.getBoundingClientRect().width);
  ctx.font = `bold ${fieldLabelSize}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(active ? 'MATCH' : 'OFF', 0, -field.radius - 12);
  ctx.restore();
 }
 for (const obstacle of s.obstacles) {
  if (obstacle.shielded) continue;
  const x = obstacle.x - s.distance; if (x < -60 || x > worldRight + 60) continue;
  if (obstacle.kind === 'pulse') {
   const pulseState = floorPulseState(obstacle, s.time);
   const warning = pulseState === 'warning';
   const active = pulseState === 'active';
   ctx.save();
   ctx.strokeStyle = GAMEPLAY_COLORS.danger;
   ctx.fillStyle = active || warning ? GAMEPLAY_COLORS.danger : GAMEPLAY_COLORS.off;
   ctx.lineWidth = 2;
   ctx.globalAlpha = active || warning ? 1 : .55;
   ctx.fillRect(x, c.groundY - (active ? obstacle.height : 4), obstacle.width, active ? obstacle.height : 4);
   if (active) {
    ctx.strokeStyle = GAMEPLAY_COLORS.white;
    ctx.strokeRect(x, c.groundY - obstacle.height, obstacle.width, obstacle.height);
   } else if (warning) {
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x, c.groundY - obstacle.height, obstacle.width, obstacle.height);
    ctx.setLineDash([]);
    const labelSize = Math.max(12, 12 * viewportMetrics.width / canvas.getBoundingClientRect().width);
    ctx.font = `bold ${labelSize}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('JUMP ↑', x + obstacle.width / 2, c.groundY - obstacle.height - 8);
   }
   ctx.restore();
   continue;
  }
  const neutral = obstacle.phase == null;
  const active = neutral || obstacle.phase === s.phase; const oc = neutral ? GAMEPLAY_COLORS.danger : obstacle.phase === 0 ? CYAN : VIOLET;
  ctx.save(); ctx.globalAlpha = 1; if (!active) ctx.setLineDash([4, 3]);
  if (active) drawGlow(obstacle.kind, x, c.groundY - obstacle.height, obstacle.width, obstacle.height, glowUnit * .85 * pulse, oc, g => {
   const gradient = g.createLinearGradient(0, 0, 0, obstacle.height); gradient.addColorStop(0, oc + 'bb'); gradient.addColorStop(1, oc + '18');
   g.fillStyle = gradient; g.strokeStyle = oc; g.lineWidth = 2.6; g.beginPath();
   if (obstacle.kind === 'gate') g.rect(0, 0, obstacle.width, obstacle.height);
   else { g.moveTo(0, obstacle.height); g.lineTo(obstacle.width / 2, 0); g.lineTo(obstacle.width, obstacle.height); g.closePath(); }
   g.fill(); g.stroke();
  });
  ctx.strokeStyle = active ? oc : GAMEPLAY_COLORS.off;
  if (!active) {
   const fill = ctx.createLinearGradient(x, c.groundY - obstacle.height, x, c.groundY);
   fill.addColorStop(0, oc + '16'); fill.addColorStop(1, oc + '08');
   ctx.fillStyle = fill;
  }
  ctx.lineWidth = active ? 2.6 : 1.2;
  ctx.beginPath();
  if (obstacle.kind === 'gate') {
   ctx.rect(x, c.groundY - obstacle.height, obstacle.width, obstacle.height);
  } else {
   ctx.moveTo(x, c.groundY); ctx.lineTo(x + obstacle.width / 2, c.groundY - obstacle.height); ctx.lineTo(x + obstacle.width, c.groundY); ctx.closePath();
  }
  // Active sprites already contain their translucent fill; draw only the crisp contour again.
  if (!active) ctx.fill();
  ctx.stroke();
  if (obstacle.kind === 'gate') {
   ctx.shadowBlur = 0; ctx.strokeStyle = oc; ctx.lineWidth = 1;
   for (let y = c.groundY - obstacle.height + 12; y < c.groundY - 5; y += 18) { ctx.beginPath(); ctx.moveTo(x + 4, y); ctx.lineTo(x + obstacle.width - 4, y + 7); ctx.stroke(); }
  }
  if (active) { ctx.shadowBlur = 0; ctx.strokeStyle = GAMEPLAY_COLORS.white; ctx.lineWidth = .8; ctx.stroke(); ctx.fillStyle = GAMEPLAY_COLORS.white; ctx.fillRect(x + obstacle.width / 2 - 1, c.groundY - obstacle.height + 6, 2, 8); }
  ctx.restore();
 }
 for (const orb of s.collectibles) {
  const x = orb.x - s.distance;
  if (x < -orb.radius - 20 || x > worldRight + orb.radius + 20) continue;
  const bob = reducedMotion ? 0 : Math.sin(clock * 4 + orb.x * .02) * 3;
  ctx.save(); ctx.translate(x, orb.y + bob); ctx.rotate(Math.PI / 4 + (reducedMotion ? 0 : Math.sin(clock * 2 + orb.x) * .12));
  drawGlow('orb', -orb.radius * .65, -orb.radius * .65, orb.radius * 1.3, orb.radius * 1.3, glowUnit * .7 * pulse, GAMEPLAY_COLORS.gold, g => { g.fillStyle = GAMEPLAY_COLORS.reward; g.strokeStyle = GAMEPLAY_COLORS.gold; g.lineWidth = 2; g.fillRect(0, 0, orb.radius * 1.3, orb.radius * 1.3); g.strokeRect(0, 0, orb.radius * 1.3, orb.radius * 1.3); });
  ctx.fillStyle = GAMEPLAY_COLORS.reward; ctx.strokeStyle = GAMEPLAY_COLORS.gold; ctx.lineWidth = 2;
  ctx.fillRect(-orb.radius * .65, -orb.radius * .65, orb.radius * 1.3, orb.radius * 1.3); ctx.strokeRect(-orb.radius * .65, -orb.radius * .65, orb.radius * 1.3, orb.radius * 1.3);
  ctx.shadowBlur = 0; ctx.fillStyle = GAMEPLAY_COLORS.white; ctx.fillRect(-2, -2, 4, 4); ctx.restore();
 }
 for (const pickup of s.shieldPickups) {
  const x = pickup.x - s.distance;
  if (x < -pickup.radius - 20 || x > worldRight + pickup.radius + 20) continue;
  const bob = reducedMotion ? 0 : Math.sin(clock * 4 + pickup.x * .02) * 3;
  const y = pickup.y + bob;
  drawGlow('shield-pickup', x - pickup.radius, y - pickup.radius, pickup.radius * 2, pickup.radius * 2,
   glowUnit * .8 * pulse, SHIELD_CYAN, g => drawShieldMark(g, pickup.radius, pickup.radius, pickup.radius * 1.7));
  drawShieldMark(ctx, x, y, pickup.radius * 1.7);
 }
 const finishX=c.finishX-s.distance;if(Number.isFinite(c.finishX)&&finishX<worldRight){ctx.strokeStyle=GAMEPLAY_COLORS.platform;ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(finishX,70);ctx.lineTo(finishX,c.groundY);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=GAMEPLAY_COLORS.platform;ctx.font=`${Math.max(9, 12 * width / (canvas.clientWidth || 1))}px sans-serif`;ctx.fillText('FINISH',finishX-15,60);}
 const r=s.runner;
 if(mode==='running'){
  // Draw newest-to-oldest layers from the same fixed-step positions used by simulation.
  // Overlapping tapered squares create a continuous ribbon without per-frame allocations.
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(let i=RUNNER_TRAIL_SEGMENTS;i>=1;i--){
   const age=RUNNER_TRAIL_DURATION*i/RUNNER_TRAIL_SEGMENTS;
   const sample=runnerTrail.at(s.time-age);if(!sample)continue;
   const fade=1-i/(RUNNER_TRAIL_SEGMENTS+1), size=r.width*(.42+.58*fade);
   ctx.globalAlpha=(reducedMotion?.1:.32)*fade;
   ctx.fillStyle=color;
   ctx.fillRect(sample.x-s.distance-size/2,sample.y-size/2,size,size);
   if(!reducedMotion && i%3===1){ctx.globalAlpha=.12*fade;ctx.fillRect(sample.x-s.distance-size*.28,sample.y-size*.28,size*.56,size*.56);}
  }
  ctx.restore();
 }
 if(!reducedMotion && !r.grounded && mode==='running')rotation+=.045;else if(r.grounded)rotation=Math.round(rotation/(Math.PI/2))*Math.PI/2;
 ctx.save();ctx.translate(r.x+r.width/2,r.y+r.height/2);ctx.rotate(rotation);
 const runnerFill=s.phase===0?GAMEPLAY_COLORS.runnerCyanFill:GAMEPLAY_COLORS.runnerVioletFill;
 drawGlow('runner', -r.width/2, -r.height/2, r.width, r.height, glowUnit*pulse, color, g => { g.fillStyle=runnerFill; g.strokeStyle=color; g.lineWidth=3; g.fillRect(0,0,r.width,r.height); g.strokeRect(0,0,r.width,r.height); });
 ctx.fillStyle=runnerFill;ctx.strokeStyle=color;ctx.lineWidth=3;
 ctx.fillRect(-r.width/2,-r.height/2,r.width,r.height);ctx.strokeRect(-r.width/2,-r.height/2,r.width,r.height);
 ctx.shadowBlur=0;ctx.strokeStyle=GAMEPLAY_COLORS.white;ctx.lineWidth=1;ctx.strokeRect(-r.width/2+3,-r.height/2+3,r.width-6,r.height-6);
 ctx.fillStyle=GAMEPLAY_COLORS.white;for(const [x,y,w,h] of RUNNER_FACE)ctx.fillRect(x,y,w,h);ctx.restore();
 // Colored sparks drift independently of the world; counts stay fixed on mobile.
 for(let i=0;i<24;i++){
  ctx.fillStyle=[CYAN,palette.pink,GAMEPLAY_COLORS.platform,palette.blue][i%4];ctx.globalAlpha=.25+(i%3)*.13;
  const x=(i*137+width-(s.distance*.12+clock*9)%width)%width;
  const y=15+(i*43)%255+Math.sin(clock+i)*4;
  ctx.fillRect(x,y,i%5===0?3:1.5,i%5===0?3:1.5);
 }ctx.globalAlpha=1;
 const effectAge=(time-visualEvent.at)/1000;
 if(!reducedMotion && effectAge>=0 && effectAge<.5 && ['phase','death','win','orb','shield','shieldPickup'].includes(visualEvent.name)){
  ctx.save();ctx.globalAlpha=(1-effectAge*2)*.65;ctx.strokeStyle=visualEvent.name==='death'?palette.pink:visualEvent.name==='orb'?GAMEPLAY_COLORS.gold:visualEvent.name==='shieldPickup'?SHIELD_CYAN:visualEvent.name==='shield'?GAMEPLAY_COLORS.white:color;ctx.lineWidth=2;
  const cx=r.x+r.width/2,cy=r.y+r.height/2;
  for(let i=0;i<12;i++){const angle=i*Math.PI/6;const radius=18+effectAge*130;ctx.beginPath();ctx.moveTo(cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius);ctx.lineTo(cx+Math.cos(angle)*(radius+9),cy+Math.sin(angle)*(radius+9));ctx.stroke();}ctx.restore();
 }
 ctx.restore();
 // Portrait framing keeps the runner readable; preview offscreen actions below the runway.
 if (mode === 'running' && canvas.clientWidth / canvas.clientHeight < .75) {
  const cue = upcomingAction(game);
  if (cue) {
   const unit = width / canvas.clientWidth;
   const cueY = height * .62 + 48 * unit;
   const cueWidth = 236 * unit;
   ctx.save();
   ctx.fillStyle = GAMEPLAY_COLORS.void; ctx.globalAlpha = .88;
   ctx.fillRect((width - cueWidth) / 2, cueY - 17 * unit, cueWidth, 36 * unit);
   ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
   ctx.font = `600 ${12 * unit}px sans-serif`; ctx.fillStyle = GAMEPLAY_COLORS.white;
   ctx.fillText(`AHEAD · ${cue.label}`, width / 2, cueY - 3 * unit);
   ctx.fillStyle = GAMEPLAY_COLORS.white; ctx.globalAlpha = .25;
   ctx.fillRect((width - cueWidth) / 2 + 12 * unit, cueY + 10 * unit, cueWidth - 24 * unit, 2 * unit);
   ctx.globalAlpha = 1;
   ctx.fillRect((width - cueWidth) / 2 + 12 * unit, cueY + 10 * unit, (cueWidth - 24 * unit) * (1 - cue.seconds / PREVIEW_SECONDS), 2 * unit);
   ctx.restore();
  }
 }
 const level=s.level || 1;const levelProgress=selectedMode === 'challenge' ? challengeProgress(s.distance, c.runnerX, c.finishX) : (s.time % 20)/20*100;
 if (Math.floor(levelProgress) !== renderedProgress) {
  renderedProgress = Math.floor(levelProgress);
  $('progressFill').style.width=`${renderedProgress}%`;
 }
 const currentMeters = meters();
 if (currentMeters !== renderedMeters || level !== renderedLevel) {
  renderedMeters = currentMeters; renderedLevel = level;
  $('progressText').textContent=selectedMode === 'challenge' ? `${Math.floor(levelProgress)}%` : `${currentMeters}m`;
  $('progressText').setAttribute('aria-label',selectedMode === 'challenge' ? `Challenge ${Math.floor(levelProgress)} percent complete` : `${currentMeters} meters. Level ${level}`);
  $('levelText').textContent=selectedMode === 'challenge' ? 'CHALLENGE' : `LEVEL ${String(level).padStart(2,'0')}`;
 }
 if (s.stats.orbs !== renderedOrbs) { renderedOrbs = s.stats.orbs; $('orbCount').textContent = String(renderedOrbs); }
 $('shieldIndicator').hidden = s.powerUps.shieldCharges === 0;
 const phaseName=s.phase===0?'CYAN':'VIOLET';
 if (phaseButton.dataset.phase !== phaseName) {
  phaseButton.dataset.phase=phaseName;
  phaseButton.innerHTML=touchControls ? `<span>◈</span> ${phaseName}` : `<span>◈</span> ${phaseName} <kbd>X</kbd>`;
  phaseButton.style.color=color;
  phaseButton.setAttribute('aria-label',`Switch phase. ${s.phase===0?'Cyan':'Violet'} is active. Matching beacon colors pull toward the beacon during jumps.${touchControls ? '' : ' Keyboard X or Shift.'}`);
 }
}
function tick(time){const elapsed=lastTime?Math.min((time-lastTime)/1000,.1):0;lastTime=time;
 if(mode==='running'){accumulator+=elapsed;while(accumulator>=game.config.fixedStep && game.state.status==='running'){const oldJumps=game.state.stats.jumps;const oldPhase=game.state.phase;const oldOrbs=game.state.stats.orbs;const oldShieldCharges=game.state.powerUps.shieldCharges;const oldShieldsUsed=game.state.powerUps.shieldsUsed;step(game,{jump:jumpQueued || jumpHeld,togglePhase:phaseQueued});runnerTrail.record(game.state.time,game.state.distance+game.state.runner.x+game.state.runner.width/2,game.state.runner.y+game.state.runner.height/2);if(oldPhase!==game.state.phase)playSfx('phase');if(oldOrbs!==game.state.stats.orbs)playSfx('orb');if(game.state.powerUps.shieldsUsed>oldShieldsUsed)playSfx('shield');else if(game.state.powerUps.shieldCharges>oldShieldCharges)playSfx('shieldPickup');if(game.state.stats.jumps>oldJumps)playSfx('jump');jumpQueued=false;phaseQueued=false;accumulator-=game.config.fixedStep;}if(game.state.status!=='running'){if(activePractice && game.state.status==='dead'){playSfx('death');practiceRespawn();}else finish();}}
 if (mode === 'running' && audioEnabled && !music.paused) syncMusic();
 if (mode === 'running' || renderDirty) { render(time); renderDirty = false; }
}

class RunScene extends Phaser.Scene {
 constructor() { super('run'); }
 update(time: number) {
  const rect = canvas.getBoundingClientRect();
  // A hidden or collapsed canvas has no usable coordinate system. Keep the
  // previous frame until it becomes visible again.
  if (rect.width <= 0 || rect.height <= 0) { lastTime = 0; return; }
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const worldSize = viewportWorldSize(rect.width, rect.height);
  const scale = worldSize.scale;
  const nextWidth = worldSize.width;
  const nextHeight = worldSize.height;
  if (viewportMetrics.width !== nextWidth || viewportMetrics.height !== nextHeight) renderDirty = true;
  viewportMetrics = { width: nextWidth, height: nextHeight, dpr };
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (this.scale.width !== width || this.scale.height !== height) {
   this.scale.resize(width, height);
   renderDirty = true;
  }
  tick(time);
 }
}

new Phaser.Game({
 // Draw directly to the visible canvas and retain static frames when paused.
 // This avoids copying a full-resolution offscreen canvas every frame.
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
