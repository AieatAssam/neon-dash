/**
 * Deterministic vertical force from a phase-matched color field.
 *
 * The field attracts the runner toward its center while the runner is inside
 * its radius. Only the vertical component is returned because the runner's
 * horizontal motion is controlled by the course speed. The force fades
 * smoothly to zero at the edge and is capped by `maxAcceleration`.
 */

export type AttractionPhase = 0 | 1;

export interface ColorAttractionField {
  x: number;
  y: number;
  radius: number;
  phase: AttractionPhase;
  maxAcceleration: number;
}

export interface AttractionPoint {
  x: number;
  y: number;
}

/** Return signed vertical acceleration in world units per second squared. */
export function colorAttractionAcceleration(
  point: AttractionPoint,
  field: ColorAttractionField,
  phase: AttractionPhase,
): number {
  if (phase !== field.phase || !(field.radius > 0) || !(field.maxAcceleration > 0) ||
      !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      !Number.isFinite(field.x) || !Number.isFinite(field.y) ||
      !Number.isFinite(field.radius) || !Number.isFinite(field.maxAcceleration)) return 0;

  const dx = point.x - field.x;
  const dy = point.y - field.y;
  const distanceSquared = dx * dx + dy * dy;
  const radiusSquared = field.radius * field.radius;
  if (distanceSquared === 0 || distanceSquared >= radiusSquared) return 0;

  const distance = Math.sqrt(distanceSquared);
  const normalizedDistance = distance / field.radius;
  // Smoothstep gives a gradual, stable fade with no force discontinuity at
  // the field boundary. The radial direction projects the force onto y.
  const remaining = 1 - normalizedDistance;
  const falloff = remaining * remaining * (1 + 2 * normalizedDistance);
  const magnitude = Math.min(field.maxAcceleration, field.maxAcceleration * falloff);
  return -dy / distance * magnitude;
}
