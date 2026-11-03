# Design references

Neon Dash is an independent arcade runner informed by familiar rhythm-platformer conventions: a continuously advancing course, readable hazards, precise jump timing, and a fast retry loop. Geometry Dash is a reference point for those broad genre ideas, not a source of copied levels, characters, art, or branding. The game uses its own neon palette, obstacle rules, procedural circuits, Challenge and Endless modes, and original interface.

## Design choices

- **Simple input, varied timing.** Jump uses one held/repeated action; phase switching adds a second deliberate action for opposite-color gates.
- **Readable hazards.** The playfield stays visually dominant, with crisp silhouettes and a limited palette. Pink hazards remain dangerous in either phase.
- **Learnable generated courses.** A run uses a seed, so retrying can teach its obstacle phrases; a fresh circuit changes the sequence. Recovery space and a capped difficulty ramp help keep generated sequences playable.
- **Music supports anticipation.** Obstacle phrases are built around musical timing, but player timing and collision rules decide the run.
- **Quick, local replay.** Challenge offers a finish goal; Endless offers distance and local records. Progress is stored in the browser without an account or server.

## References

- [Geometry Dash on Steam](https://store.steampowered.com/app/322170/Geometry_Dash/) — official product description for the rhythm-platformer genre reference and its one-touch framing.
- [Geometry Dash Wiki](https://geometrydash.wiki.gg/) — general reference for the genre's obstacle and movement-change conventions.
- [Temple Run FAQ](https://templerun.zendesk.com/hc/en-us/articles/4414248608531-Frequently-Asked-Questions-FAQs) — examples of longer-term objectives in an endless-runner loop.
- [Keep Running: Procedural Level Generation in Sure Footing](https://www.gamedeveloper.com/design/keep-running-procedural-level-generation-in-sure-footing) — design discussion of constraining generated content to manage challenge.
