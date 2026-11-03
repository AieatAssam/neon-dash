# Neon Dash art palette

`src/art/palette.ts` is the source of named canvas colors. The midnight, orchid,
and lagoon schemes preserve the current background sequence. Gameplay colors stay
consistent between schemes so players do not relearn the visual language.

| Token | Use |
| --- | --- |
| `top`, `horizon`, `floor` | Background gradient stops and floor fill |
| `pink`, `blue` | Decorative architecture, grid and atmospheric light only |
| `cyan`, `violet` | Opaque active phase contours, runner border and phase HUD |
| `off` | Opaque inactive phase contour; use a dashed line as a second cue |
| `danger` | Universal spike and gap danger contours; pair with pointed silhouettes |
| `safe` | Safe-state indicators; keep distinct from universal danger |
| `platform`, `platformFill` | Landable platform top contour and body |
| `reward` | Orb body; retain its diamond silhouette and central mark |
| `white` | Small inner contour and runner face details |
| `gold` | Reward-only accent; never use on hazards or platforms |
| `runnerCyanFill`, `runnerVioletFill` | Runner body fills |
| `void` | Gap interior |

## Renderer integration

Import `ART_PALETTES` and `GAMEPLAY_COLORS` from `./src/art/palette` in `main.ts`.
Replace its inline three-element `palettes` array with `ART_PALETTES`, retaining
`Math.floor(distance / 4800) % ART_PALETTES.length`. Replace the global CYAN and
VIOLET hex literals with `GAMEPLAY_COLORS.cyan` and `.violet`.

Use `.danger` for universal spike/gap borders, `.platform` for platform borders,
`.reward` for orb fills, `.danger` for neutral solid gate borders, and `.white` for their
inner marks. Active phase obstacles use `.cyan` or `.violet`; inactive phase
obstacles use `.off` at alpha 1. Give inactive gates dashed borders or a visible
phase glyph as well. Atmosphere may use pink/blue alpha suffixes, but never fade
the gameplay contour. Keep glow separate from the solid outline so its bloom is
not required to see the object. Set CSS `--cyan` and `--violet` to the matching
values and use those same values for the dynamic `--phase` property.

## Contrast audit

Tests use WCAG relative luminance: convert each 8-bit sRGB channel to linear light,
then `L = 0.2126 R + 0.7152 G + 0.0722 B`. Contrast is
`(Llighter + 0.05) / (Ldarker + 0.05)`. Each scheme tests the opaque violet and
off-phase tokens against **all three** background stops. Violet must reach 6:1;
off-phase contours must reach 2.5:1. Test every stop, including the brightest
horizon, rather than averaging the scene. Violet was raised from `#c778ff` to
`#dfb8ff` to pass the lagoon horizon.

Measured minimum contrast over all three stops:

| Scheme | Violet | Off phase | Danger–safe ΔE76 |
| --- | ---: | ---: | ---: |
| Midnight | 7.176:1 | 5.035:1 | 118.321 |
| Orchid | 7.720:1 | 5.417:1 | 118.321 |
| Lagoon | 6.239:1 | 4.378:1 | 118.321 |

Danger versus safe color difference uses **CIELAB Delta E 1976**, the Euclidean
distance between L*, a*, b* coordinates. Conversion uses standard sRGB primaries
and the D65 reference white. Every scheme must reach Delta E 76 >= 25. This is
an explicit reproducible interpretation of “color difference >=25”; the numerical
threshold is not a claim about color-vision-deficiency accessibility. Silhouette,
solid/dashed contours and marks also communicate gameplay state.

These numeric checks cover base gradient colors and opaque contours. Decorative
halos, screen flashes and object overlaps still require screenshot review: do not
place bright atmospheric highlights directly behind essential contours.

Run `timeout 30s npx tsx --test tests/palette.test.js` for the palette checks.

## Art pillars and sizing

- **Readable first:** collision contours remain crisp above background detail; dashed outlines mark inactive phase hazards.
- **Electric depth:** layered grids and architecture support motion without hiding the route.
- **Consistent meaning:** pink means danger, lime indicates a solid platform, and gold is reserved for rewards.

| Token | Hex | Meaning |
| --- | --- | --- |
| `cyan` / `safe` | `#37ffe7` | Cyan phase and safe indicators |
| `violet` | `#dfb8ff` | Violet phase |
| `off` | `#9ba7c5` | Inactive phase, also dashed |
| `danger` | `#ff6387` | Universal hazard |
| `platform` | `#a8ffb5` | Landable geometry |
| `reward` | `#ffe69a` | Collectible body |
| `gold` | `#ffd579` | Reward accent |
| `white` | `#f2ffff` | Inner marks |
| `platformFill` | `#172941` | Platform body |
| `void` | `#030713` | Gap interior |

Glow is a multiple of the on-screen cube size and never replaces the opaque contour. On portrait phones the cube is at least 28 CSS pixels; in-world labels are at least 12 CSS pixels. Touch actions should remain at least 44 CSS pixels high.

| Scheme token | Midnight | Orchid | Lagoon | Meaning |
| --- | --- | --- | --- | --- |
| `top` | `#100728` | `#150827` | `#061a2c` | Upper background |
| `horizon` | `#173855` | `#462252` | `#124458` | Horizon background |
| `floor` | `#120b30` | `#180b2d` | `#071b31` | Floor background |
| `pink` | `#ff3ca6` | `#ff5a79` | `#fa55e7` | Decorative architecture |
| `blue` | `#347cff` | `#9161ff` | `#24b8ff` | Decorative architecture |
| `runnerCyanFill` | `#138f99` | `#138f99` | `#138f99` | Cyan runner body |
| `runnerVioletFill` | `#8a35bd` | `#8a35bd` | `#8a35bd` | Violet runner body |

UI surfaces and typography use the `UI_COLORS` tokens in the same palette module. Their alpha variants are derived centrally as `--ui-*` CSS properties. The shared cyan, violet and white tokens match the gameplay palette. UI accents use blue `#537bff`, violet glow `#7c45ff`, pink glow `#ff58be` and reward gold `#ffc46a`; interface surfaces use ink `#070b19`, surface `#0a1635` and raised surface `#16214d`.
