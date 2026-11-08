/** Deterministic player: switch before gates, jump before hazards, and use
 * the last forty units of each stepping stone as the next takeoff runway. */
export function courseInput(game) {
  const s = game.state;
  if (game.verticalState) {
    const lookahead = Math.max(600, Math.min(310, game.state.speed) * 2.1);
    const nextWall = game.verticalObstacles.find(obstacle =>
      !obstacle.passive &&
      obstacle.y + obstacle.height > game.verticalState.y && game.verticalState.y >= obstacle.y - lookahead,
    );
    const safePhase = nextWall ? (nextWall.x === 0 ? 1 : 0) : game.verticalState.phase;
    return { jump: false, togglePhase: Boolean(nextWall && safePhase !== game.verticalState.phase) };
  }
  const x = s.distance + s.runner.x;
  const bottom = s.runner.y + s.runner.height;
  const platform = s.terrain.find(t => t.kind === 'platform' && x + s.runner.width > t.x && x < t.x + t.width &&
    Math.abs(bottom - (game.config.groundY - t.height)) < .01);
  const next = [...s.obstacles, ...s.terrain].filter(o =>
    o.x + o.width > x - 3 && !(o.kind === 'gap' && x + s.runner.width / 2 >= o.x + o.width)).sort((a,b) => a.x-b.x)[0];
  const gate = s.obstacles.find(o => o.kind === 'gate' && o.x + o.width > x);
  return {
    jump: Boolean(s.runner.grounded && (platform ? x >= platform.x + platform.width - 40 :
      next && next.kind !== 'gate' && next.x - x < s.speed * .19)),
    togglePhase: Boolean(gate && gate.x - x < s.speed * .6 && gate.phase === s.phase),
  };
}
