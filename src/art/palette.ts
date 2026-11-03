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
  '--ui-white': UI_COLORS['white'],
};
