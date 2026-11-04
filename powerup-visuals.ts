/** Canvas helpers for the shield pickup and its charged HUD indicator. */
export const SHIELD_CYAN = '#43e8ff';
export const SHIELD_GOLD = '#f5d86e';

/** Draw a compact shield mark centered at (x, y). */
export function drawShieldMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color = SHIELD_CYAN,
): void {
  const half = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -half);
  ctx.lineTo(half * .78, -half * .62);
  ctx.lineTo(half * .7, half * .18);
  ctx.quadraticCurveTo(half * .48, half * .68, 0, half);
  ctx.quadraticCurveTo(-half * .48, half * .68, -half * .7, half * .18);
  ctx.lineTo(-half * .78, -half * .62);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, size * .08);
  ctx.stroke();
  ctx.restore();
}

/** Draw an optional charged indicator; empty charges have no canvas cost. */
export function drawShieldIndicator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  charged: boolean,
): void {
  if (charged) drawShieldMark(ctx, x, y, size, SHIELD_GOLD);
}
