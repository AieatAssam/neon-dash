# Geometry Dash gameplay reference

This clone should capture the feel of a rhythm-based action platformer built around simple, one-touch input and precise timing. The player moves through a scrolling obstacle course; a tap triggers a jump, while level sections can change movement through flight and gravity inversion. Colliding with hazards restarts the attempt, so readable obstacle silhouettes and consistent input timing matter. Music supports the rhythm and anticipation, but the challenge is still platforming skill rather than automatic beat matching.

## Design implications

- Keep the primary control to one button (or its keyboard equivalent), with immediate, predictable response.
- Use a continuously advancing course and clear hazards that reward anticipation and timing.
- Make failure and restart quick, preserving the retry loop.
- Use music and visual cues to reinforce obstacle timing; keep collisions and movement rules consistent.
- Treat alternate movement modes such as flight and gravity changes as variations on the same simple input.

## Sources

- [Geometry Dash on Steam](https://store.steampowered.com/app/322170/Geometry_Dash/) — official store description identifies the game as a rhythm-based action platformer and highlights jumping, flying, flipping, one-touch play, practice mode, and changing gravity.
- [Official Geometry Dash Wiki](https://geometrydash.wiki.gg/) — overview describes the runner-style format, one-touch controls, obstacles, movement-changing transporters, and behavior-changing portals.
