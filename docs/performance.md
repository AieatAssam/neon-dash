# Rendering performance notes

`npm run perf` builds the production site, plays a fixed-seed opening three times, and reports frame intervals. It emulates a 390×844 phone at DPR 3 with 4× CPU throttling. It checks the canvas backing size and keeps incomplete runs visible. It is a smoke test in headless software rendering, not a GPU or physical-device benchmark.

## Current numbers (8 Nov 2026, same host, paired runs)

| Build | Median frame interval |
| --- | --- |
| Before the overhaul (flat backdrop, no bloom) | 16.7 ms |
| After the overhaul | 24.2 ms |

The new renderer draws far more: a parallax sky, a beat grid, glow on every hazard, a trail and particles. It stays playable on this throttled software path because of five measures:

- **Cached layers.** The sky, sun, stars, mountains and skyline are pre-rendered once per palette and size, then blitted. So is the shaft's background gradient.
- **A cheaper grid.** The perspective grid is stroked in four solid alpha bands instead of with a gradient stroke. Profiling with forced flushes put the gradient version at about 12 ms per frame at DPR 2, and the banded version at about 2 ms.
- **Cached glows.** Hazard glows come from a sprite cache, not live `shadowBlur`.
- **A cheap bloom.** Bloom downsamples by 6, blurs by squaring twice, and composites with a single full-screen `lighter` draw.
- **Adaptive quality.** It measures real frames on the title screen and during play. If the smoothed frame cost stays above 26 ms, bloom turns off and particle density drops to 60%. On this probe that happens during the title demo, before the first run.

With bloom off at DPR 2, a profiled horizontal frame costs about 10 ms and a shaft frame about 10.5 ms. Before the grid and shaft fixes they were about 22.5 ms and 22 ms.

GPU-backed canvases on real phones handle the blits and bloom much more cheaply than this software path. Test on a low-end Android device before tightening the budget further.
