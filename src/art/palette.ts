/** Gameplay contours are opaque. Glow and atmosphere may use alpha, contours may not. */
export const GAMEPLAY_COLORS = {
  cyan: '#37ffe7',
  violet: '#dfb8ff',
  off: '#9ba7c5',
  danger: '#ff6387',
  safe: '#37ffe7',
  platform: '#a8ffb5',
  reward: '#ffe69a',
  white: '#f2ffff',
  gold: '#ffd579',
  runnerCyanFill: '#138f99',
  runnerVioletFill: '#8a35bd',
  platformFill: '#172941',
  void: '#030713',
} as const;

export const ART_PALETTES = [
  { name: 'midnight', top: '#100728', horizon: '#173855', floor: '#120b30', pink: '#ff3ca6', blue: '#347cff', ...GAMEPLAY_COLORS },
  { name: 'orchid', top: '#150827', horizon: '#462252', floor: '#180b2d', pink: '#ff5a79', blue: '#9161ff', ...GAMEPLAY_COLORS },
  { name: 'lagoon', top: '#061a2c', horizon: '#124458', floor: '#071b31', pink: '#fa55e7', blue: '#24b8ff', ...GAMEPLAY_COLORS },
] as const;

/** Synthwave sky sets. Bright tones stay on the horizon and sun, behind the
 * dark floor that carries gameplay, so hazards never sit on a bright field. */
export interface SkyPalette {
  name: string;
  skyTop: string; skyMid: string; skyLow: string; horizon: string;
  sunTop: string; sunMid: string; sunBottom: string; sunGlow: string;
  star: string; accent: string; window: string; mountain: string; city: string;
  floorTop: string; floorBottom: string; grid: string; gridHot: string;
}

export const SKY_PALETTES: readonly SkyPalette[] = Object.freeze([
  { name: 'dusk', skyTop: '#05021a', skyMid: '#1d0a49', skyLow: '#4a1167', horizon: '#ff3ca6',
    sunTop: '#ffe46b', sunMid: '#ff8a5c', sunBottom: '#ff2f92', sunGlow: '#ff3ca6',
    star: '#d6dcff', accent: '#ff4fd8', window: '#7ad7ff', mountain: '#24104a', city: '#0d0526',
    floorTop: '#14062f', floorBottom: '#030713', grid: '#ff3ca6', gridHot: '#ffd6f2' },
  { name: 'ember', skyTop: '#090218', skyMid: '#2c0838', skyLow: '#6a1748', horizon: '#ff6a3d',
    sunTop: '#fff27a', sunMid: '#ffa53d', sunBottom: '#ff3d6e', sunGlow: '#ff7a3d',
    star: '#ffe3f1', accent: '#ffb347', window: '#ff8fd6', mountain: '#2e0b3a', city: '#110420',
    floorTop: '#1a0527', floorBottom: '#040611', grid: '#ff4fa3', gridHot: '#ffe0ef' },
  { name: 'lagoon', skyTop: '#010a1c', skyMid: '#06244a', skyLow: '#0d4a72', horizon: '#2ee6ff',
    sunTop: '#f4ff9a', sunMid: '#5effc8', sunBottom: '#2b9cff', sunGlow: '#2ee6ff',
    star: '#d8fbff', accent: '#37ffe7', window: '#ff7ae0', mountain: '#082a48', city: '#020c1d',
    floorTop: '#04142d', floorBottom: '#020611', grid: '#37b8ff', gridHot: '#d0f6ff' },
].map(p => Object.freeze(p)));

/** The shaft uses its own cool palette so the scene change reads instantly. */
export const SHAFT_PALETTE: SkyPalette = Object.freeze({
  name: 'shaft', skyTop: '#02031a', skyMid: '#0a0b3a', skyLow: '#1a0f5c', horizon: '#8a5cff',
  sunTop: '#ffffff', sunMid: '#b39dff', sunBottom: '#37ffe7', sunGlow: '#8a5cff',
  star: '#cfe8ff', accent: '#37ffe7', window: '#dfb8ff', mountain: '#120c3a', city: '#070420',
  floorTop: '#070726', floorBottom: '#02030f', grid: '#6a5cff', gridHot: '#e0d8ff',
});

function linearRgb(hex: string): number[] {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Expected opaque six-digit hex color: ${hex}`);
  return [1, 3, 5].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
}

/** WCAG relative-luminance contrast, including the 0.05 flare term. */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, blue] = linearRgb(hex);
    return .2126 * r + .7152 * g + .0722 * blue;
  };
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}

function lab(hex: string): number[] {
  const [r, g, b] = linearRgb(hex);
  const xyz = [
    (.4124564 * r + .3575761 * g + .1804375 * b) / .95047,
    .2126729 * r + .7151522 * g + .072175 * b,
    (.0193339 * r + .119192 * g + .9503041 * b) / 1.08883,
  ].map(value => value > (6 / 29) ** 3 ? Math.cbrt(value) : value / (3 * (6 / 29) ** 2) + 4 / 29);
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
}

/** CIELAB Delta E 1976, D65 reference white, standard sRGB primaries. */
export function colorDifference(a: string, b: string): number {
  const first = lab(a), second = lab(b);
  return Math.hypot(...first.map((value, index) => value - second[index]));
}

/** Shared UI colors. Closely related text, cyan, and surface shades share a token. */
const UI_COLORS = {
  'cyan': GAMEPLAY_COLORS.cyan,
  'violet': GAMEPLAY_COLORS.violet,
  'white': GAMEPLAY_COLORS.white,
  'black': '#000000',
  'ink': '#070b19',
  'surface': '#0a1635',
  'surface-raised': '#16214d',
  'button-ink': '#061d25',
  'cyan-shadow': '#105d70',
  'heading-shadow': '#13233b',
  'selected-surface': '#16435b',
  'blue': '#537bff',
  'violet-glow': '#7c45ff',
  'border': '#8098bd',
  'border-bright': '#85d5ee',
  'muted': '#a1b5cc',
  'subtle': '#86a0b5',
  'credit': '#60778f',
  'body': '#b2c7d7',
  'cyan-highlight': '#b4fff0',
  'pink-glow': '#ff58be',
  'pink': '#ff3ca6',
  'pink-light': '#ffd3ec',
  'lime': GAMEPLAY_COLORS.platform,
  'gold': '#ffc46a',
} as const;

/** Alpha variants are derived here so CSS contains no independent color values. */
export const UI_CSS_COLORS: Record<string, string> = {
  '--ui-black': UI_COLORS['black'],
  '--ui-blue': UI_COLORS['blue'],
  '--ui-blue-22': `${UI_COLORS['blue']}22`,
  '--ui-body': UI_COLORS['body'],
  '--ui-border-3d': `${UI_COLORS['border']}3d`,
  '--ui-border-55': `${UI_COLORS['border']}55`,
  '--ui-border-77': `${UI_COLORS['border']}77`,
  '--ui-border-bright-88': `${UI_COLORS['border-bright']}88`,
  '--ui-button-ink': UI_COLORS['button-ink'],
  '--ui-credit': UI_COLORS['credit'],
  '--ui-cyan': UI_COLORS['cyan'],
  '--ui-cyan-16': `${UI_COLORS['cyan']}16`,
  '--ui-cyan-22': `${UI_COLORS['cyan']}22`,
  '--ui-cyan-33': `${UI_COLORS['cyan']}33`,
  '--ui-cyan-44': `${UI_COLORS['cyan']}44`,
  '--ui-cyan-55': `${UI_COLORS['cyan']}55`,
  '--ui-cyan-66': `${UI_COLORS['cyan']}66`,
  '--ui-cyan-88': `${UI_COLORS['cyan']}88`,
  '--ui-cyan-ed': `${UI_COLORS['cyan']}ed`,
  '--ui-cyan-highlight': UI_COLORS['cyan-highlight'],
  '--ui-cyan-shadow': UI_COLORS['cyan-shadow'],
  '--ui-gold': UI_COLORS['gold'],
  '--ui-gold-66': `${UI_COLORS['gold']}66`,
  '--ui-lime': UI_COLORS['lime'],
  '--ui-lime-55': `${UI_COLORS['lime']}55`,
  '--ui-pink': UI_COLORS['pink'],
  '--ui-pink-light': UI_COLORS['pink-light'],
  '--ui-pink-glow-33': `${UI_COLORS['pink-glow']}33`,
  '--ui-pink-glow-55': `${UI_COLORS['pink-glow']}55`,
  '--ui-heading-shadow': UI_COLORS['heading-shadow'],
  '--ui-ink': UI_COLORS['ink'],
  '--ui-ink-1c': `${UI_COLORS['ink']}1c`,
  '--ui-ink-80': `${UI_COLORS['ink']}80`,
  '--ui-ink-99': `${UI_COLORS['ink']}99`,
  '--ui-ink-bb': `${UI_COLORS['ink']}bb`,
  '--ui-ink-e0': `${UI_COLORS['ink']}e0`,
  '--ui-muted': UI_COLORS['muted'],
  '--ui-pink-glow-44': `${UI_COLORS['pink-glow']}44`,
  '--ui-pink-glow-88': `${UI_COLORS['pink-glow']}88`,
  '--ui-selected-surface': UI_COLORS['selected-surface'],
  '--ui-subtle': UI_COLORS['subtle'],
  '--ui-surface-77': `${UI_COLORS['surface']}77`,
  '--ui-surface-99': `${UI_COLORS['surface']}99`,
  '--ui-surface-aa': `${UI_COLORS['surface']}aa`,
  '--ui-surface-bb': `${UI_COLORS['surface']}bb`,
  '--ui-surface-raised-44': `${UI_COLORS['surface-raised']}44`,
  '--ui-surface-raised-cc': `${UI_COLORS['surface-raised']}cc`,
  '--ui-violet': UI_COLORS['violet'],
  '--ui-violet-glow-44': `${UI_COLORS['violet-glow']}44`,
  '--ui-violet-glow-55': `${UI_COLORS['violet-glow']}55`,
  '--ui-violet-glow-88': `${UI_COLORS['violet-glow']}88`,
  '--ui-white': UI_COLORS['white'],
};
