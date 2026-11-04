import { GAMEPLAY_COLORS } from './src/art/palette';

/** Screen-space renderer for a vertical color-wall section.
 * The caller owns collision, timing, and camera state; this module only paints.
 */
export type WallHazard = {
  /** 0..1 across the lane */
  x: number;
  /** 0..1 down the visible lane */
  y: number;
  /** 0..1 of lane width/height */
  width?: number;
  height?: number;
  kind: 'spike' | 'block' | 'gate' | 'gap';
  /** Optional phase/color key for gates and matching obstacles. */
  color?: string;
};

export type ColorWallVisualOptions = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  progress?: number;
  runnerX?: number;
  runnerY: number;
  hazards?: readonly WallHazard[];
  primaryColor?: string;
  secondaryColor?: string;
  /** 0..1 blend from primary to secondary environment, drawn in screen space. */
  transition?: number;
  time?: number;
  reducedMotion?: boolean;
};

export type ColorWallLayout = { x: number; y: number; width: number; height: number };

/** Adapter for the course-coordinate API in vertical-section.ts. `cameraY` is
 * the course coordinate placed at the top of the visible screen. */
export function drawVerticalSectionVisuals(
  ctx: CanvasRenderingContext2D,
  section: {
    width: number;
    state: { x: number; y: number; phase: 0 | 1 };
    obstacles?: readonly { x: number; y: number; width: number; height: number }[];
    cameraY?: number;
    primaryColor?: string;
    secondaryColor?: string;
    time?: number;
    reducedMotion?: boolean;
  },
): void {
  const view = contextSize(ctx);
  const layout = colorWallLayout(view.width, view.height);
  const scale = layout.width / section.width;
  const visibleCourseHeight = layout.height / scale;
  const cameraY = section.cameraY ?? Math.max(0, section.state.y - visibleCourseHeight * .25);
  const hazards = (section.obstacles ?? []).filter(obstacle =>
    obstacle.y + obstacle.height >= cameraY && obstacle.y <= cameraY + visibleCourseHeight,
  ).map(obstacle => ({
    x: (obstacle.x + obstacle.width / 2) / section.width,
    y: (obstacle.y + obstacle.height / 2 - cameraY) / visibleCourseHeight,
    width: obstacle.width / section.width,
    height: obstacle.height / visibleCourseHeight,
    kind: 'block' as const,
    color: GAMEPLAY_COLORS.danger,
  }));
  const runnerColor = section.state.phase === 0 ? section.primaryColor ?? '#37ffe7' : section.secondaryColor ?? '#dfb8ff';
  drawColorWallLane(ctx, {
    ...layout,
    runnerX: section.state.x / section.width,
    runnerY: (section.state.y - cameraY) / visibleCourseHeight,
    hazards,
    primaryColor: section.primaryColor,
    secondaryColor: section.secondaryColor,
    transition: section.state.phase,
    time: section.time,
    reducedMotion: section.reducedMotion,
  });
  // Color-specific outline reads the current attraction state at a glance.
  ctx.save(); ctx.strokeStyle = runnerColor; ctx.lineWidth = Math.max(2, layout.width * .008);
  ctx.strokeRect(layout.x + layout.width * .025, layout.y + layout.height * .025, layout.width * .95, layout.height * .95); ctx.restore();
}

/** Give the lane a usable width on narrow screens while preserving tall framing. */
export function colorWallLayout(viewWidth: number, viewHeight: number): ColorWallLayout {
  const width = Math.min(viewWidth * .78, Math.max(210, viewHeight * .52));
  return { x: (viewWidth - width) / 2, y: 0, width, height: viewHeight };
}

/** Paint a readable, clipped lane overlay. Positions are normalized within its rectangle. */
export function drawColorWallLane(ctx: CanvasRenderingContext2D, options: ColorWallVisualOptions): void {
  const layout = options.x === undefined || options.width === undefined || options.height === undefined
    ? colorWallLayout(contextSize(ctx).width, contextSize(ctx).height)
    : { x: options.x, y: options.y ?? 0, width: options.width, height: options.height };
  const { x, y, width, height } = layout;
  const primary = options.primaryColor ?? '#37ffe7';
  const secondary = options.secondaryColor ?? '#dfb8ff';
  const transition = clamp(options.transition ?? 0);
  const clock = options.reducedMotion ? 0 : (options.time ?? 0);
  const pulse = .5 + .5 * Math.sin(clock * 4);
  const rail = Math.max(5, Math.min(12, width * .035));

  ctx.save();
  // Screen-space environmental wipe: keeps the visual transition independent of world scroll.
  ctx.fillStyle = '#04091a';
  ctx.fillRect(x, y, width, height);
  const wash = ctx.createLinearGradient(x, y, x + width, y + height);
  wash.addColorStop(0, withAlpha(primary, .15 * (1 - transition)));
  wash.addColorStop(1, withAlpha(secondary, .15 * transition));
  ctx.fillStyle = wash;
  ctx.fillRect(x, y, width, height);

  ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
  // Parallax chevrons establish upward travel without obscuring hazards.
  ctx.strokeStyle = '#b7d9ff18'; ctx.lineWidth = 1;
  const drift = options.reducedMotion ? 0 : ((clock * 50) % 82);
  for (let row = y - 82 + drift; row < y + height + 80; row += 82) {
    ctx.beginPath(); ctx.moveTo(x + width * .16, row + 23); ctx.lineTo(x + width * .5, row); ctx.lineTo(x + width * .84, row + 23); ctx.stroke();
  }
  // Rails use distinct edge lights, with a center guide for mobile clarity.
  ctx.fillStyle = '#ffffff0a'; ctx.fillRect(x + rail, y, width - rail * 2, height);
  for (const [rx, color] of [[x, primary], [x + width - rail, secondary]] as const) {
    ctx.fillStyle = color + '66'; ctx.fillRect(rx, y, rail, height);
    ctx.fillStyle = color; ctx.fillRect(rx + rail * .35, y, Math.max(1, rail * .3), height);
  }
  ctx.setLineDash([5, 10]); ctx.lineWidth = 1; ctx.strokeStyle = '#d8eaff38';
  ctx.beginPath(); ctx.moveTo(x + width / 2, y); ctx.lineTo(x + width / 2, y + height); ctx.stroke(); ctx.setLineDash([]);

  for (const hazard of options.hazards ?? []) drawHazard(ctx, x, y, width, height, hazard, primary, secondary);

  // Runner marker is intentionally bright and outlined so it remains legible over the wash.
  const px = x + width * clamp(options.runnerX ?? .5), py = y + height * clamp(options.runnerY);
  const size = Math.max(13, Math.min(22, width * .065));
  ctx.save(); ctx.translate(px, py);
  ctx.globalAlpha = .32 + pulse * .12; ctx.strokeStyle = primary; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, size * 1.05, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1; ctx.fillStyle = '#f4ffff'; ctx.strokeStyle = secondary; ctx.lineWidth = 3;
  ctx.fillRect(-size / 2, -size / 2, size, size); ctx.strokeRect(-size / 2, -size / 2, size, size);
  ctx.fillStyle = primary; ctx.fillRect(-size * .27, -size * .27, size * .2, size * .2); ctx.fillRect(size * .07, -size * .27, size * .2, size * .2);
  ctx.restore();

  // Transition seam travels across the lane and reads as a deliberate state change.
  if (transition > 0 && transition < 1) {
    const seamX = x + width * transition;
    const gradient = ctx.createLinearGradient(seamX - 12, 0, seamX + 12, 0);
    gradient.addColorStop(0, primary + '00'); gradient.addColorStop(.5, '#ffffffdd'); gradient.addColorStop(1, secondary + '00');
    ctx.fillStyle = gradient; ctx.fillRect(seamX - 12, y, 24, height);
  }
  ctx.restore();
}

function drawHazard(ctx: CanvasRenderingContext2D, x: number, y: number, laneW: number, laneH: number, h: WallHazard, primary: string, secondary: string) {
  const cx = x + clamp(h.x) * laneW, cy = y + clamp(h.y) * laneH;
  const w = Math.max(18, (h.width ?? .12) * laneW), height = Math.max(15, (h.height ?? .045) * laneH);
  const color = h.color ?? (h.kind === 'gate' ? secondary : '#ff6387');
  ctx.save(); ctx.translate(cx, cy); ctx.lineWidth = 2;
  if (h.kind === 'spike') {
    ctx.shadowColor = color; ctx.shadowBlur = 9; ctx.fillStyle = color + 'd9'; ctx.strokeStyle = '#fff3f8';
    ctx.beginPath(); ctx.moveTo(-w / 2, height / 2); ctx.lineTo(0, -height / 2); ctx.lineTo(w / 2, height / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (h.kind === 'gap') {
    ctx.fillStyle = '#020613'; ctx.fillRect(-w / 2, -height / 2, w, height);
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#ff6387'; ctx.strokeRect(-w / 2, -height / 2, w, height); ctx.setLineDash([]);
  } else if (h.kind === 'gate') {
    ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.strokeStyle = color; ctx.fillStyle = color + '28';
    ctx.fillRect(-w / 2, -height / 2, w, height); ctx.strokeRect(-w / 2, -height / 2, w, height);
    ctx.shadowBlur = 0; ctx.fillStyle = '#f4ffff'; ctx.font = `bold ${Math.max(10, height * .45)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SWITCH', 0, 0);
  } else {
    ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.fillStyle = '#172941'; ctx.strokeStyle = color;
    ctx.fillRect(-w / 2, -height / 2, w, height); ctx.strokeRect(-w / 2, -height / 2, w, height);
    ctx.shadowBlur = 0; ctx.strokeStyle = '#ffffffa0'; ctx.beginPath(); ctx.moveTo(-w * .35, -height * .22); ctx.lineTo(w * .35, -height * .22); ctx.stroke();
  }
  ctx.restore();
}

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function withAlpha(hex: string, alpha: number): string { return `${hex}${Math.round(clamp(alpha) * 255).toString(16).padStart(2, '0')}`; }
function contextSize(ctx: CanvasRenderingContext2D): { width: number; height: number } {
  const transform = ctx.getTransform();
  return { width: ctx.canvas.width / (transform.a || 1), height: ctx.canvas.height / (transform.d || 1) };
}
