import Phaser from 'phaser';
import { challengeProgress, createGame, step } from './core';
import { ACHIEVEMENTS, mergeProgress } from './achievements.js';
import { resultDetail } from './result-copy.js';
import { viewportWorldSize } from './viewport';
import { BeatClock, beatEnvelope, musicPosition, musicNeedsSync } from './rhythm';

const $ = (id: string): any => document.getElementById(id);
const canvas = $('game') as HTMLCanvasElement;
const surface = document.createElement('canvas');
const ctx = surface.getContext('2d')!;
let runSeed = Math.floor(Math.random() * 0x100000000);
let selectedMode: 'challenge' | 'endless' = 'challenge';
let game: any = createGame({ seed: runSeed, mode: selectedMode });
let mode = 'ready';
let attempt = 0;
let progress = { bestDistance: 0, challengeBest: 0, challengeWins: 0, runs: 0, unlocked: [] };
try { const saved = JSON.parse(localStorage.getItem('neon-dash-progress')); if (saved && typeof saved === 'object') progress = { ...progress, ...saved, unlocked: Array.isArray(saved.unlocked) ? saved.unlocked : [] }; } catch {}
let best = Math.floor((Number(progress.bestDistance) || 0) / 10);
let jumpHeld = false;
let jumpQueued = false;
let phaseQueued = false;
let accumulator = 0;
let lastTime = 0;
let rotation = 0;
let audioEnabled = false;
let visualEvent = { name: '', at: -10000 };
let renderedMeters = -1;
let renderedLevel = -1;
let renderedPhase = -1;
let renderedProgress = -1;
let renderedOrbs = -1;
let viewportMetrics = { width: 680, height: 480, dpr: 1 };
let renderDirty = true;
let adaptiveDpr = 1;
let slowFrames = 0;
let fastFrames = 0;
let lastFrameTime = 0;
const CYAN = '#37ffe7';
const VIOLET = '#c778ff';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
 death: new Audio(new URL('./assets/sfx/alarm.ogg', import.meta.url).href),
 win: new Audio(new URL('./assets/sfx/coin03.ogg', import.meta.url).href),
};
for (const sound of Object.values(soundEffects)) sound.volume = .45;
const phaseButton = document.createElement('button');
phaseButton.className = 'phase-button';
phaseButton.id = 'phaseBtn';
phaseButton.hidden = true;
phaseButton.innerHTML = '<span>◈</span> CYAN <kbd>X</kbd>';
phaseButton.setAttribute('aria-label', 'Switch phase. Cyan is active. Keyboard X or Shift.');
$('viewport').append(phaseButton);
const phaseHint = document.createElement('span');
phaseHint.className = 'phase-help';
phaseHint.hidden = true;
phaseHint.textContent = 'X / SHIFT · SWITCH TO THE OPPOSITE COLOR FOR GATES';
$('viewport').append(phaseHint);
function updateBest() {
 $('bestLabel').textContent = selectedMode === 'challenge' ? 'BEST' : 'BEST';
 $('best').innerHTML = selectedMode === 'challenge' ? `${progress.challengeBest || 0}<span>%</span>` : `${best}<span>m</span>`;
}
updateBest();
function showObjective(newUnlocks = []) {
 const next = ACHIEVEMENTS.find(a => !progress.unlocked.includes(a.id));
 const unlocked = ACHIEVEMENTS.filter(a => newUnlocks.includes(a.id));
 const describe = text => text.replace(/(\d+) units/g, (_, n) => `${Number(n) / 10}m`).replace('neutral spikes', 'gold spikes');
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
function start(newCircuit = false) {
 if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
 if (newCircuit) runSeed = Math.floor(Math.random() * 0x100000000);
 game = createGame({ seed: runSeed, mode: selectedMode }); renderedProgress = -1; renderedMeters = -1; renderedLevel = -1; mode = 'running'; attempt++; accumulator = 0; rotation = 0;
 renderDirty = true; lastFrameTime = 0; lastTime = 0;
 jumpHeld = false; jumpQueued = false; phaseQueued = false; music.currentTime = 0; beatClock.reset();
 $('attempt').textContent = String(attempt).padStart(2, '0');
 $('overlay').hidden = true; $('pauseOverlay').hidden = true; $('freshBtn').hidden = true; $('pauseBtn').style.display = 'block';
 phaseButton.hidden = false; phaseHint.hidden = false; $('jumpBtn').hidden = false;
 $('status').textContent = `Attempt ${attempt}. Jump with Space. Switch phase with X.`;
 playMusic();
}
function pause() {
 if (mode === 'running') { jumpHeld = false; lastFrameTime = 0; phaseButton.hidden = true; phaseHint.hidden = true; $('jumpBtn').hidden = true; mode = 'paused'; $('pauseOverlay').hidden = false; music.pause(); $('pauseBtn').setAttribute('aria-label', 'Resume game'); $('pauseBtn').setAttribute('aria-pressed', 'true'); $('resumeBtn').focus(); }
 else if (mode === 'paused') { phaseButton.hidden = false; phaseHint.hidden = false; $('jumpBtn').hidden = false; mode = 'running'; renderDirty = true; lastFrameTime = 0; lastTime = 0; $('pauseOverlay').hidden = true; $('pauseBtn').setAttribute('aria-label', 'Pause game'); $('pauseBtn').setAttribute('aria-pressed', 'false'); $('pauseBtn').focus(); playMusic(); }
}
function finish() {
 const distance = meters();
 const previousUnlocks = progress.unlocked;
 const challengePercent = mode === 'won' || game.state.status === 'won' ? 100 : challengeProgress(game.state.distance, game.config.runnerX, game.config.finishX);
 progress = mergeProgress(progress, game.state, selectedMode, challengePercent);
 best = Math.floor(progress.bestDistance / 10);
 try { localStorage.setItem('neon-dash-progress', JSON.stringify(progress)); } catch {}
 showObjective(progress.unlocked.filter(id => !previousUnlocks.includes(id)));
 updateBest();
 mode = game.state.status;
 renderDirty = true;
 playSfx(mode === 'won' ? 'win' : 'death');
 music.pause();
 $('overlay').hidden = false; $('pauseBtn').style.display = 'none'; $('pauseBtn').setAttribute('aria-label', 'Pause game'); $('pauseBtn').setAttribute('aria-pressed', 'false');
 phaseButton.hidden = true; phaseHint.hidden = true; $('jumpBtn').hidden = true;
 $('overlayKicker').textContent = mode === 'won' ? 'CHALLENGE COMPLETE · MEDAL EARNED' : resultDetail({ mode: selectedMode, attempt, distance, level: game.state.level, challengePercent });
 $('overlayTitle').textContent = mode === 'won' ? 'COMPLETE!' : 'TRY AGAIN';
 $('overlayDescription').innerHTML = mode === 'won' ? `🏅 FINISHER MEDAL · ${game.state.stats.orbs} ORBS COLLECTED<br>Challenge complete! Ready for another run?` : `GOLD IS ALWAYS SOLID · ${game.state.stats?.cleared || 0} CLEARED · ${game.state.stats.orbs} ORBS<br>Practice the same circuit or choose a random one.`;
 $('playLabel').textContent = 'RETRY SAME CIRCUIT';
 $('freshBtn').hidden = false;
 $('seedText').textContent = `CIRCUIT SEED · ${runSeed}`;
 $('overlayHint').innerHTML = 'or press <kbd>SPACE</kbd> to restart';
 $('status').textContent = mode === 'won' ? 'Level complete! Press Space to play again.' : `Run ended at ${distance} meters. Press Space to try again.`;
}
function meters() { return Math.floor(game.state.distance / 10); }
function jump() { if (mode === 'ready' || mode === 'dead' || mode === 'won') start(); if (mode === 'running') jumpQueued = true; }
document.querySelectorAll<HTMLInputElement>('input[name=gameMode]').forEach(input => input.addEventListener('change', () => {
 selectedMode = input.value as 'challenge' | 'endless';
 runSeed = Math.floor(Math.random() * 0x100000000);
 attempt = 0; $('attempt').textContent = '01';
 game = createGame({ seed: runSeed, mode: selectedMode });
 renderDirty = true;
 renderedProgress = -1; renderedMeters = -1; renderedLevel = -1;
 $('overlayKicker').textContent = selectedMode === 'challenge' ? 'CHALLENGE / REACH THE FINISH' : 'ENDLESS / GO FOR DISTANCE';
 $('overlayTitle').textContent = 'NEON DASH';
 $('overlayDescription').innerHTML = 'Jump spikes and gaps. Land on platforms.<br>Switch to the opposite color for gates. Gold is always solid.';
 $('playLabel').textContent = 'PLAY'; $('freshBtn').hidden = true; $('seedText').textContent = '';
 $('overlayHint').innerHTML = 'press <kbd>SPACE</kbd> to start'; mode = 'ready'; updateBest();
}));
$('playBtn').addEventListener('click', () => start(false));
$('freshBtn').addEventListener('click', () => start(true));
$('restartBtn').addEventListener('click', () => start(false));
$('pauseBtn').addEventListener('click', pause);
$('resumeBtn').addEventListener('click', pause);
$('jumpBtn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); jumpHeld = true; jump(); });
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
  if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { jumpHeld = true; jump(); }
  else if (['KeyX','ShiftLeft','ShiftRight'].includes(e.code)) { if (mode === 'running') phaseQueued = true; }
  else if (e.code === 'KeyR') start(); else pause();
 }
});
window.addEventListener('keyup', e => { if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) jumpHeld = false; });
canvas.addEventListener('pointerdown', e => { e.preventDefault(); jumpHeld = true; jump(); });
window.addEventListener('pointerup', () => { jumpHeld = false; });
window.addEventListener('pointercancel', () => { jumpHeld = false; });
window.addEventListener('blur', () => { jumpHeld = false; if (mode === 'running') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'running') pause(); });

function render(time) {
 const { width, height } = viewportMetrics;
 const worldOffsetY = Math.max(0, height * .72 - game.config.groundY);
 ctx.setTransform(surface.width/width,0,0,surface.height/height,0,0);
 const s = game.state;
 const c = game.config;
 const color = s.phase === 0 ? CYAN : VIOLET;
 if (renderedPhase !== s.phase) {
  document.documentElement.style.setProperty('--phase', color);
  renderedPhase = s.phase;
 }
 const clock = reducedMotion ? 0 : time * .001;
 const beatTime = beatClock.sample(s.time, audioEnabled && !music.paused ? music.currentTime : undefined);
 const pulse = reducedMotion ? 1 : .82 + beatEnvelope(beatTime) * .18;
 const palettes = [
  { top: '#100728', horizon: '#173855', floor: '#120b30', pink: '#ff3ca6', gold: '#ffbd55', blue: '#347cff' },
  { top: '#150827', horizon: '#462252', floor: '#180b2d', pink: '#ff5a79', gold: '#ffd358', blue: '#9161ff' },
  { top: '#061a2c', horizon: '#124458', floor: '#071b31', pink: '#fa55e7', gold: '#a8ff67', blue: '#24b8ff' },
 ];
 const palette = palettes[Math.floor(game.state.distance / 4800) % palettes.length];
 const bg = ctx.createLinearGradient(0, 0, 0, height);
 bg.addColorStop(0, palette.top); bg.addColorStop(.7, palette.horizon); bg.addColorStop(1, palette.floor);
 ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
 // Broad colored light gives the thin luminous geometry a dark, saturated stage.
 const halo = ctx.createRadialGradient(width * .65, height * .48, 0, width * .65, height * .48, width * .65);
 halo.addColorStop(0, palette.pink + '28'); halo.addColorStop(.48, palette.blue + '0d'); halo.addColorStop(1, palette.blue + '00');
 ctx.fillStyle = halo; ctx.fillRect(0, 0, width, height);
 ctx.save(); ctx.translate(0, worldOffsetY);
 // Monumental rings and angular skylines remain behind the collision silhouettes.
 for (let i = 0; i < 3; i++) {
  const x = width * .68 + i * 235 - (s.distance * .07 % 235);
  const y = 120 - i * 28;
  ctx.strokeStyle = i % 2 ? palette.blue + '42' : palette.pink + '52';
  ctx.lineWidth = i === 0 ? 2 : 1;
  ctx.beginPath(); ctx.arc(x, y, 83 + i * 10, Math.PI * 1.08, Math.PI * 2.84); ctx.stroke();
  ctx.strokeStyle = palette.gold + '70';
  ctx.beginPath(); ctx.arc(x, y, 89 + i * 10, Math.PI * 1.15, Math.PI * 1.35); ctx.stroke();
 }
 for (let i = -1; i < Math.ceil(width / 110) + 2; i++) {
  const x = i * 110 - (s.distance * .18 % 110);
  const h = 55 + (Math.sin(i * 2.7) + 1) * 42;
  ctx.fillStyle = '#0c132bd9';
  ctx.strokeStyle = (i % 2 ? palette.blue : palette.pink) + '65'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, c.groundY); ctx.lineTo(x, c.groundY - h);
  ctx.lineTo(x + 30, c.groundY - h - 22); ctx.lineTo(x + 76, c.groundY - h - 22); ctx.lineTo(x + 76, c.groundY); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = (i % 3 ? palette.blue : palette.gold) + '88';
  ctx.beginPath(); ctx.moveTo(x + 13, c.groundY - h + 9); ctx.lineTo(x + 13, c.groundY - 17); ctx.lineTo(x + 29, c.groundY - 17); ctx.stroke();
  ctx.fillStyle = palette.gold + '77'; ctx.fillRect(x + 52, c.groundY - h, 4, 4);
 }
 ctx.lineWidth = .7; ctx.strokeStyle = palette.blue + '22';
 for (let x = -(s.distance * .32 % 65); x < width; x += 65) { ctx.beginPath(); ctx.moveTo(x, -worldOffsetY); ctx.lineTo(x, c.groundY); ctx.stroke(); }
 for (let y = -worldOffsetY; y < c.groundY; y += 65) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
 // Cut holes in the runway so gaps remain legible against the background.
 ctx.save(); ctx.beginPath();
 let floorStart = 0;
 // Terrain is appended in world order by the simulation. Avoid allocating and
 // sorting a filtered copy on every animation frame.
 for (const gap of s.terrain) {
  if (gap.kind !== 'gap') continue;
  const left = Math.max(0, Math.min(width, gap.x - s.distance));
  const right = Math.max(0, Math.min(width, gap.x + gap.width - s.distance));
  if (right <= floorStart || left >= width) continue;
  ctx.rect(floorStart, c.groundY - 2, Math.max(0, left - floorStart), height);
  floorStart = right;
 }
 ctx.rect(floorStart, c.groundY - 2, Math.max(0, width - floorStart), height); ctx.clip();
 const floor = ctx.createLinearGradient(0, c.groundY, 0, height);
 floor.addColorStop(0, palette.floor); floor.addColorStop(1, '#040a19');
 ctx.fillStyle = floor; ctx.fillRect(0, c.groundY, width, height);
 ctx.strokeStyle = palette.pink + '58'; ctx.lineWidth = 1;
 for (let x = -(s.distance % 70); x < width + 100; x += 70) { ctx.beginPath(); ctx.moveTo(x, c.groundY + 10); ctx.lineTo(x - 95, height); ctx.stroke(); }
 for (let y = c.groundY + 18; y < height; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
 // A hot white core and wide bloom make the runway read as emitted light.
 ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 23 * pulse; ctx.strokeStyle = color; ctx.lineWidth = 3;
 ctx.beginPath(); ctx.moveTo(0, c.groundY + .5); ctx.lineTo(width, c.groundY + .5); ctx.stroke();
 ctx.shadowBlur = 0; ctx.lineWidth = 1; ctx.strokeStyle = '#d9fff8'; ctx.stroke();
 ctx.globalAlpha = .35; ctx.strokeStyle = palette.pink; ctx.beginPath(); ctx.moveTo(0, c.groundY + 7); ctx.lineTo(width, c.groundY + 7); ctx.stroke(); ctx.restore();
 ctx.restore();
 for (const terrain of s.terrain) {
  const x = terrain.x - s.distance; if (x < -terrain.width || x > width) continue;
  ctx.save();
  if (terrain.kind === 'gap') {
   ctx.fillStyle = '#030713'; ctx.fillRect(x, c.groundY, terrain.width, height);
   ctx.strokeStyle = palette.pink; ctx.lineWidth = 2; ctx.beginPath();
   ctx.moveTo(x, c.groundY); ctx.lineTo(x, c.groundY + 12);
   ctx.moveTo(x + terrain.width, c.groundY); ctx.lineTo(x + terrain.width, c.groundY + 12); ctx.stroke();
  } else {
   ctx.fillStyle = '#172941'; ctx.strokeStyle = palette.gold; ctx.lineWidth = 2; ctx.shadowColor = palette.gold; ctx.shadowBlur = 12;
   ctx.fillRect(x, c.groundY - terrain.height, terrain.width, terrain.height);
   ctx.strokeRect(x, c.groundY - terrain.height, terrain.width, terrain.height);
   ctx.shadowBlur = 0; ctx.strokeStyle = '#fff3cb'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 3, c.groundY - terrain.height + 3); ctx.lineTo(x + terrain.width - 3, c.groundY - terrain.height + 3); ctx.stroke();
  }
  ctx.restore();
 }
 for (const obstacle of s.obstacles) {
  const x = obstacle.x - s.distance; if (x < -60 || x > width + 60) continue;
  const neutral = obstacle.phase == null;
  const active = neutral || obstacle.phase === s.phase; const oc = neutral ? '#ffb840' : obstacle.phase === 0 ? CYAN : VIOLET;
  ctx.save(); ctx.globalAlpha = active ? 1 : .35;
  ctx.shadowBlur = active ? 20 * pulse : 0; ctx.shadowColor = oc; ctx.strokeStyle = oc;
  const fill = ctx.createLinearGradient(x, c.groundY - obstacle.height, x, c.groundY);
  fill.addColorStop(0, active ? oc + 'bb' : oc + '16'); fill.addColorStop(1, active ? oc + '18' : oc + '08');
  ctx.fillStyle = fill; ctx.lineWidth = active ? 2.6 : 1.2;
  ctx.beginPath();
  if (obstacle.kind === 'gate') {
   ctx.rect(x, c.groundY - obstacle.height, obstacle.width, obstacle.height);
  } else {
   ctx.moveTo(x, c.groundY); ctx.lineTo(x + obstacle.width / 2, c.groundY - obstacle.height); ctx.lineTo(x + obstacle.width, c.groundY); ctx.closePath();
  }
  ctx.fill(); ctx.stroke();
  if (obstacle.kind === 'gate') {
   ctx.shadowBlur = 0; ctx.strokeStyle = oc; ctx.lineWidth = 1;
   for (let y = c.groundY - obstacle.height + 12; y < c.groundY - 5; y += 18) { ctx.beginPath(); ctx.moveTo(x + 4, y); ctx.lineTo(x + obstacle.width - 4, y + 7); ctx.stroke(); }
  }
  if (active) { ctx.shadowBlur = 0; ctx.strokeStyle = '#f2ffff'; ctx.lineWidth = .8; ctx.stroke(); ctx.fillStyle = '#edffff'; ctx.fillRect(x + obstacle.width / 2 - 1, c.groundY - obstacle.height + 6, 2, 8); }
  ctx.restore();
 }
 for (const orb of s.collectibles) {
  const x = orb.x - s.distance;
  if (x < -orb.radius - 20 || x > width + orb.radius + 20) continue;
  const bob = reducedMotion ? 0 : Math.sin(clock * 4 + orb.x * .02) * 3;
  ctx.save(); ctx.translate(x, orb.y + bob); ctx.rotate(Math.PI / 4 + (reducedMotion ? 0 : Math.sin(clock * 2 + orb.x) * .12));
  ctx.shadowColor = palette.gold; ctx.shadowBlur = 17 * pulse; ctx.fillStyle = '#ffe69a'; ctx.strokeStyle = palette.gold; ctx.lineWidth = 2;
  ctx.fillRect(-orb.radius * .65, -orb.radius * .65, orb.radius * 1.3, orb.radius * 1.3); ctx.strokeRect(-orb.radius * .65, -orb.radius * .65, orb.radius * 1.3, orb.radius * 1.3);
  ctx.shadowBlur = 0; ctx.fillStyle = '#fff9dc'; ctx.fillRect(-2, -2, 4, 4); ctx.restore();
 }
 const finishX=c.finishX-s.distance;if(Number.isFinite(c.finishX)&&finishX<width){ctx.strokeStyle='#b9e786';ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(finishX,70);ctx.lineTo(finishX,c.groundY);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#b9e786';ctx.font='9px sans-serif';ctx.fillText('FINISH',finishX-15,60);}
 const r=s.runner;
 if(mode==='running'){ctx.fillStyle=color;for(let i=1;i<8;i++){ctx.globalAlpha=.2*(1-i/8);const size=r.width*(1-i/11);ctx.fillRect(r.x-i*12,r.y+(r.height-size)/2,size,size);}ctx.globalAlpha=1;}
 if(!reducedMotion && !r.grounded && mode==='running')rotation+=.045;else if(r.grounded)rotation=Math.round(rotation/(Math.PI/2))*Math.PI/2;
 ctx.save();ctx.translate(r.x+r.width/2,r.y+r.height/2);ctx.rotate(rotation);
 ctx.shadowColor=color;ctx.shadowBlur=28*pulse;ctx.fillStyle=s.phase===0?'#138f99':'#8a35bd';ctx.strokeStyle=color;ctx.lineWidth=3;
 ctx.fillRect(-r.width/2,-r.height/2,r.width,r.height);ctx.strokeRect(-r.width/2,-r.height/2,r.width,r.height);
 ctx.shadowBlur=0;ctx.strokeStyle='#eaffff';ctx.lineWidth=1;ctx.strokeRect(-r.width/2+3,-r.height/2+3,r.width-6,r.height-6);
 ctx.fillStyle='#f2ffff';ctx.fillRect(-5,-5,3,3);ctx.fillRect(3,-5,3,3);ctx.fillRect(-4,3,9,2);ctx.restore();
 // Colored sparks drift independently of the world; counts stay fixed on mobile.
 for(let i=0;i<24;i++){
  ctx.fillStyle=[CYAN,palette.pink,palette.gold,palette.blue][i%4];ctx.globalAlpha=.25+(i%3)*.13;
  const x=(i*137+width-(s.distance*.12+clock*9)%width)%width;
  const y=15+(i*43)%255+Math.sin(clock+i)*4;
  ctx.fillRect(x,y,i%5===0?3:1.5,i%5===0?3:1.5);
 }ctx.globalAlpha=1;
 const effectAge=(time-visualEvent.at)/1000;
 if(!reducedMotion && effectAge>=0 && effectAge<.5 && ['phase','death','win','orb'].includes(visualEvent.name)){
  ctx.save();ctx.globalAlpha=(1-effectAge*2)*.65;ctx.strokeStyle=visualEvent.name==='death'?palette.pink:visualEvent.name==='orb'?palette.gold:color;ctx.lineWidth=2;
  const cx=r.x+r.width/2,cy=r.y+r.height/2;
  for(let i=0;i<12;i++){const angle=i*Math.PI/6;const radius=18+effectAge*130;ctx.beginPath();ctx.moveTo(cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius);ctx.lineTo(cx+Math.cos(angle)*(radius+9),cy+Math.sin(angle)*(radius+9));ctx.stroke();}ctx.restore();
 }
 ctx.restore();
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
 const phaseName=s.phase===0?'CYAN':'VIOLET';
 if (phaseButton.dataset.phase !== phaseName) {
  phaseButton.dataset.phase=phaseName;
  phaseButton.innerHTML=`<span>◈</span> ${phaseName} <kbd>X</kbd>`;
  phaseButton.style.color=color;
  phaseButton.setAttribute('aria-label',`Switch phase. ${s.phase===0?'Cyan':'Violet'} is active. Keyboard X or Shift.`);
 }
}
function tick(time){const elapsed=lastTime?Math.min((time-lastTime)/1000,.1):0;lastTime=time;
 if(mode==='running'){accumulator+=elapsed;while(accumulator>=game.config.fixedStep && game.state.status==='running'){const wasGrounded=game.state.runner.grounded;const oldPhase=game.state.phase;const oldOrbs=game.state.stats.orbs;step(game,{jump:jumpQueued || jumpHeld,togglePhase:phaseQueued});if(oldPhase!==game.state.phase)playSfx('phase');if(oldOrbs!==game.state.stats.orbs)playSfx('orb');if(wasGrounded&&!game.state.runner.grounded)playSfx('jump');jumpQueued=false;phaseQueued=false;accumulator-=game.config.fixedStep;}if(game.state.status!=='running')finish();}
 if (mode === 'running' && audioEnabled && !music.paused) syncMusic();
 if (mode === 'running' || renderDirty) { render(time); renderDirty = false; }
}

class RunScene extends Phaser.Scene {
 texture!: Phaser.Textures.CanvasTexture;
 picture!: Phaser.GameObjects.Image;
 constructor() { super('run'); }
 create() {
  this.texture = this.textures.addCanvas('playfield', surface)!;
  this.picture = this.add.image(0, 0, 'playfield').setOrigin(0);
 }
 update(time: number) {
  const rect = canvas.getBoundingClientRect();
  // A hidden or collapsed canvas has no usable coordinate system. Keep the
  // previous frame until it becomes visible again.
  if (rect.width <= 0 || rect.height <= 0) { lastFrameTime = 0; lastTime = 0; return; }
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * adaptiveDpr;
  const worldSize = viewportWorldSize(rect.width, rect.height);
  const scale = worldSize.scale;
  const nextWidth = worldSize.width;
  const nextHeight = worldSize.height;
  if (viewportMetrics.width !== nextWidth || viewportMetrics.height !== nextHeight) renderDirty = true;
  viewportMetrics = { width: nextWidth, height: nextHeight, dpr };
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (this.texture.width !== width || this.texture.height !== height) {
   this.texture.setSize(width, height);
   this.picture.setSizeToFrame();
   renderDirty = true;
  }
  if (mode === 'running' && lastFrameTime) {
   const frameMs = time - lastFrameTime;
   if (frameMs > 24) { slowFrames++; fastFrames = 0; }
   else if (frameMs < 18) { fastFrames++; slowFrames = 0; }
   else { slowFrames = Math.max(0, slowFrames - 1); fastFrames = Math.max(0, fastFrames - 1); }
   if (slowFrames >= 90 && adaptiveDpr > .55) { adaptiveDpr = Math.max(.55, adaptiveDpr - .15); slowFrames = 0; }
   else if (fastFrames >= 240 && adaptiveDpr < 1) { adaptiveDpr = Math.min(1, adaptiveDpr + .1); fastFrames = 0; }
  }
  lastFrameTime = mode === 'running' ? time : 0;
  tick(time);
  if (this.picture.displayWidth !== this.scale.width || this.picture.displayHeight !== this.scale.height) {
   this.picture.setDisplaySize(this.scale.width, this.scale.height);
  }
 }
}

new Phaser.Game({
 // Canvas renders the changing surface directly, avoiding a full-screen GPU
 // texture allocation and upload on every frame.
 type: Phaser.CANVAS,
 canvas,
 width: canvas.clientWidth || 680,
 height: canvas.clientHeight || 480,
 transparent: true,
 scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
 scene: RunScene,
 audio: { noAudio: true },
});
