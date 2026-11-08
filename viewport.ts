/** Camera framing for the horizontal run and the vertical shaft. */

/** Portrait screens show this many world units across, enough for about
 * 1.4 s of lookahead at the opening speed with the runner near the left edge. */
export const PORTRAIT_WORLD_WIDTH = 430;
const WIDE_WORLD_WIDTH = 680;
const WIDE_WORLD_HEIGHT = 440;

export function isPortrait(width: number, height: number): boolean {
  return width / height < .75;
}

export function viewportWorldSize(width: number, height: number) {
  const scale = isPortrait(width, height)
    ? width / PORTRAIT_WORLD_WIDTH
    : Math.min(width / WIDE_WORLD_WIDTH, height / WIDE_WORLD_HEIGHT);
  return { scale, width: width / scale, height: height / scale };
}

/** Runner screen x as a share of the world width. */
export function runnerScreenShare(width: number, height: number): number {
  return isPortrait(width, height) ? .1 : .16;
}

/** Runway height as a share of the screen height. */
export function runwayScreenShare(width: number, height: number): number {
  return isPortrait(width, height) ? .6 : .74;
}

/** World units visible ahead of the runner's front edge. */
export function lookaheadUnits(width: number, height: number, runnerWidth = 24): number {
  const world = viewportWorldSize(width, height);
  return world.width * (1 - runnerScreenShare(width, height)) - runnerWidth;
}

/** The shaft fills phone width in portrait; in landscape it is a centered lane
 * sized so at least a second of gates is visible below the runner. */
export function shaftLayout(width: number, height: number, courseWidth = 420) {
  const laneWidth = isPortrait(width, height) ? width : Math.min(width * .62, height * 1.08, courseWidth * 2.2);
  const scale = laneWidth / courseWidth;
  return {
    x: (width - laneWidth) / 2,
    width: laneWidth,
    scale,
    /** Runner screen y as a share of the screen height. */
    runnerShare: isPortrait(width, height) ? .24 : .14,
  };
}
