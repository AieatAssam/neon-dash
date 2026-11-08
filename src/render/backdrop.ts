import { SKY_PALETTES, type SkyPalette } from '../art/palette';

/** Synthwave backdrop: cached sky, sun, stars, mountains and skyline, plus a
 * perspective floor grid drawn live. Everything is in CSS pixels; the caller
 * sets a device-pixel transform. World motion maps to the grid exactly at the
 * runway depth, so the floor never slides against the runway. */

export interface BackdropView {
  width: number;
  height: number;
  dpr: number;
  horizonY: number;
  runwayY: number;
  /** Screen x of world x = 0 on the runway, in CSS pixels. */
  originX: number;
  /** CSS pixels per world unit at the runway. */
  scale: number;
  /** Seconds, for slow drifts. */
  time: number;
  /** 0..1 beat accent. */
  beat: number;
  /** Fractional beat phase 0..1. */
  beatPhase: number;
  palette: SkyPalette;
  /** Second palette and blend amount during section changes. */
  next?: SkyPalette;
  blend?: number;
  reducedMotion?: boolean;
}

type Layer = { canvas: HTMLCanvasElement; key: string };
const layers = new Map<string, Layer>();

function layer(name: string, key: string, w: number, h: number, dpr: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const existing = layers.get(name + key);
  if (existing) return existing.canvas;
  if (layers.size > 24) layers.clear();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * dpr));
  canvas.height = Math.max(1, Math.ceil(h * dpr));
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  paint(g);
  layers.set(name + key, { canvas, key });
  return canvas;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ a >>> 15, a | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function paintSky(g: CanvasRenderingContext2D, w: number, h: number, horizonY: number, p: SkyPalette) {
  const sky = g.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0, p.skyTop);
  sky.addColorStop(.62, p.skyMid);
  sky.addColorStop(1, p.skyLow);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, horizonY + 1);
  const random = rng(7);
  for (let i = 0; i < 90; i++) {
    const x = random() * w, y = random() * horizonY * .82;
    const size = random() < .12 ? 1.6 : .9;
    g.globalAlpha = .25 + random() * .6 * (1 - y / horizonY);
    g.fillStyle = random() < .2 ? p.accent : p.star;
    g.fillRect(x, y, size, size);
  }
  g.globalAlpha = 1;
  // Sun: banded disc with a wide halo, sitting on the horizon.
  const r = Math.min(w * .3, h * .17, 170);
  const cx = w * .64, cy = horizonY - r * .32;
  const halo = g.createRadialGradient(cx, cy, r * .6, cx, cy, r * 2.6);
  halo.addColorStop(0, p.sunGlow + '55');
  halo.addColorStop(1, p.sunGlow + '00');
  g.fillStyle = halo;
  g.fillRect(cx - r * 2.6, cy - r * 2.6, r * 5.2, r * 5.2);
  const sun = document.createElement('canvas');
  sun.width = Math.ceil(r * 2 + 4); sun.height = Math.ceil(r * 2 + 4);
  const s = sun.getContext('2d')!;
  const fill = s.createLinearGradient(0, 2, 0, r * 2 + 2);
  fill.addColorStop(0, p.sunTop);
  fill.addColorStop(.55, p.sunMid);
  fill.addColorStop(1, p.sunBottom);
  s.fillStyle = fill;
  s.beginPath(); s.arc(r + 2, r + 2, r, 0, Math.PI * 2); s.fill();
  s.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) {
    const t = i / 7;
    const y = r + 2 + r * (.1 + t * .9);
    s.fillRect(0, y, sun.width, 1.5 + t * r * .09);
  }
  g.globalAlpha = .92;
  g.drawImage(sun, cx - r - 2, cy - r - 2);
  g.globalAlpha = 1;
  const glow = g.createLinearGradient(0, horizonY - h * .08, 0, horizonY);
  glow.addColorStop(0, p.horizon + '00');
  glow.addColorStop(1, p.horizon + '66');
  g.fillStyle = glow;
  g.fillRect(0, horizonY - h * .08, w, h * .08);
}

function paintMountains(g: CanvasRenderingContext2D, w: number, h: number, p: SkyPalette, seed: number) {
  const random = rng(seed);
  g.beginPath(); g.moveTo(0, h);
  const points: [number, number][] = [];
  for (let x = 0; x <= w; x += w / 14) {
    const y = h * (.2 + random() * .6);
    points.push([x, x === 0 || x >= w - 1 ? h * .55 : y]);
  }
  for (const [x, y] of points) g.lineTo(x, y);
  g.lineTo(w, h); g.closePath();
  const fill = g.createLinearGradient(0, 0, 0, h);
  fill.addColorStop(0, p.mountain);
  fill.addColorStop(1, p.skyLow);
  g.fillStyle = fill; g.fill();
  g.strokeStyle = p.accent + '99'; g.lineWidth = 1.2;
  g.beginPath();
  points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
  g.stroke();
}

function paintCity(g: CanvasRenderingContext2D, w: number, h: number, p: SkyPalette, seed: number) {
  const random = rng(seed);
  let x = 0;
  while (x < w) {
    const bw = 14 + random() * 34;
    const bh = h * (.25 + random() * .75);
    const top = h - bh;
    g.fillStyle = p.city;
    g.fillRect(x, top, bw - 2, bh);
    g.fillStyle = p.accent + '88';
    g.fillRect(x, top, bw - 2, 1);
    if (random() < .25) { g.fillRect(x + bw / 2 - 1, top - 8, 1, 8); }
    for (let wy = top + 5; wy < h - 4; wy += 6) {
      for (let wx = x + 3; wx < x + bw - 5; wx += 5) {
        if (random() < .1) {
          g.fillStyle = random() < .5 ? p.window : p.accent;
          g.globalAlpha = .45 + random() * .4;
          g.fillRect(wx, wy, 1.6, 1.6);
          g.globalAlpha = 1;
        }
      }
    }
    x += bw;
  }
}

function tiled(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, w: number, tileW: number, offset: number, y: number, h: number) {
  let x = -(((offset % tileW) + tileW) % tileW);
  for (; x < w; x += tileW) ctx.drawImage(image, x, y, tileW, h);
}

/** The parts of the backdrop that never move: sky, sun, stars, horizon glow and floor
 * shade. Cached as one image, so each frame costs a single blit. */
function paintStaticSky(g: CanvasRenderingContext2D, w: number, h: number, horizonY: number, p: SkyPalette) {
  paintSky(g, w, h, horizonY, p);
  const floor = g.createLinearGradient(0, horizonY, 0, h);
  floor.addColorStop(0, p.floorTop);
  floor.addColorStop(1, p.floorBottom);
  g.fillStyle = floor;
  g.fillRect(0, horizonY, w, h - horizonY);
}

function drawSkyLayers(ctx: CanvasRenderingContext2D, v: BackdropView, p: SkyPalette, alpha: number) {
  const { width: w, height: h, dpr, horizonY } = v;
  const key = `${w}:${h}:${dpr}:${Math.round(horizonY)}:${p.name}`;
  ctx.globalAlpha = alpha;
  ctx.drawImage(layer('sky', key, w, h, dpr, g => paintStaticSky(g, w, h, horizonY, p)), 0, 0, w, h);
  const mountainH = Math.min(h * .12, 110), mountainW = Math.max(w, 700) * 1.3;
  const mountains = layer('mountains', `${Math.round(mountainW)}:${Math.round(mountainH)}:${dpr}:${p.name}`, mountainW, mountainH, dpr, g => paintMountains(g, mountainW, mountainH, p, 3));
  tiled(ctx, mountains, w, mountainW, -v.originX * .03, horizonY - mountainH, mountainH);
  const cityH = Math.min(h * .085, 80), cityW = Math.max(w, 700) * 1.1;
  const city = layer('city', `${Math.round(cityW)}:${Math.round(cityH)}:${dpr}:${p.name}`, cityW, cityH, dpr, g => paintCity(g, cityW, cityH, p, 11));
  tiled(ctx, city, w, cityW, -v.originX * .12, horizonY - cityH + 1, cityH);
  ctx.globalAlpha = 1;
}

export function drawBackdrop(ctx: CanvasRenderingContext2D, v: BackdropView): void {
  const { width: w, height: h, horizonY, runwayY } = v;
  drawSkyLayers(ctx, v, v.palette, 1);
  if (v.next && v.blend) drawSkyLayers(ctx, v, v.next, v.blend);
  const p = v.blend && v.next && v.blend > .5 ? v.next : v.palette;

  const depth = Math.max(8, runwayY - horizonY);
  const vx = w * .5;
  const spacing = 64 * v.scale;
  // Solid strokes in depth bands fade the grid toward the horizon; a gradient
  // stroke looks the same but costs several times more fill on phones.
  const bottomU = (h - horizonY) / depth;
  const first = ((v.originX - vx) % spacing + spacing) % spacing + vx - Math.ceil(w * 3 / spacing) * spacing;
  const base = .55 + v.beat * .45;
  ctx.strokeStyle = p.grid;
  ctx.lineWidth = 1.1 + v.beat * .6;
  const bands: [number, number, number][] = [[.02, .12, .12], [.12, .3, .3], [.3, .6, .5], [.6, 1, .74]];
  for (const [f0, f1, alpha] of bands) {
    const u0 = f0 * bottomU, u1 = f1 * bottomU;
    ctx.globalAlpha = base * alpha;
    ctx.beginPath();
    for (let xr = first; xr < vx + w * 3; xr += spacing) {
      const x0 = vx + (xr - vx) * u0, x1 = vx + (xr - vx) * u1;
      if ((x0 < -4 && x1 < -4) || (x0 > w + 4 && x1 > w + 4)) continue;
      ctx.moveTo(x0, horizonY + depth * u0);
      ctx.lineTo(x1, horizonY + depth * u1);
    }
    for (let n = 0; n < 14; n++) {
      const u = 1 / (.42 + .3 * n);
      if (u < u0 || u >= u1) continue;
      const y = horizonY + depth * u;
      if (y > h || y < horizonY + 1) continue;
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();
  }
  if (!v.reducedMotion) {
    // A bright line rolls toward the player on every beat.
    const u = 1 / (4.2 - 3.75 * v.beatPhase);
    const y = horizonY + depth * u;
    if (y < h) {
      // Fades in and out so it never reads as a surface the runner could stand on.
      ctx.globalAlpha = Math.sin(Math.PI * v.beatPhase) * .45;
      ctx.strokeStyle = p.grid;
      ctx.lineWidth = 1 + 2.5 * v.beatPhase;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.horizon;
  ctx.globalAlpha = .75;
  ctx.fillRect(0, horizonY - 1, w, 2);
  ctx.globalAlpha = 1;
}

export function skyPaletteFor(section: number): SkyPalette {
  return SKY_PALETTES[((section % SKY_PALETTES.length) + SKY_PALETTES.length) % SKY_PALETTES.length];
}
