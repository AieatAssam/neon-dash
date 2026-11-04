# Rendering performance notes

The reproducible `npm run perf` probe builds the production site, runs a fixed-seed opening three times, and reports each run's frame intervals. Its emulated viewport is 390×844 at DPR 3 with 4× CPU throttling. It checks the actual canvas backing size and keeps incomplete runs visible. It is a local smoke test, not a physical-device or GPU benchmark.

On the current headless Chromium host, one three-run sample had mean frame intervals of 72.5, 71.7 and 78.3 ms (median 72.5 ms). Results vary with host load and browser version. This is slower than a 60 Hz frame budget, so the low-end target is not yet demonstrated.

A separate exploratory single-run comparison measured roughly 75 ms baseline, 56.7 ms with the moving skyline/rings/grid omitted, and 100.8 ms with a full-resolution cached skyline. These are short, unpaired measurements, not reliable claims of speedup. The cache experiment was removed because it was slower in that test and added a large translucent bitmap copy. Future changes should use paired runs on the same host, retain visual checks, and prioritize tests on actual low-end phones.
