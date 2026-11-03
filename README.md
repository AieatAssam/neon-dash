# Neon Dash

[Play Neon Dash](https://aieatassam.github.io/neon-dash/)

A full-screen neon endless runner. Jump over spikes, switch phase to pass through the opposite color, and avoid gold spikes in either phase. Each run generates a new circuit and increases in speed; chase your best distance and unlock achievements.

Use Space, Up, or W to jump; X or Shift switches phase. On touch screens, use the on-screen jump and phase controls. P or Escape pauses. Sound is optional, and supported devices provide short haptic feedback. Records and achievements are saved locally in your browser.

Serve this directory with a static HTTP server, for example `python3 -m http.server`, and open the printed local address. The game uses relative paths and can be deployed to GitHub Pages by selecting the repository branch and root folder in Pages settings. No build step or backend is required.

Run simulation tests with `node --test`. See [RESEARCH.md](RESEARCH.md) and [game feel research](GAME_FEEL_RESEARCH.md) for design references and [ATTRIBUTION.md](ATTRIBUTION.md) for audio credits.

## Screenshot

![Neon Dash start screen showing the neon circuit and phase controls](screenshots/neon-dash.png)
