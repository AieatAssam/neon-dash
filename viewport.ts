/** Frame the runner by height on portrait screens, retaining the wider desktop view. */
const DESKTOP_WORLD_WIDTH = 680;
const BASE_WORLD_HEIGHT = 480;

export function viewportWorldSize(width: number, height: number) {
  const scale = width / height < 0.75
    ? Math.max(28 / 24, height / 720)
    : Math.min(width / DESKTOP_WORLD_WIDTH, height / BASE_WORLD_HEIGHT);
  return { scale, width: width / scale, height: height / scale };
}
