# Neon Dash art style guide

Last updated 8 Nov 2026, for the synthwave overhaul.

`src/art/palette.ts` is the only place colors are defined. Renderers import:

- `GAMEPLAY_COLORS`;
- `SKY_PALETTES` (dusk, ember, lagoon);
- `SHAFT_PALETTE`;
- `UI_CSS_COLORS`, which feeds the `--ui-*` custom properties.

Vite inlines `UI_CSS_COLORS` into `index.html` for first paint, and `style.css` contains no hex values. Every hex in the palette module is documented below. `tests/style-guide.test.js` fails if one is missing, or if this guide lists a color the palette no longer ships.

## Pillars

- **Readable first.** Every gameplay object has an opaque contour that reads with glow, bloom and the background turned off. Light is decoration on top.
- **Bright sky, dark stage.** The sky sets put their brightest tones in the sun, the horizon line and the far skyline. The floor and the lane that carry gameplay stay dark.
- **One meaning per color.**
  - Pink-red (`danger`) is lethal.
  - Lime (`platform`) is solid ground.
  - Gold is a reward.
  - Cyan and violet are the two phases.
  - White marks inner detail.
- **Everything moves with the music.** The grid, runway, hazards and walls pulse on the 115 BPM beat. With reduced motion the pulse is off.

## Gameplay tokens

| Token | Hex | Use |
| --- | --- | --- |
| `cyan` | `#37ffe7` | Cyan phase: runner contour, runway, cyan gates and spikes, left shaft wall, shield ring, PERFECT and SHIELD popups |
| `violet` | `#dfb8ff` | Violet phase: the same roles in violet; right shaft wall |
| `danger` | `#ff6387` | Universal hazard: neutral spikes, pulses, gap edges, shaft blocks, death flash. Always with a pointed or hatched silhouette |
| `platform` | `#a8ffb5` | Landable platform contour; checkpoint and finish flags; win flash; "NICE!" |
| `platformFill` | `#172941` | Platform body |
| `reward` | `#ffe69a` | Orb body, a rotated square with a white center mark |
| `gold` | `#ffd579` | Orb outline and glow, streak popups, orb particles. Never on hazards or platforms |
| `white` | `#f2ffff` | Inner contours, runner face, runway core, shield-break and warp flashes |
| `runnerCyanFill` | `#138f99` | Runner body in cyan phase |
| `runnerVioletFill` | `#8a35bd` | Runner body in violet phase |
| `void` | `#030713` | Gap interior, base of the spike gradient, hatching on gates and shaft blocks |
| `off` | `#9ba7c5` | Reserved for inactive-phase contours; still contrast-tested. The overhaul draws a passable hazard as a dashed outline in its own phase color at 50–55% alpha instead |
| `safe` | `#37ffe7` | Alias of `cyan` for safe-state indicators; must stay at least 25 ΔE76 from `danger` |

Violet was raised from `#c778ff` to `#dfb8ff` on 3 Nov 2026 so it clears 6:1 on every background. `#c778ff` is retired: `tests/icons.test.js` fails if it appears in any shipped file or icon pixel.

### How objects are drawn

- **Runner.**
  - A 24-unit cube with a body fill, a 3-unit phase-color border and a 1-unit white inner line at 4 units.
  - The face is drawn from `RUNNER_FACE`: two 3×3 eyes and a 10×2 mouth.
  - It squashes on takeoff and landing, spins half a turn per jump, and snaps to the nearest quarter turn on landing.
- **Runway.** A 3 px phase-color line with a 1 px white core and a phase-color band fading below it. Gaps cut it.
- **Lethal spikes.** A vertical gradient from the token color to `void`, a 2.6 px outline in the token color and a white inner outline.
- **Gates.**
  - **Lethal:** a token color fill at 67% alpha, a white inner line and `void` hatching.
  - **Passable:** dashed and faint, in their own phase color.
- **Pulses.** A dim 5 px strip while dormant, then a flashing dashed outline as a warning. When active, a solid `danger` block with a white inner line.
- **Gaps.** A `void` interior with `danger` edges fading downward.
- **Platforms.** A `platformFill` body, a 2 px `platform` outline and a 1 px white top line.
- **Orbs.** A rotated `reward` square with a `gold` outline and a white center.
- **Shield orb.** A `cyan` ring, a spinning arc and a white shield glyph.

## Backgrounds: sky sets

The horizontal run cycles through three sky sets. A new section starts every 5,600 distance units and crossfades into the next set over its last 800 units.

| Key | Dusk | Ember | Lagoon | Role |
| --- | --- | --- | --- | --- |
| `skyTop` | `#05021a` | `#090218` | `#010a1c` | Sky gradient, top stop |
| `skyMid` | `#1d0a49` | `#2c0838` | `#06244a` | Sky gradient at 62% of the way to the horizon |
| `skyLow` | `#4a1167` | `#6a1748` | `#0c4469` | Sky gradient at the horizon; base of the mountain fill |
| `horizon` | `#ff3ca6` | `#ff6a3d` | `#2ee6ff` | 2 px horizon line at 75%, and a glow band rising 8% of the height above it at 40% |
| `sunTop` | `#ffe46b` | `#fff27a` | `#f4ff9a` | Sun gradient, top |
| `sunMid` | `#ff8a5c` | `#ffa53d` | `#5effc8` | Sun gradient at 55% |
| `sunBottom` | `#ff2f92` | `#ff3d6e` | `#2b9cff` | Sun gradient, bottom |
| `sunGlow` | `#ff3ca6` | `#ff7a3d` | `#2ee6ff` | Radial halo, 33% at 0.6 r fading to 0 at 2.6 r |
| `star` | `#d6dcff` | `#ffe3f1` | `#d8fbff` | 80% of the 90 stars |
| `accent` | `#ff4fd8` | `#ffb347` | `#37ffe7` | The other 20% of stars, mountain ridge (60%), skyline roof edges (53%), some windows |
| `window` | `#7ad7ff` | `#ff8fd6` | `#ff7ae0` | Lit skyline windows, 45–85% |
| `mountain` | `#24104a` | `#2e0b3a` | `#082a48` | Mountain silhouette, top of its gradient |
| `city` | `#0d0526` | `#110420` | `#020c1d` | Skyline silhouettes |
| `floorTop` | `#14062f` | `#1a0527` | `#04142d` | Floor gradient at the horizon |
| `floorBottom` | `#030713` | `#040611` | `#020611` | Floor gradient at the bottom edge |
| `grid` | `#ff3ca6` | `#ff4fa3` | `#37b8ff` | Perspective grid and the rolling beat line |
| `gridHot` | `#ffd6f2` | `#ffe0ef` | `#d0f6ff` | Reserved hot-grid highlight; not drawn at present |

In lagoon, `skyLow` was darkened by 8% on 8 Nov 2026 so violet reaches 6:1 on it.

### Composition

1. **Static sky, cached as one image per palette and size:**
   - The sky gradient and stars.
   - The sun: radius \(\min(0.3w, 0.17h, 170)\), centered at 64% of the width and set 0.32 r above the horizon. Seven bands are cut out of its lower half, and it is drawn at 92%.
   - The halo, the horizon glow band and the floor gradient.
2. **Mountains:** height \(\min(0.12h, 110)\), parallax 0.03.
3. **Skyline:** height \(\min(0.085h, 80)\), parallax 0.12. Both are cached tiles.
4. **Floor grid, drawn live:**
   - It scrolls 1:1 with the runway at runway depth, so the floor never slides under the runner.
   - It is drawn in four solid depth bands at 12%, 30%, 50% and 74% alpha, times \(0.55 + 0.45 \times \text{beat}\).
   - Line width is \(1.1 + 0.6 \times \text{beat}\) px.
   - A brighter line rolls toward the player each beat. It fades in and out (at most 45%) so it never reads as a surface.
5. **Horizon line.**

The horizon sits at \(\min(\text{runway} - 60, 0.4h)\) in portrait and \(0.43h\) in landscape. The sun sits right of center, away from the runner (10–20% of the width), so bright light stays out from behind the cube.

## Backgrounds: the vertical shaft

The shaft has its own cool palette, so the scene change reads instantly.

| Key | Hex | Role |
| --- | --- | --- |
| `skyTop` | `#02031a` | Tunnel gradient, top |
| `skyMid` | `#0a0b3a` | Tunnel gradient, middle; side fades in landscape |
| `skyLow` | `#1a0f5c` | Tunnel gradient, bottom |
| `floorBottom` | `#02030f` | Lane shade (69% over the gradient), lane edge fades |
| `star` | `#cfe8ff` | Streaming star streaks (80%) |
| `accent` | `#37ffe7` | Streaming star streaks (20%) |
| `city` | `#070420` | Side towers in landscape |
| `grid` | `#6a5cff` | Lane grid, scrolls 1:1 with the climb, \(0.28 + 0.3 \times \text{beat}\) alpha |
| `horizon` | `#8a5cff` | Unused by the shaft renderer |
| `sunTop` | `#ffffff` | Unused by the shaft renderer |
| `sunMid` | `#b39dff` | Unused by the shaft renderer |
| `sunBottom` | `#37ffe7` | Unused by the shaft renderer |
| `sunGlow` | `#8a5cff` | Unused by the shaft renderer |
| `window` | `#dfb8ff` | Unused by the shaft renderer |
| `mountain` | `#120c3a` | Unused by the shaft renderer |
| `floorTop` | `#070726` | Unused by the shaft renderer |
| `gridHot` | `#e0d8ff` | Unused by the shaft renderer |

`SHAFT_PALETTE` shares the `SkyPalette` shape, so every key has a value. The rows marked unused are not drawn today.

Shaft rules:

- **Lane width.** The lane fills the width in portrait. In landscape it is centered, and side towers in `city` with cyan and violet edge strips keep the margins alive.
- **Walls.** The active wall is a solid 4 px phase-color bar with a white core, a glow fading inward and scrolling arrow ticks. The idle wall is at 45%.
- **Blocks.** Shaft blocks are `danger`, fading to 60% at the bottom, with `void` hatching and a 2 px white outline. A chevron in the color of the open side's wall points at the way through. A shattered block is left as a faint dashed outline.
- **Warp.** The world rotates a quarter turn into the shaft and back out, with white speed lines and a white flash on arrival.

## Glow and bloom

- **Glow never replaces a contour.** Each object draws its glow first, then its opaque shape on top.
- **Glow is cached.** Glow sprites are rasterized once per shape, size, color and blur, using canvas `shadowBlur` into an offscreen canvas. `GlowCache` holds them, up to 10 megapixels and 160 entries, so a frame only blits sprites.
- **Glow size** is a multiple of `glowUnit`: \(0.9 \times\) the runner width on the runway, and 22 in the shaft.

  | Object | Multiplier |
  | --- | --- |
  | Portal | 1.6 |
  | Runway | 1.2 |
  | Runner, lethal gate, shaft block | 1.1 |
  | Pulse, shield orb | 1.0 |
  | Spike | 0.9 |
  | Orb | 0.8 |
  | Platform | 0.7 |

  Lethal spikes, gates and shaft blocks scale their glow alpha with the beat.
- **Bloom** is one cheap full-screen pass:
  1. Downsample the frame to 1/6.
  2. Multiply it by itself twice, so only bright light survives.
  3. Fold in a half-size copy at 57% for width.
  4. Add the result back with `lighter` at 35%.

  Bloom only brightens light that is already there. Nothing may depend on it to be seen.

## Trail, particles and screen effects

- **Trail.**
  - **On the runway:** a tapered ribbon of 18 quads covering the last 0.5 s, drawn with additive light in the phase color. Width runs from 25% to 100% of the half-cube. Alpha is \((0.12 + 0.3 \times \text{heat}) \times t + 0.05\), where heat is \(\min(1, \text{streak}/30)\). At heat above 0.5, the newest 30% of the ribbon turns white.
  - **In the shaft:** 14 shrinking squares over 0.4 s.
- **Particles.** A pool of at most 320, all additive. There are three shapes: square, spinning shard and streak.

  | Event | Particles |
  | --- | --- |
  | Jump | 7 white dust |
  | Land | 8 phase-color sparks |
  | Orb | 14 gold |
  | Phase swap | 12 phase color |
  | Shield pickup | 18 cyan |
  | Shield break | 24 cyan shards |
  | Checkpoint | 10 `platform` |
  | Death | 36 phase-color shards, 34 `danger` sparks and 16 white streaks |
  | Win | 22 shards each of gold, cyan, violet and `platform` |

- **Shake.** Trauma² × 9 px, decaying at 1.6 per second. The frame is over-scaled while shaking, so no edge shows.
  - **Death:** 0.75.
  - **Shield break:** 0.35.
- **Flash.** An additive full-screen fill, capped at 60% and decaying at 3.2 per second.
  - **Death:** `danger` at 0.5.
  - **Win:** `platform` at 0.45.
  - **Shield break:** white at 0.35.
  - **Entering the shaft:** white at 0.55.
  - **Leaving the shaft:** white at 0.45.
- **Popups.** Barlow Condensed 800, with a 4 px outline in dusk `skyTop` (`#05021a`). They pop in, drift up and fade.

## Low-end and reduced-motion fallback

- **Adaptive quality.** Real frame time is smoothed (EMA, α 0.1) on the title demo and during play, from the ninth steady frame. Once 20 steady frames are measured, if the cost stays above 26 ms, bloom switches off and particle density drops to 60%. Glow sprites stay: they are cached blits, and gameplay never depends on them.
- **High-DPR glow.** Glow sprites are rasterized at no more than 1.5× device scale, with blur rounded to 3 px steps. That bounds memory and fill on 3× screens without softening the crisp contours, which are drawn at full resolution.
- **Bloom off by request.** `?bloom=off` disables bloom.
- **`prefers-reduced-motion`.** Disables:
  - bloom;
  - shake;
  - the beat pulse and rolling beat line;
  - the warp rotation;
  - cube spin and the title demo.

  Contours and colors are unchanged.

## UI tokens

These are CSS custom properties named `--ui-<token>`. Alpha variants such as `--ui-cyan-44` are derived in `palette.ts`.

| Token | Hex | Use |
| --- | --- | --- |
| `cyan` | `#37ffe7` | Logo "DASH", PLAY and RETRY buttons, banner gradient |
| `violet` | `#dfb8ff` | Banner gradient, progress fill |
| `white` | `#f2ffff` | Text, focus rings, selected chip text |
| `black` | `#000000` | Progress text shadow |
| `ink` | `#070b19` | Page and overlay base, pills, banners; `theme_color` and `background_color` in the manifest |
| `surface` | `#0a1635` | Icon buttons, touch buttons, mode chips, toggles |
| `button-ink` | `#061d25` | Text on cyan buttons and the NEW BEST! badge |
| `cyan-shadow` | `#105d70` | 3D shadow under cyan buttons |
| `cyan-highlight` | `#b4fff0` | Logo and button highlight |
| `border` | `#8098bd` | Progress track, chips, hint keys, toggles |
| `border-bright` | `#85d5ee` | Jump button ring |
| `muted` | `#a1b5cc` | Hint line, result kicker, text buttons, off toggles |
| `body` | `#b2c7d7` | Mode chip text |
| `credit` | `#60778f` | Audio credit |
| `pink` | `#ff3ca6` | Logo "NEON", selected chip, result score, progress fill |
| `pink-light` | `#ffd3ec` | Logo "NEON" highlight |
| `pink-glow` | `#ff58be` | Glow behind "NEON", the selected chip and the score |
| `violet-glow` | `#7c45ff` | Glow on icon buttons, teach pills, phase button, pause heading |
| `lime` | `#a8ffb5` | Practice badge, completed-level score |
| `gold` | `#ffc46a` | Best marker, "best" line, NEW BEST! badge, big teach prompts |
| `blue` | `#537bff` | Reserved; not referenced by the current stylesheet |
| `heading-shadow` | `#13233b` | Reserved; not referenced by the current stylesheet |
| `selected-surface` | `#16435b` | Reserved; not referenced by the current stylesheet |
| `subtle` | `#86a0b5` | Reserved; not referenced by the current stylesheet |
| `surface-raised` | `#16214d` | Reserved; not referenced by the current stylesheet |

## Contrast audit

Contrast uses WCAG relative luminance:

1. Convert each 8-bit sRGB channel to linear light.
2. Compute \(L = 0.2126 R + 0.7152 G + 0.0722 B\).
3. Contrast is \((L_\text{lighter} + 0.05) / (L_\text{darker} + 0.05)\).

The rule: every gameplay token is tested against every opaque surface it can sit on, in all four scenes (dusk, ember, lagoon and shaft). Those surfaces are `skyTop`, `skyMid`, `skyLow`, `mountain`, `city`, `floorTop` and `floorBottom`.

| Tokens | Minimum contrast |
| --- | --- |
| Cyan, violet, platform, reward, white, gold | 6:1 |
| Danger | 3:1 |
| Off | 2.5:1 |

The horizon line, sun and halos are decorative light. They are kept out from behind contours by layout and checked in screenshot review.

Measured minimums (the darkest case is always `skyLow`):

| Scene | Violet | Off | Danger | Cyan |
| --- | ---: | ---: | ---: | ---: |
| Dusk | 7.94:1 | 5.57:1 | 4.71:1 | 10.61:1 |
| Ember | 6.80:1 | 4.77:1 | 4.04:1 | 9.09:1 |
| Lagoon | 6.08:1 | 4.26:1 | 3.61:1 | 8.12:1 |
| Shaft | 9.82:1 | 6.89:1 | 5.83:1 | 13.12:1 |

Danger and safe differ by 118.3 CIELAB ΔE76, and platform and danger by 108.1. The rule is at least 25, using sRGB primaries and the D65 white. Shape carries meaning too: spikes are pointed, gates hatched, passable hazards dashed, and platforms flat-topped. Run `npx tsx --test tests/palette.test.js` for these checks.

## App icons

The PWA icons are generated, never hand-edited. Run `npm run icons` (which runs `scripts/generate-icons.mjs`) to rewrite `public/icons/`. `tests/icons.test.js` fails if a committed icon differs from the generator, so palette changes must be followed by `npm run icons`.

`scripts/icon-art.mjs` paints them with a small signed-distance rasterizer that uses only arithmetic and `sqrt`, so the output is identical on every machine.

- **Scene.**
  - The dusk sky set: sky gradient, stars, a striped sun with halo, skyline, horizon line and the pink beat grid.
  - The cyan runway.
  - The runner cube mid-jump, tilted 16°, with its in-game proportions and face.
  - A cyan ribbon trail, two `violet` speed dashes, and a `danger` spike ahead on the runway.
  - Glow under the shapes, as in game.
- **Files:**

  | File | Size | Shape |
  | --- | --- | --- |
  | `icon-512.png` | 512 | Rounded tile, corner radius 22.37%, transparent corners |
  | `icon-192.png` | 192 | Rounded tile |
  | `icon-512-maskable.png` | 512 | Full bleed. The scene is scaled to 84% about the center, so the cube, spike and sun stay inside the 40% safe circle. They reach 34.7%, and the test fails above 40% |
  | `apple-touch-icon.png` | 180 | Full bleed and opaque; iOS applies its own mask |
  | `favicon-32.png` | 32 | Simplified for browser tabs: rounded tile, sun, runway and a large cube, with no grid, skyline, spike or trail |

## Sizing

- **Runner.** At least 20 CSS px on portrait phones. Portrait frames about 430 world units across with the runner near the left edge.
- **Touch targets.** At least 44 CSS px; PLAY is at least 56 px tall.
- **Glow scale.** Glow scales with `glowUnit`, never with the screen.
