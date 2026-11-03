/** Keep the runner's visible lookahead readable across narrow viewports. */
export const MAX_GAME_SPEED = 340;
export const RUNNER_WORLD_X = 100;
export const MIN_LOOKAHEAD_SECONDS = 1;
export const PORTRAIT_WORLD_WIDTH = RUNNER_WORLD_X + MAX_GAME_SPEED * MIN_LOOKAHEAD_SECONDS + 20;
const DESKTOP_WORLD_WIDTH = 680;
const BASE_WORLD_HEIGHT = 480;

export function viewportWorldSize(width: number, height: number) {
  const baseWidth = width / height < 0.75 ? PORTRAIT_WORLD_WIDTH : DESKTOP_WORLD_WIDTH;
  const scale = Math.min(width / baseWidth, height / BASE_WORLD_HEIGHT);
  return { scale, width: width / scale, height: height / scale };
}
