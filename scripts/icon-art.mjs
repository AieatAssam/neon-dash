// App icons, painted from the shipped palette by a tiny deterministic rasterizer.
// Shapes are signed-distance fields using only arithmetic and sqrt, so the same
// source produces the same pixels on every machine. Run `npm run icons` to write them.
import { GAMEPLAY_COLORS as C, SKY_PALETTES } from '../src/art/palette.ts';
import { RUNNER_FACE } from '../runner-visuals.ts';

export const ICON_SKY = SKY_PALETTES.find(p => p.name === 'dusk');
/** Android masks may crop anything outside this radius (fraction of the icon size). */
export const MASKABLE_SAFE_RADIUS = .4;

export const ICONS = Object.freeze([
  { file: 'icon-512.png', size: 512, variant: 'any' },
  { file: 'icon-192.png', size: 192, variant: 'any' },
  { file: 'icon-512-maskable.png', size: 512, variant: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, variant: 'apple' },
  { file: 'favicon-32.png', size: 32, variant: 'favicon' },
]);

/** Corner radius of the rounded tile, as a fraction of the icon size. */
const TILE_RADIUS = .2237;
/** The maskable art is the full scene scaled about the center so the cube, spike
 * and sun sit inside the safe circle; sky, floor and runway still run full bleed. */
const MASKABLE_SCALE = .84;

const FULL = {
  horizon: .63, runway: .83, line: .014,
  sun: { x: .5, y: .47, r: .25, stripes: [[.04, .05], [.2, .075], [.36, .1]] },
  // cos/sin of a 16.26 degree mid-jump tilt (0.96² + 0.28² = 1 exactly).
  cube: { x: .45, y: .49, size: .31, cos: .96, sin: .28 },
  spike: { x0: .6, x1: .76, height: .15 },
  trail: { from: [.1, .695], via: [.25, .5] },
  dashes: [[.15, .29, .405], [.09, .26, .455]],
  stars: true, city: true, grid: true, glow: .016,
};

/** Tabs show 16–32 px: keep only the sun, the runway and a big cube. */
const FAVICON = {
  horizon: .66, runway: .86, line: .045,
  sun: { x: .5, y: .5, r: .31, stripes: [[.18, .1], [.44, .14]] },
  cube: { x: .5, y: .86 - .0225 - .2, size: .4, cos: 1, sin: 0 },
  spike: null, trail: null, dashes: [],
  stars: false, city: false, grid: false, glow: .05,
};

const STARS = [
  [.12, .1, .9], [.26, .2, .6], [.07, .31, .7], [.84, .09, .8], [.92, .24, .6],
  [.72, .15, .5], [.36, .06, .7], [.6, .04, .5], [.18, .4, .4], [.8, .36, .4],
];
const CITY = [[.07, .03], [.05, .045], [.09, .024], [.06, .05], [.08, .034], [.05, .042], [.1, .026], [.06, .048], [.07, .036], [.09, .022]];

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function ramp(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
  }
  return stops.at(-1)[1];
}

function sdBox(x, y, hx, hy) {
  const qx = Math.abs(x) - hx, qy = Math.abs(y) - hy;
  const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0;
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0);
}
function sdPolygon(x, y, pts) {
  let d = Infinity, sign = 1;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[j];
    const ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay;
    const t = clamp01((wx * ex + wy * ey) / (ex * ex + ey * ey));
    const dx = wx - ex * t, dy = wy - ey * t;
    d = Math.min(d, dx * dx + dy * dy);
    const c1 = y >= ay, c2 = y < by, c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sign = -sign;
  }
  return sign * Math.sqrt(d);
}
function sdSegment(x, y, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay;
  const t = clamp01((wx * ex + wy * ey) / (ex * ex + ey * ey));
  const dx = wx - ex * t, dy = wy - ey * t;
  return [Math.sqrt(dx * dx + dy * dy), t];
}

/** Premultiplied float RGBA. `scale` maps canvas units to design units about the center. */
class Raster {
  constructor(n, scale) {
    this.n = n; this.k = scale; this.d = 1 / (n * scale);
    this.px = new Float32Array(n * n * 4);
  }
  cov(sd) { return clamp01(.5 - sd / this.d); }
  /** Shade every pixel whose center falls in the design-space box; shade returns [r, g, b, a] or null. */
  paint(box, shade, additive = false) {
    const { n, k, px } = this;
    const toPx = u => ((u - .5) * k + .5) * n;
    const i0 = Math.max(0, Math.floor(toPx(box[0]) - 1)), i1 = Math.min(n, Math.ceil(toPx(box[2]) + 1));
    const j0 = Math.max(0, Math.floor(toPx(box[1]) - 1)), j1 = Math.min(n, Math.ceil(toPx(box[3]) + 1));
    for (let j = j0; j < j1; j++) {
      const v = .5 + ((j + .5) / n - .5) / k;
      for (let i = i0; i < i1; i++) {
        const u = .5 + ((i + .5) / n - .5) / k;
        const s = shade(u, v);
        if (!s || s[3] <= 0) continue;
        const a = s[3], o = (j * n + i) * 4, keep = additive ? 1 : 1 - a;
        px[o] = s[0] * a + px[o] * keep;
        px[o + 1] = s[1] * a + px[o + 1] * keep;
        px[o + 2] = s[2] * a + px[o + 2] * keep;
        px[o + 3] = additive ? Math.min(1, px[o + 3] + a) : a + px[o + 3] * keep;
      }
    }
  }
  over(other, alpha) {
    const a = this.px, b = other.px;
    for (let o = 0; o < a.length; o += 4) {
      const k = 1 - b[o + 3] * alpha;
      for (let c = 0; c < 4; c++) a[o + c] = b[o + c] * alpha + a[o + c] * k;
    }
  }
  blur(radius, passes = 3) {
    const { n } = this;
    let src = this.px, dst = new Float32Array(src.length);
    const run = (stride, step) => {
      for (let line = 0; line < n; line++) {
        const base = line * stride;
        for (let c = 0; c < 4; c++) {
          let sum = 0;
          for (let t = -radius; t <= radius; t++) sum += src[base + Math.min(n - 1, Math.max(0, t)) * step + c];
          for (let t = 0; t < n; t++) {
            dst[base + t * step + c] = sum / (2 * radius + 1);
            sum += src[base + Math.min(n - 1, t + radius + 1) * step + c] - src[base + Math.max(0, t - radius) * step + c];
          }
        }
      }
      [src, dst] = [dst, src];
    };
    for (let p = 0; p < passes; p++) { run(n * 4, 4); run(4, n * 4); }
    this.px = src;
  }
}

const EVERYWHERE = [-2, -2, 3, 3];

function cubeLocal(c, u, v) {
  const dx = u - c.x, dy = v - c.y;
  return [dx * c.cos + dy * c.sin, -dx * c.sin + dy * c.cos];
}
function spikePoints(scene) {
  const { x0, x1, height } = scene.spike, base = scene.runway - scene.line / 2;
  return [[x0, base], [x1, base], [(x0 + x1) / 2, base - height]];
}
function bezier(t, a, b, c) {
  const s = 1 - t;
  return [s * s * a[0] + 2 * s * t * b[0] + t * t * c[0], s * s * a[1] + 2 * s * t * b[1] + t * t * c[1]];
}

function paintScene(r, scene) {
  const P = Object.fromEntries(Object.entries(ICON_SKY).filter(([, v]) => typeof v === 'string' && v.startsWith('#')).map(([key, v]) => [key, rgb(v)]));
  const G = Object.fromEntries(Object.entries(C).map(([key, v]) => [key, rgb(v)]));
  const H = scene.horizon, R = scene.runway, sun = scene.sun, cube = scene.cube;
  const sky = [[0, P.skyTop], [H * .62, P.skyMid], [H, P.skyLow]];
  const skyCov = v => r.cov(v - H);

  r.paint(EVERYWHERE, (u, v) => {
    const floor = clamp01(.5 + (v - H) / r.d);
    return [...mix(ramp(sky, v), mix(P.floorTop, P.floorBottom, clamp01((v - H) / (1 - H))), floor), 1];
  });
  if (scene.stars) for (const [x, y, a] of STARS) {
    const color = x > .8 ? P.accent : P.star;
    r.paint([x - .01, y - .01, x + .01, y + .01], (u, v) => [...color, a * r.cov(sdBox(u - x, v - y, .0045, .0045))]);
  }
  r.paint([sun.x - sun.r * 2.6, sun.y - sun.r * 2.6, sun.x + sun.r * 2.6, H], (u, v) => {
    const d = Math.sqrt((u - sun.x) ** 2 + (v - sun.y) ** 2);
    return [...P.sunGlow, .333 * clamp01((sun.r * 2.6 - d) / (sun.r * 2)) * skyCov(v)];
  });
  const sunRamp = [[0, P.sunTop], [.55, P.sunMid], [1, P.sunBottom]];
  r.paint([sun.x - sun.r, sun.y - sun.r, sun.x + sun.r, H], (u, v) => {
    let cut = 0;
    for (const [at, width] of sun.stripes) {
      const y0 = sun.y + sun.r * at;
      cut = Math.max(cut, r.cov(Math.max(y0 - v, v - y0 - sun.r * width)));
    }
    const disc = r.cov(Math.sqrt((u - sun.x) ** 2 + (v - sun.y) ** 2) - sun.r);
    return [...ramp(sunRamp, (v - sun.y + sun.r) / (2 * sun.r)), .92 * disc * (1 - cut) * skyCov(v)];
  });
  r.paint([-2, H - .08, 3, H], (u, v) => [...P.horizon, .4 * clamp01(1 - (H - v) / .08) * skyCov(v)]);
  if (scene.city) {
    let x = -1.05;
    for (let i = 0; x < 2; i++) {
      const [w, h] = CITY[i % CITY.length], left = x;
      r.paint([left, H - h - .01, left + w, H], (u, v) => {
        const body = r.cov(sdBox(u - (left + (w - .006) / 2), v - (H - h / 2), (w - .006) / 2, h / 2));
        const edge = r.cov(sdBox(u - (left + (w - .006) / 2), v - (H - h + .0025), (w - .006) / 2, .0025));
        return [...mix(P.city, P.accent, edge * .53), body];
      });
      x += w;
    }
  }
  r.paint([-2, H - .01, 3, H + .01], (u, v) => [...P.horizon, .75 * r.cov(Math.abs(v - H) - .003)]);
  if (scene.grid) {
    const rows = Array.from({ length: 14 }, (_, n) => H + (R - H) / (.42 + .3 * n));
    r.paint([-2, H, 3, 3], (u, v) => {
      let d = Infinity;
      for (let j = -12; j <= 12; j++) {
        const ex = j * .16, ey = 1 - H, len = Math.sqrt(ex * ex + ey * ey);
        d = Math.min(d, Math.abs((u - .5) * ey - (v - H) * ex) / len);
      }
      for (const y of rows) d = Math.min(d, Math.abs(v - y));
      const fade = clamp01((v - H) / (1 - H) * 1.4 + .1);
      return [...P.grid, .72 * fade * r.cov(d - .00175) * r.cov(H - v)];
    });
  }
  r.paint([-2, R, 3, R + .12], (u, v) => [...G.cyan, .19 * clamp01(1 - (v - R) / .12)]);

  // Glow sits under the crisp contours and never replaces them.
  const glow = new Raster(r.n, r.k);
  glow.paint([-2, R - scene.line, 3, R + scene.line], (u, v) => [...G.cyan, r.cov(Math.abs(v - R) - scene.line / 2)]);
  const half = cube.size / 2;
  glow.paint([cube.x - cube.size, cube.y - cube.size, cube.x + cube.size, cube.y + cube.size], (u, v) => {
    const [lx, ly] = cubeLocal(cube, u, v);
    return [...G.cyan, r.cov(sdBox(lx, ly, half, half))];
  });
  if (scene.spike) {
    const pts = spikePoints(scene);
    glow.paint([pts[0][0], pts[2][1], pts[1][0], pts[0][1]], (u, v) => [...G.danger, .8 * r.cov(sdPolygon(u, v, pts))]);
  }
  glow.blur(Math.max(1, Math.round(scene.glow * r.n * r.k)));
  r.over(glow, .9);

  if (scene.trail) {
    const head = [cube.x, cube.y], points = Array.from({ length: 21 }, (_, i) => bezier(i / 20, scene.trail.from, scene.trail.via, head));
    r.paint([scene.trail.from[0] - .05, cube.y - half, cube.x, scene.trail.from[1] + half], (u, v) => {
      let best = Infinity, at = 0;
      for (let i = 1; i < points.length; i++) {
        const [d, t] = sdSegment(u, v, ...points[i - 1], ...points[i]);
        const s = (i - 1 + t) / (points.length - 1);
        const sd = d - half * .9 * (.25 + .75 * s);
        if (sd < best) { best = sd; at = s; }
      }
      return [...G.cyan, (.05 + .4 * at) * r.cov(best)];
    }, true);
  }
  for (const [x0, x1, y] of scene.dashes) {
    r.paint([x0 - .01, y - .01, x1 + .01, y + .01], (u, v) => [...G.violet, .85 * r.cov(sdSegment(u, v, x0, y, x1, y)[0] - .008)]);
  }
  r.paint([-2, R - scene.line, 3, R + scene.line], (u, v) => {
    const line = r.cov(Math.abs(v - R) - scene.line / 2), core = r.cov(Math.abs(v - R) - scene.line / 7);
    return [...mix(G.cyan, G.white, core * .9), line];
  });
  if (scene.spike) {
    const pts = spikePoints(scene), { x0, x1, height } = scene.spike, base = pts[0][1], w = x1 - x0;
    const inner = [[x0 + w * .22, base - .004], [x0 + w * .78, base - .004], [(x0 + x1) / 2, base - .004 - height * .62]];
    const stroke = w * .1 / 2;
    r.paint([x0 - .02, base - height - .02, x1 + .02, base + .02], (u, v) => {
      const sd = sdPolygon(u, v, pts);
      const fill = mix(G.danger, G.void, clamp01((v - (base - height)) / height));
      const edge = r.cov(Math.abs(sd) - stroke), innerEdge = r.cov(Math.abs(sdPolygon(u, v, inner)) - stroke * .45);
      const color = mix(mix(fill, G.danger, edge), G.white, innerEdge);
      return [...color, Math.max(r.cov(sd), edge)];
    });
  }
  const unit = cube.size / 24;
  r.paint([cube.x - cube.size, cube.y - cube.size, cube.x + cube.size, cube.y + cube.size], (u, v) => {
    const [lx, ly] = cubeLocal(cube, u, v);
    const body = r.cov(sdBox(lx, ly, half, half));
    if (!body) return null;
    const border = r.cov(Math.abs(sdBox(lx, ly, half - 1.5 * unit, half - 1.5 * unit)) - 1.5 * unit);
    let white = r.cov(Math.abs(sdBox(lx, ly, half - 4 * unit, half - 4 * unit)) - .5 * unit);
    for (const [x, y, w, h] of RUNNER_FACE) white = Math.max(white, r.cov(sdBox(lx - (x + w / 2) * unit, ly - (y + h / 2) * unit, w / 2 * unit, h / 2 * unit)));
    return [...mix(mix(G.runnerCyanFill, G.cyan, border), G.white, white), body];
  });
}

/** Coverage of the parts that must survive any mask: cube, spike and visible sun. */
function essentialMask(n, scale, scene) {
  const r = new Raster(n, scale), mask = new Float32Array(n * n);
  const half = scene.cube.size / 2, pts = scene.spike && spikePoints(scene), sun = scene.sun;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = .5 + ((i + .5) / n - .5) / scale, v = .5 + ((j + .5) / n - .5) / scale;
    const [lx, ly] = cubeLocal(scene.cube, u, v);
    let c = r.cov(sdBox(lx, ly, half, half));
    if (pts) c = Math.max(c, r.cov(sdPolygon(u, v, pts)));
    c = Math.max(c, Math.min(r.cov(Math.sqrt((u - sun.x) ** 2 + (v - sun.y) ** 2) - sun.r), r.cov(v - scene.horizon)));
    mask[j * n + i] = c;
  }
  return mask;
}

/** Render one icon to straight-alpha RGBA bytes, plus its essential-content mask. */
export function renderIcon({ size, variant }) {
  const scene = variant === 'favicon' ? FAVICON : FULL;
  const scale = variant === 'maskable' ? MASKABLE_SCALE : 1;
  const r = new Raster(size, scale);
  paintScene(r, scene);
  const rgba = new Uint8Array(size * size * 4);
  const tile = variant === 'any' || variant === 'favicon';
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const o = (j * size + i) * 4;
    const m = tile ? clamp01(.5 - sdBox((i + .5) / size - .5, (j + .5) / size - .5, .5 - TILE_RADIUS, .5 - TILE_RADIUS) * size + TILE_RADIUS * size) : 1;
    const a = clamp01(r.px[o + 3]) * m;
    for (let c = 0; c < 3; c++) rgba[o + c] = Math.round(clamp01(a > 0 ? r.px[o + c] * m / a : 0) * 255);
    rgba[o + 3] = Math.round(a * 255);
  }
  return { rgba, essential: essentialMask(size, scale, scene) };
}
