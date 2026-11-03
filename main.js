import { createGame, step } from './core.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
let game = createGame();
let mode = 'ready';
let attempt = 0;
let best = 0;
try { best = Number(localStorage.getItem('neon-dash-best')) || 0; } catch {}
let jumpHeld = false;
let jumpQueued = false;
let phaseQueued = false;
let accumulator = 0;
let lastTime = 0;
let rotation = 0;
let audioEnabled = false;
const music = new Audio(new URL('./assets/space-city.mp3', import.meta.url));
music.loop = true;
music.volume = .35;
const soundEffects = {
 jump: new Audio(new URL('./assets/sfx/jump02.ogg', import.meta.url)),
 phase: new Audio(new URL('./assets/sfx/coin02.ogg', import.meta.url)),
 death: new Audio(new URL('./assets/sfx/alarm.ogg', import.meta.url)),
 win: new Audio(new URL('./assets/sfx/coin03.ogg', import.meta.url)),
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
phaseHint.textContent = 'X / SHIFT TO SWITCH PHASE';
$('viewport').append(phaseHint);
$('best').innerHTML = `${best}<span>%</span>`;
$('overlayDescription').innerHTML = 'Jump the spikes. Switch your phase.<br>Only matching colors can stop you.';
const instructions = document.querySelectorAll('.info-grid p');
instructions[0].innerHTML = 'Space or tap to jump.<br>X or Shift to switch your phase.';
instructions[1].innerHTML = 'Matching colors are solid.<br>Pass through the other phase.';
const musicCredit = document.createElement('span');
musicCredit.className = 'music-credit';
musicCredit.textContent = 'AUDIO: SPACE CITY · MINTODOG / SOUND PACK 04 · CRAZYDUCKGAMES · CC0';
document.querySelector('footer').append(musicCredit);

function playMusic() { if (audioEnabled && mode === 'running') music.play().catch(() => {}); }
function playSfx(name) {
 if (!audioEnabled) return;
 const sound = soundEffects[name];
 sound.currentTime = 0;
 sound.play().catch(() => {});
}
function start() {
 game = createGame(); mode = 'running'; attempt++; accumulator = 0; rotation = 0;
 jumpHeld = false; jumpQueued = false; phaseQueued = false; music.currentTime = 0;
 $('attempt').textContent = String(attempt).padStart(2, '0');
 $('overlay').hidden = true; $('pauseOverlay').hidden = true; $('pauseBtn').style.display = 'block';
 phaseButton.hidden = false; phaseHint.hidden = false;
 $('status').textContent = `Attempt ${attempt}. Jump with Space. Switch phase with X.`;
 playMusic();
}
function pause() {
 if (mode === 'running') { mode = 'paused'; $('pauseOverlay').hidden = false; music.pause(); $('resumeBtn').focus(); }
 else if (mode === 'paused') { mode = 'running'; $('pauseOverlay').hidden = true; playMusic(); }
}
function finish() {
 const progress = percent();
 if (progress > best) { best = progress; try { localStorage.setItem('neon-dash-best', String(best)); } catch {} }
 $('best').innerHTML = `${best}<span>%</span>`;
 mode = game.state.status;
 playSfx(mode === 'won' ? 'win' : 'death');
 music.pause();
 $('overlay').hidden = false; $('pauseBtn').style.display = 'none';
 phaseButton.hidden = true; phaseHint.hidden = true;
 $('overlayKicker').textContent = mode === 'won' ? 'CIRCUIT COMPLETE' : `ATTEMPT ${String(attempt).padStart(2, '0')} · ${progress}% COMPLETE`;
 $('overlayTitle').textContent = mode === 'won' ? 'You found your flow.' : 'One more try.';
 $('overlayDescription').innerHTML = mode === 'won' ? 'Every jump. Every switch. You nailed it.<br>Ready for another perfect run?' : 'Switch colors to pass through spikes.<br>Keep your rhythm. You’ve got this.';
 $('playLabel').textContent = mode === 'won' ? 'PLAY AGAIN' : 'TRY AGAIN';
 $('overlayHint').innerHTML = 'or press <kbd>SPACE</kbd> to restart';
 $('status').textContent = mode === 'won' ? 'Level complete! Press Space to play again.' : `Run ended at ${progress} percent. Press Space to try again.`;
}
function percent() { return Math.min(100, Math.floor(game.state.distance / (game.config.finishX - game.config.runnerX) * 100)); }
function jump() { if (mode === 'ready' || mode === 'dead' || mode === 'won') start(); if (mode === 'running') jumpQueued = true; }
$('playBtn').addEventListener('click', start);
$('restartBtn').addEventListener('click', start);
$('pauseBtn').addEventListener('click', pause);
$('resumeBtn').addEventListener('click', pause);
phaseButton.addEventListener('click', e => { e.stopPropagation(); if (mode === 'running') phaseQueued = true; });
$('soundBtn').addEventListener('click', () => {
 audioEnabled = !audioEnabled;
 $('soundBtn').textContent = audioEnabled ? '♫' : '♪';
 $('soundBtn').setAttribute('aria-label', audioEnabled ? 'Mute sound' : 'Enable sound');
 $('soundBtn').setAttribute('aria-pressed', String(audioEnabled));
 if (audioEnabled) playMusic(); else music.pause();
});
window.addEventListener('keydown', e => {
 if (['Space', 'ArrowUp', 'KeyW', 'KeyX', 'ShiftLeft', 'ShiftRight', 'KeyP', 'Escape', 'KeyR'].includes(e.code)) {
  if (e.target instanceof HTMLButtonElement && e.code === 'Space') return;
  e.preventDefault(); if (e.repeat) return;
  if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { jumpHeld = true; jump(); }
  else if (['KeyX','ShiftLeft','ShiftRight'].includes(e.code)) { if (mode === 'running') phaseQueued = true; }
  else if (e.code === 'KeyR') start(); else pause();
 }
});
window.addEventListener('keyup', e => { if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) jumpHeld = false; });
canvas.addEventListener('pointerdown', e => { e.preventDefault(); jumpHeld = true; jump(); });
window.addEventListener('pointerup', () => { jumpHeld = false; });
window.addEventListener('blur', () => { jumpHeld = false; if (mode === 'running') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'running') pause(); });

function render(time) {
 const rect = canvas.getBoundingClientRect();
 const dpr = Math.min(window.devicePixelRatio || 1, 2);
 if (canvas.width !== Math.round(rect.width*dpr) || canvas.height !== Math.round(rect.height*dpr)) { canvas.width = Math.round(rect.width*dpr); canvas.height = Math.round(rect.height*dpr); }
 const width = Math.max(620, rect.width);
 const height = 390;
 ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);
 const s = game.state;
 const c = game.config;
 const color = s.phase === 0 ? '#62f5dc' : '#b398ff';
 const bg = ctx.createLinearGradient(0,0,0,height); bg.addColorStop(0,'#0c1422');bg.addColorStop(1,'#10242c');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
 // Distant circuit architecture.
 ctx.lineWidth=1;ctx.strokeStyle='#29405160';
 for(let i=-1;i<11;i++){const x=i*140-(s.distance*.16%140);const h=50+Math.sin(i*4.8)*35;ctx.fillStyle='#12202d';ctx.fillRect(x,300-h,80,h);ctx.strokeRect(x+.5,300-h+.5,80,h);ctx.strokeStyle='#35516655';ctx.beginPath();ctx.moveTo(x+12,300-h+13);ctx.lineTo(x+32,300-h+13);ctx.lineTo(x+32,300-h+24);ctx.stroke();}
 ctx.strokeStyle='#2948583d';
 for(let x=-(s.distance*.45%50);x<width;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}
 for(let y=0;y<height;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
 ctx.fillStyle='#09151f';ctx.fillRect(0,c.groundY,width,height-c.groundY);
 ctx.strokeStyle=color;ctx.globalAlpha=.5;ctx.beginPath();ctx.moveTo(0,c.groundY+.5);ctx.lineTo(width,c.groundY+.5);ctx.stroke();ctx.globalAlpha=1;
 ctx.strokeStyle='#193846';for(let x=-(s.distance%50);x<width;x+=50){ctx.beginPath();ctx.moveTo(x,c.groundY+8);ctx.lineTo(x-42,height);ctx.stroke();}for(let y=c.groundY+20;y<height;y+=25){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
 for(const obstacle of s.obstacles){const x=obstacle.x-s.distance;if(x < -60 || x>width+60)continue;const active=obstacle.phase===s.phase;const oc=obstacle.phase===0?'#62f5dc':'#b398ff';ctx.save();ctx.globalAlpha=active?.95:.23;ctx.shadowBlur=active?15:0;ctx.shadowColor=oc;ctx.strokeStyle=oc;ctx.fillStyle=active?(obstacle.phase===0?'#1d574e':'#44355f'):'#15252d';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,c.groundY);ctx.lineTo(x+obstacle.width/2,c.groundY-obstacle.height);ctx.lineTo(x+obstacle.width,c.groundY);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
 const finishX=c.finishX-s.distance;if(finishX<width){ctx.strokeStyle='#b9e786';ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(finishX,70);ctx.lineTo(finishX,c.groundY);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#b9e786';ctx.font='9px sans-serif';ctx.fillText('FINISH',finishX-15,60);}
 const r=s.runner;if(!r.grounded && mode==='running')rotation+=.045;else if(r.grounded)rotation=Math.round(rotation/(Math.PI/2))*Math.PI/2;
 ctx.save();ctx.translate(r.x+r.width/2,r.y+r.height/2);ctx.rotate(rotation);ctx.shadowColor=color;ctx.shadowBlur=20;ctx.fillStyle=s.phase===0?'#1a6255':'#544173';ctx.strokeStyle=color;ctx.lineWidth=2;ctx.fillRect(-r.width/2,-r.height/2,r.width,r.height);ctx.strokeRect(-r.width/2,-r.height/2,r.width,r.height);ctx.shadowBlur=0;ctx.fillStyle=color;ctx.fillRect(-5,-5,3,3);ctx.fillRect(3,-5,3,3);ctx.fillRect(-4,3,9,2);ctx.restore();
 // Small ambient motes.
 ctx.fillStyle='#62f5dc';for(let i=0;i<16;i++){ctx.globalAlpha=.12+(i%3)*.06;const x=(i*137+width-(s.distance*.1)%width)%width;ctx.fillRect(x,70+(i*41)%200,2,2);}ctx.globalAlpha=1;
 const p=percent();$('progressFill').style.width=`${p}%`;$('progressText').textContent=`${p}%`;
 phaseButton.innerHTML=`<span>◈</span> ${s.phase===0?'CYAN':'VIOLET'} <kbd>X</kbd>`;phaseButton.style.color=color;phaseButton.setAttribute('aria-label',`Switch phase. ${s.phase===0?'Cyan':'Violet'} is active. Keyboard X or Shift.`);
}
function tick(time){const elapsed=lastTime?Math.min((time-lastTime)/1000,.1):0;lastTime=time;
 if(mode==='running'){accumulator+=elapsed;while(accumulator>=game.config.fixedStep && game.state.status==='running'){const wasGrounded=game.state.runner.grounded;const oldPhase=game.state.phase;step(game,{jump:jumpQueued || (jumpHeld && wasGrounded && !game.state.jumpHeld),togglePhase:phaseQueued});if(oldPhase!==game.state.phase)playSfx('phase');if(wasGrounded&&!game.state.runner.grounded)playSfx('jump');jumpQueued=false;phaseQueued=false;accumulator-=game.config.fixedStep;}if(game.state.status!=='running')finish();}
 render(time);requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
