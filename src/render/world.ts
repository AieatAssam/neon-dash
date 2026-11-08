import { floorPulseState, VERTICAL_APPROACH_CUE_X, VERTICAL_SECTION_START_X, type Game } from '../../core';
import { GAMEPLAY_COLORS as C } from '../art/palette';
import { RUNNER_FACE, type RunnerTrail } from '../../runner-visuals';

export type GlowFn = (key: string, x: number, y: number, w: number, h: number, blur: number, color: string, draw: (g: CanvasRenderingContext2D) => void, alpha?: number) => void;

export interface WorldView {
  /** World units visible across and down the screen. */
  width: number;
  height: number;
  /** Screen-space shift so that world x = distance + runnerX sits at the runner's screen column. */
  cameraX: number;
  /** World units of the runway glow at the current pixel density. */
  glowUnit: number;
  time: number;
  beat: number;
  beatPhase: number;
  reducedMotion: boolean;
  /** 0..1, brightens the trail with the current streak. */
  heat: number;
  attempt: number;
  showAttempt: boolean;
  checkpoints: readonly number[];
  /** Presentation squash: 1 is neutral. */
  squash: number;
  rotation: number;
  /** Runner hidden while its shards fly. */
  hideRunner: boolean;
  challenge: boolean;
}

export const PHASE_COLORS = [C.cyan, C.violet] as const;

function spikePath(g: CanvasRenderingContext2D, x: number, base: number, w: number, h: number) {
  g.beginPath(); g.moveTo(x, base); g.lineTo(x + w / 2, base - h); g.lineTo(x + w, base); g.closePath();
}

export function drawWorld(ctx: CanvasRenderingContext2D, game: Game, view: WorldView, trail: RunnerTrail, glow: GlowFn) {
  const s = game.state;
  const c = game.config;
  const ground = c.groundY;
  const left = s.distance - view.cameraX - 40;
  const right = left + view.width + 120;
  const phaseColor = PHASE_COLORS[s.phase];
  const pulse = view.reducedMotion ? .7 : .62 + view.beat * .38;
  const sx = (worldX: number) => worldX - s.distance;

  if (view.showAttempt && view.attempt > 0) {
    const ax = sx(c.runnerX + 150);
    if (ax > -400) {
      ctx.save();
      ctx.font = '800 54px "Barlow Condensed", Impact, sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = .22;
      ctx.fillStyle = C.white;
      ctx.fillText(`ATTEMPT ${view.attempt}`, ax, ground - 150);
      ctx.restore();
    }
  }

  // Runway: emitted light in the current phase color, cut by gaps.
  let start = left;
  const segments: [number, number][] = [];
  for (const t of s.terrain) {
    if (t.kind !== 'gap' || t.x + t.width < left || t.x > right) continue;
    if (t.x > start) segments.push([start, t.x]);
    start = Math.max(start, t.x + t.width);
  }
  if (start < right) segments.push([start, right]);
  for (const [a, b] of segments) {
    for (let x = a; x < b; x += 600) {
      const w = Math.min(600, b - x);
      ctx.save();
      ctx.beginPath(); ctx.rect(sx(x), ground - 40, w, 80); ctx.clip();
      ctx.translate(sx(x), ground);
      glow('runway', 0, -2, 600, 4, view.glowUnit * 1.2, phaseColor, g => { g.fillStyle = phaseColor; g.fillRect(0, 0, 600, 4); }, .5 + view.beat * .5);
      ctx.restore();
    }
    const x0 = sx(a), w = b - a;
    const band = ctx.createLinearGradient(0, ground, 0, ground + 70);
    band.addColorStop(0, phaseColor + '30');
    band.addColorStop(1, phaseColor + '00');
    ctx.fillStyle = band;
    ctx.fillRect(x0, ground, w, 70);
    ctx.fillStyle = phaseColor;
    ctx.fillRect(x0, ground - 1.5, w, 3);
    ctx.fillStyle = C.white;
    ctx.fillRect(x0, ground - .5, w, 1);
  }

  for (const t of s.terrain) {
    if (t.x + t.width < left || t.x > right) continue;
    const x = sx(t.x);
    if (t.kind === 'gap') {
      ctx.fillStyle = C.void;
      ctx.fillRect(x, ground - 1.5, t.width, view.height);
      const edge = ctx.createLinearGradient(0, ground, 0, ground + 90);
      edge.addColorStop(0, C.danger);
      edge.addColorStop(1, C.danger + '00');
      ctx.fillStyle = edge;
      ctx.fillRect(x - 1, ground - 2, 3, 90);
      ctx.fillRect(x + t.width - 2, ground - 2, 3, 90);
      ctx.globalAlpha = .35 + view.beat * .3;
      ctx.fillRect(x, ground + 2, t.width, 2);
      ctx.globalAlpha = 1;
    } else {
      const top = ground - t.height;
      glow('plat', x, top, t.width, t.height, view.glowUnit * .7, C.platform, g => {
        g.fillStyle = C.platformFill; g.strokeStyle = C.platform; g.lineWidth = 2.5;
        g.fillRect(0, 0, t.width, t.height); g.strokeRect(0, 0, t.width, t.height);
      }, .8 + view.beat * .2);
      ctx.fillStyle = C.platformFill;
      ctx.fillRect(x, top, t.width, t.height);
      ctx.fillStyle = C.platform;
      ctx.fillRect(x, top - 1, t.width, 4);
      ctx.strokeStyle = C.platform; ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, top + 1, t.width - 2, t.height - 2);
      ctx.fillStyle = C.white; ctx.fillRect(x + 2, top, t.width - 4, 1);
    }
  }

  // Portal: a tall gate that grows brighter on approach; chevrons on the runway point at it.
  if (view.challenge && !game.verticalComplete && !game.verticalState) {
    const portal = VERTICAL_SECTION_START_X + c.runnerX;
    const near = Math.max(0, Math.min(1, (s.distance - VERTICAL_APPROACH_CUE_X) / (VERTICAL_SECTION_START_X - VERTICAL_APPROACH_CUE_X)));
    if (near > 0) {
      for (let i = 0; i < 10; i++) {
        const x = portal - 60 - i * 48;
        if (x < left || x > right || x < s.distance + c.runnerX + 30) continue;
        const lit = (Math.floor(view.beatPhase * 4) + i) % 4 === 0;
        ctx.globalAlpha = (lit ? .95 : .35) * near;
        ctx.fillStyle = lit ? C.white : C.cyan;
        ctx.beginPath(); ctx.moveTo(sx(x), ground + 8); ctx.lineTo(sx(x) + 14, ground + 14); ctx.lineTo(sx(x), ground + 20); ctx.lineTo(sx(x) + 5, ground + 14); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (portal > left - 80 && portal < right + 80) {
      const x = sx(portal), h = 210, w = 46;
      const bob = view.reducedMotion ? 0 : Math.sin(view.time * 3) * 3;
      glow('portal', x - w / 2, ground - h + bob, w, h, view.glowUnit * 1.6, C.cyan, g => {
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, C.violet); grad.addColorStop(1, C.cyan);
        g.strokeStyle = grad; g.lineWidth = 5;
        g.strokeRect(2, 2, w - 4, h - 4);
      }, .7 + view.beat * .3);
      const grad = ctx.createLinearGradient(0, ground - h, 0, ground);
      grad.addColorStop(0, C.violet + '55'); grad.addColorStop(1, C.cyan + '22');
      ctx.fillStyle = grad;
      ctx.fillRect(x - w / 2 + 3, ground - h + 3 + bob, w - 6, h - 6);
      ctx.strokeStyle = C.white; ctx.lineWidth = 1.5;
      ctx.strokeRect(x - w / 2 + 2, ground - h + 2 + bob, w - 4, h - 4);
      // Upward chevrons scroll inside the frame.
      ctx.save();
      ctx.beginPath(); ctx.rect(x - w / 2 + 4, ground - h + 4 + bob, w - 8, h - 8); ctx.clip();
      ctx.strokeStyle = C.white; ctx.lineWidth = 3;
      const scroll = view.reducedMotion ? 0 : (view.time * 60) % 30;
      for (let y = ground + 30 - scroll; y > ground - h - 30; y -= 30) {
        ctx.globalAlpha = .4 + .6 * (1 - (ground - y) / h);
        ctx.beginPath(); ctx.moveTo(x - 12, y + bob); ctx.lineTo(x, y - 10 + bob); ctx.lineTo(x + 12, y + bob); ctx.stroke();
      }
      ctx.restore();
    }
  }

  for (const o of s.obstacles) {
    if (o.x + o.width < left || o.x > right) continue;
    const x = sx(o.x);
    if (o.shielded) continue;
    if (o.kind === 'pulse') {
      const state = floorPulseState(o, s.time);
      if (state === 'active') {
        glow('pulse-on', x, ground - o.height, o.width, o.height, view.glowUnit, C.danger, g => {
          g.fillStyle = C.danger; g.fillRect(0, 0, o.width, o.height);
        });
        ctx.fillStyle = C.danger; ctx.fillRect(x, ground - o.height, o.width, o.height);
        ctx.strokeStyle = C.white; ctx.lineWidth = 1.5; ctx.strokeRect(x + 2, ground - o.height + 2, o.width - 4, o.height - 4);
      } else {
        const warn = state === 'warning';
        ctx.fillStyle = C.danger;
        ctx.globalAlpha = warn ? .5 + .5 * Math.abs(Math.sin(view.time * 18)) : .45;
        ctx.fillRect(x, ground - 5, o.width, 5);
        if (warn) {
          ctx.setLineDash([4, 4]); ctx.strokeStyle = C.danger; ctx.lineWidth = 1.5;
          ctx.strokeRect(x, ground - o.height, o.width, o.height); ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;
      }
      continue;
    }
    if (o.kind === 'gate') {
      const color = PHASE_COLORS[o.phase ?? 0];
      const lethal = o.phase === s.phase;
      const top = ground - o.height;
      if (lethal) {
        glow(`gate${o.phase}`, x, top, o.width, o.height, view.glowUnit * 1.1, color, g => {
          g.fillStyle = color + '88'; g.strokeStyle = color; g.lineWidth = 3;
          g.fillRect(0, 0, o.width, o.height); g.strokeRect(0, 0, o.width, o.height);
        }, pulse);
        ctx.fillStyle = color + 'aa';
        ctx.fillRect(x, top, o.width, o.height);
        ctx.strokeStyle = C.white; ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 1.5, top + 1.5, o.width - 3, o.height - 3);
        ctx.strokeStyle = C.void + '88'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let y = top + 10; y < ground - 6; y += 16) { ctx.moveTo(x + 3, y + 8); ctx.lineTo(x + o.width - 3, y); }
        ctx.stroke();
      } else {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = color; ctx.globalAlpha = .55; ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 1, top + 1, o.width - 2, o.height - 2);
        ctx.setLineDash([]);
        ctx.fillStyle = color + '14';
        ctx.fillRect(x, top, o.width, o.height);
        ctx.globalAlpha = 1;
      }
      continue;
    }
    const neutral = o.phase === null;
    const color = neutral ? C.danger : PHASE_COLORS[o.phase!];
    const lethal = neutral || o.phase === s.phase;
    const grow = view.reducedMotion || !lethal ? 1 : 1 + view.beat * .06;
    const h = o.height * grow, w = o.width;
    if (lethal) {
      glow(`spike${o.phase}:${o.height}`, x, ground - o.height, w, o.height, view.glowUnit * .9, color, g => {
        spikePath(g, 0, o.height, w, o.height);
        g.fillStyle = color + 'cc'; g.fill();
        g.strokeStyle = color; g.lineWidth = 3; g.stroke();
      }, pulse);
      const fill = ctx.createLinearGradient(0, ground - h, 0, ground);
      fill.addColorStop(0, color);
      fill.addColorStop(1, C.void);
      spikePath(ctx, x, ground, w, h);
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.stroke();
      spikePath(ctx, x + w * .22, ground - 2, w * .56, h * .62);
      ctx.strokeStyle = C.white; ctx.lineWidth = 1.2; ctx.stroke();
    } else {
      spikePath(ctx, x, ground, w, h);
      ctx.setLineDash([4, 3]); ctx.strokeStyle = color; ctx.globalAlpha = .5; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  }

  for (const orb of s.collectibles) {
    if (orb.x < left || orb.x > right) continue;
    const bob = view.reducedMotion ? 0 : Math.sin(view.time * 4 + orb.x * .02) * 3;
    const r = orb.radius * (1 + view.beat * .12);
    ctx.save();
    ctx.translate(sx(orb.x), orb.y + bob);
    ctx.rotate(Math.PI / 4 + (view.reducedMotion ? 0 : view.time * 1.5));
    glow('orb', -r * .7, -r * .7, r * 1.4, r * 1.4, view.glowUnit * .8, C.gold, g => {
      g.fillStyle = C.reward; g.fillRect(0, 0, r * 1.4, r * 1.4);
    }, .9);
    ctx.fillStyle = C.reward; ctx.fillRect(-r * .62, -r * .62, r * 1.24, r * 1.24);
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.strokeRect(-r * .62, -r * .62, r * 1.24, r * 1.24);
    ctx.fillStyle = C.white; ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  }
  for (const p of s.shieldPickups) {
    if (p.x < left || p.x > right) continue;
    const bob = view.reducedMotion ? 0 : Math.sin(view.time * 3.2 + p.x) * 4;
    drawShieldOrb(ctx, sx(p.x), p.y + bob - 6, p.radius + 3, view, glow);
  }

  if (Number.isFinite(c.finishX)) {
    const fx = sx(c.finishX);
    if (fx < view.width + 40) {
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = i % 2 ? C.white : C.platform;
        ctx.globalAlpha = .9;
        ctx.fillRect(fx, ground - 14 * (i + 1), 8, 14);
        ctx.fillStyle = i % 2 ? C.platform : C.white;
        ctx.fillRect(fx + 8, ground - 14 * (i + 1), 8, 14);
      }
      ctx.globalAlpha = 1;
    }
  }

  for (const cp of view.checkpoints) {
    const x = sx(cp);
    if (x < -20 || x > view.width) continue;
    ctx.save(); ctx.translate(x, ground - 46); ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = C.platform; ctx.lineWidth = 2; ctx.strokeRect(-6, -6, 12, 12);
    ctx.restore();
    ctx.fillStyle = C.platform; ctx.fillRect(x - 1, ground - 38, 2, 38);
  }

  drawRunner(ctx, game, view, trail, glow);
}

export function drawShieldOrb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, view: { glowUnit: number; beat: number; time: number; reducedMotion: boolean }, glow: GlowFn) {
  glow('shield-orb', x - r, y - r, r * 2, r * 2, view.glowUnit, C.cyan, g => {
    g.strokeStyle = C.cyan; g.lineWidth = 3; g.beginPath(); g.arc(r, r, r - 2, 0, Math.PI * 2); g.stroke();
  }, .8 + view.beat * .2);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = C.cyan + '33';
  ctx.beginPath(); ctx.arc(0, 0, r - 2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.white; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.rotate(view.reducedMotion ? 0 : view.time * 2);
  ctx.strokeStyle = C.cyan; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, 0, r + 3, 0, Math.PI * .6); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r + 3, Math.PI, Math.PI * 1.6); ctx.stroke();
  ctx.rotate(view.reducedMotion ? 0 : -view.time * 2);
  ctx.fillStyle = C.white;
  ctx.beginPath(); ctx.moveTo(0, -r * .5); ctx.lineTo(r * .42, -r * .28); ctx.lineTo(r * .34, r * .22); ctx.lineTo(0, r * .52); ctx.lineTo(-r * .34, r * .22); ctx.lineTo(-r * .42, -r * .28); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawRunner(ctx: CanvasRenderingContext2D, game: Game, view: WorldView, trail: RunnerTrail, glow: GlowFn) {
  const s = game.state;
  const r = s.runner;
  const color = PHASE_COLORS[s.phase];
  if (view.hideRunner) return;
  // Ribbon trail: a tapered quad strip in additive light.
  const samples = trail.samples;
  if (samples.length > 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const n = 18;
    const half = r.width * .5;
    for (let i = n; i >= 1; i--) {
      const a = trail.at(s.time - .5 * i / n), b = trail.at(s.time - .5 * (i - 1) / n);
      if (!a || !b) continue;
      const t = 1 - i / (n + 1);
      ctx.globalAlpha = (.12 + .3 * view.heat) * t + .05;
      ctx.fillStyle = i < n * .3 && view.heat > .5 ? C.white : color;
      const ha = half * (.25 + .75 * t), hb = half * (.25 + .75 * (1 - (i - 1) / (n + 1)));
      ctx.beginPath();
      ctx.moveTo(a.x - s.distance, a.y - ha); ctx.lineTo(b.x - s.distance, b.y - hb);
      ctx.lineTo(b.x - s.distance, b.y + hb); ctx.lineTo(a.x - s.distance, a.y + ha);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  ctx.save();
  ctx.translate(cx, r.y + r.height);
  ctx.scale(1 / view.squash, view.squash);
  ctx.translate(0, -r.height / 2);
  ctx.rotate(view.rotation);
  const fill = s.phase === 0 ? C.runnerCyanFill : C.runnerVioletFill;
  glow(`runner${s.phase}`, -r.width / 2, -r.height / 2, r.width, r.height, view.glowUnit * 1.1, color, g => {
    g.fillStyle = color; g.fillRect(0, 0, r.width, r.height);
  }, .9);
  ctx.fillStyle = fill; ctx.fillRect(-r.width / 2, -r.height / 2, r.width, r.height);
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.strokeRect(-r.width / 2 + 1.5, -r.height / 2 + 1.5, r.width - 3, r.height - 3);
  ctx.strokeStyle = C.white; ctx.lineWidth = 1; ctx.strokeRect(-r.width / 2 + 4, -r.height / 2 + 4, r.width - 8, r.height - 8);
  ctx.fillStyle = C.white;
  for (const [x, y, w, h] of RUNNER_FACE) ctx.fillRect(x, y, w, h);
  ctx.restore();
  if (s.powerUps.shieldCharges > 0) {
    ctx.save();
    ctx.globalAlpha = .55 + view.beat * .3;
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r.width * .95, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = .12; ctx.fillStyle = C.cyan; ctx.fill();
    ctx.restore();
  }
}
