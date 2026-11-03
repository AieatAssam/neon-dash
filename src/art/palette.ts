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
