import type { VerticalObstacle, VerticalOrb, VerticalSectionState } from '../../vertical-section';
import { VERTICAL_PLAYER_RADIUS, VERTICAL_WALL_INSET, VERTICAL_WIDTH } from '../../vertical-section';
import { GAMEPLAY_COLORS as C, SHAFT_PALETTE as P } from '../art/palette';
import { shaftLayout } from '../../viewport';
import type { RunnerTrail } from '../../runner-visuals';
import { drawShieldOrb, PHASE_COLORS, type GlowFn } from './world';

export interface ShaftView {
  width: number;
  height: number;
  time: number;
  beat: number;
  beatPhase: number;
  reducedMotion: boolean;
  glowUnit: number;
  heat: number;
  hideRunner: boolean;
}

/** Screen transform for course coordinates: screen = (course - origin) * scale + offset. */
export function shaftTransform(width: number, height: number, cameraY: number) {
  const layout = shaftLayout(width, height, VERTICAL_WIDTH);
  return { ...layout, offsetX: layout.x, offsetY: height * layout.runnerShare - cameraY * layout.scale };
}

function rng(i: number) {
  const x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function drawShaft(
  ctx: CanvasRenderingContext2D,
  section: { state: VerticalSectionState; obstacles: readonly VerticalObstacle[]; orbs: readonly VerticalOrb[]; shattered: readonly number[]; shield: boolean },
  view: ShaftView,
  trail: RunnerTrail,
  glow: GlowFn,
) {
  const { width: w, height: h } = view;
  const st = section.state;
  const t = shaftTransform(w, h, st.y);
  const scroll = st.y * t.scale;

  // Background: deep tunnel gradient with stars streaming past.
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, P.skyTop); bg.addColorStop(.5, P.skyMid); bg.addColorStop(1, P.skyLow);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const depth = .25 + rng(i) * .75;
    const x = rng(i + 99) * w;
    const y = ((rng(i + 7) * h * 1.4 - scroll * depth * .6) % (h * 1.4) + h * 1.4) % (h * 1.4) - h * .2;
    ctx.globalAlpha = .2 + depth * .5;
    ctx.fillStyle = i % 5 === 0 ? P.accent : P.star;
    ctx.fillRect(x, y, 1 + depth, 4 + depth * 14);
  }
  ctx.restore();

  // Side towers in landscape keep the margins alive and moving.
  if (t.x > 8) {
    for (const side of [0, 1]) {
      const x0 = side ? t.x + t.width : 0, sw = t.x;
      for (let i = 0; i < 9; i++) {
        const depth = .3 + rng(i * 3 + side) * .5;
        const towerW = sw * (.12 + rng(i + 40 + side) * .18);
        const tx = x0 + rng(i * 11 + side * 5) * (sw - towerW);
        const period = h * 1.6;
        const ty = ((rng(i + 3 + side) * period - scroll * depth) % period + period) % period - h * .3;
        const th = h * (.3 + rng(i + 60) * .5);
        ctx.fillStyle = P.city; ctx.globalAlpha = .85;
        ctx.fillRect(tx, ty, towerW, th);
        ctx.globalAlpha = .55 + view.beat * .35;
        ctx.fillStyle = i % 2 ? C.cyan : C.violet;
        ctx.fillRect(side ? tx : tx + towerW - 2, ty, 2, th);
        ctx.globalAlpha = .4;
        for (let wy = ty + 8; wy < ty + th - 6; wy += 12) if (rng(wy + i) < .35) ctx.fillRect(tx + 4 + rng(wy) * (towerW - 10), wy, 3, 2);
        ctx.globalAlpha = 1;
      }
    }
    const fade = ctx.createLinearGradient(t.x - 40, 0, t.x, 0);
    fade.addColorStop(0, P.skyMid + '00'); fade.addColorStop(1, P.floorBottom + 'cc');
    ctx.fillStyle = fade; ctx.fillRect(t.x - 40, 0, 40, h);
    const fade2 = ctx.createLinearGradient(t.x + t.width + 40, 0, t.x + t.width, 0);
    fade2.addColorStop(0, P.skyMid + '00'); fade2.addColorStop(1, P.floorBottom + 'cc');
    ctx.fillStyle = fade2; ctx.fillRect(t.x + t.width, 0, 40, h);
  }

  // Lane floor with a grid that scrolls 1:1 with the course.
  ctx.fillStyle = P.floorBottom + 'b0';
  ctx.fillRect(t.x, 0, t.width, h);
  ctx.strokeStyle = P.grid; ctx.globalAlpha = .28 + view.beat * .3; ctx.lineWidth = 1;
  ctx.beginPath();
  const firstRow = st.y - h * t.runnerShare / t.scale - 60;
  for (let cy = Math.floor(firstRow / 60) * 60; cy * t.scale + t.offsetY < h + 2; cy += 60) {
    const y = cy * t.scale + t.offsetY;
    ctx.moveTo(t.x, y); ctx.lineTo(t.x + t.width, y);
  }
  for (let i = 1; i < 7; i++) { const x = t.x + t.width * i / 7; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(t.offsetX, t.offsetY);
  ctx.scale(t.scale, t.scale);
  const top = st.y - h * t.runnerShare / t.scale - 40;
  const bottom = top + h / t.scale + 80;

  // Walls: the active color's wall burns bright; the other idles.
  for (const side of [0, 1] as const) {
    const active = st.phase === side;
    const color = PHASE_COLORS[side];
    const x = side ? VERTICAL_WIDTH - 4 : 0;
    ctx.globalAlpha = active ? .25 + view.beat * .2 : .08;
    const g = ctx.createLinearGradient(side ? VERTICAL_WIDTH : 0, 0, side ? VERTICAL_WIDTH - 70 : 70, 0);
    g.addColorStop(0, color); g.addColorStop(1, color + '00');
    ctx.fillStyle = g;
    ctx.fillRect(side ? VERTICAL_WIDTH - 70 : 0, top, 70, bottom - top);
    ctx.globalAlpha = active ? 1 : .45;
    ctx.fillStyle = color;
    ctx.fillRect(x, top, 4, bottom - top);
    if (active) { ctx.fillStyle = C.white; ctx.fillRect(x + 1.5, top, 1, bottom - top); }
    // Arrow ticks scroll along the active wall.
    if (active && !view.reducedMotion) {
      ctx.fillStyle = color; ctx.globalAlpha = .7;
      const step = 46;
      for (let y = Math.floor(top / step) * step; y < bottom; y += step) {
        const ax = side ? VERTICAL_WIDTH - 14 : 14, dir = side ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(ax, y); ctx.lineTo(ax + dir * 7, y + 7); ctx.lineTo(ax, y + 14); ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  section.obstacles.forEach((o, i) => {
    if (o.passive || o.y + o.height < top || o.y > bottom) return;
    if (section.shattered.includes(i)) {
      ctx.globalAlpha = .25; ctx.setLineDash([6, 6]); ctx.strokeStyle = C.danger; ctx.lineWidth = 2;
      ctx.strokeRect(o.x, o.y, o.width, o.height); ctx.setLineDash([]); ctx.globalAlpha = 1;
      return;
    }
    glow(`vgate:${o.width}:${o.height}`, o.x, o.y, o.width, o.height, view.glowUnit * 1.1, C.danger, g => {
      g.fillStyle = C.danger + 'aa'; g.fillRect(0, 0, o.width, o.height);
    }, .7 + view.beat * .3);
    const fill = ctx.createLinearGradient(0, o.y, 0, o.y + o.height);
    fill.addColorStop(0, C.danger); fill.addColorStop(1, C.danger + '99');
    ctx.fillStyle = fill; ctx.fillRect(o.x, o.y, o.width, o.height);
    ctx.save();
    ctx.beginPath(); ctx.rect(o.x, o.y, o.width, o.height); ctx.clip();
    ctx.strokeStyle = C.void + '77'; ctx.lineWidth = 6;
    ctx.beginPath();
    for (let x = o.x - o.height; x < o.x + o.width + o.height; x += 18) { ctx.moveTo(x, o.y + o.height); ctx.lineTo(x + o.height, o.y); }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = C.white; ctx.lineWidth = 2; ctx.strokeRect(o.x + 1, o.y + 1, o.width - 2, o.height - 2);
    // A chevron on the open side points at the way through.
    const open = o.x === 0 ? o.x + o.width + (VERTICAL_WIDTH - o.width) / 2 : (VERTICAL_WIDTH - o.width) / 2;
    const dir = o.x === 0 ? 1 : -1;
    ctx.fillStyle = PHASE_COLORS[o.x === 0 ? 1 : 0];
    ctx.globalAlpha = .55 + view.beat * .45;
    const cy = o.y + o.height / 2;
    ctx.beginPath(); ctx.moveTo(open - dir * 16, cy - 12); ctx.lineTo(open + dir * 4, cy); ctx.lineTo(open - dir * 16, cy + 12); ctx.lineTo(open - dir * 10, cy); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  });

  for (const orb of section.orbs) {
    if (orb.y < top || orb.y > bottom) continue;
    if (orb.shield) { drawShieldOrb(ctx, orb.x, orb.y, orb.radius, view, glow); continue; }
    const r = orb.radius * (1 + view.beat * .12);
    ctx.save(); ctx.translate(orb.x, orb.y); ctx.rotate(Math.PI / 4 + (view.reducedMotion ? 0 : view.time * 1.5));
    glow('orb', -r * .7, -r * .7, r * 1.4, r * 1.4, view.glowUnit * .8, C.gold, g => { g.fillStyle = C.reward; g.fillRect(0, 0, r * 1.4, r * 1.4); }, .9);
    ctx.fillStyle = C.reward; ctx.fillRect(-r * .6, -r * .6, r * 1.2, r * 1.2);
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.strokeRect(-r * .6, -r * .6, r * 1.2, r * 1.2);
    ctx.restore();
  }

  if (!view.hideRunner) {
    const color = PHASE_COLORS[st.phase];
    const samples = trail.samples;
    if (samples.length > 1) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 14; i >= 1; i--) {
        const a = trail.at(samples.at(-1)!.time - .4 * i / 14);
        if (!a) continue;
        const k = 1 - i / 15;
        ctx.globalAlpha = (.1 + .28 * view.heat) * k + .05;
        ctx.fillStyle = color;
        const s = VERTICAL_PLAYER_RADIUS * 2 * (.3 + .7 * k);
        ctx.fillRect(a.x - s / 2, a.y - s / 2, s, s);
      }
      ctx.restore();
    }
    const size = VERTICAL_PLAYER_RADIUS * 2;
    ctx.save();
    ctx.translate(st.x, st.y);
    const tilt = Math.max(-.5, Math.min(.5, st.vx / 900));
    ctx.rotate(tilt + (st.phase === 0 ? Math.PI / 2 : -Math.PI / 2));
    glow(`vrunner${st.phase}`, -size / 2, -size / 2, size, size, view.glowUnit * 1.1, color, g => { g.fillStyle = color; g.fillRect(0, 0, size, size); }, .9);
    ctx.fillStyle = st.phase === 0 ? C.runnerCyanFill : C.runnerVioletFill;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.strokeRect(-size / 2 + 1.5, -size / 2 + 1.5, size - 3, size - 3);
    ctx.strokeStyle = C.white; ctx.lineWidth = 1; ctx.strokeRect(-size / 2 + 4, -size / 2 + 4, size - 8, size - 8);
    ctx.fillStyle = C.white; ctx.fillRect(-6, -5, 3, 3); ctx.fillRect(3, -5, 3, 3); ctx.fillRect(-5, 3, 10, 2);
    ctx.restore();
    if (section.shield) {
      ctx.globalAlpha = .55 + view.beat * .3; ctx.strokeStyle = C.cyan; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(st.x, st.y, size * .95, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

export { VERTICAL_WALL_INSET };
