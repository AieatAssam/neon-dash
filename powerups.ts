/**
 * Small deterministic power-up state for the runner.
 *
 * A collected shield stores one charge. The next otherwise-fatal collision
 * consumes it and lets the run continue; a second shield pickup while charged
 * is harmless. All transitions are explicit so a replay can reproduce them
 * from the same pickup/collision event sequence.
 */

export interface PowerUpState {
  shieldCharges: 0 | 1;
  shieldsUsed: number;
}

export type CollisionResult = {
  state: PowerUpState;
  absorbed: boolean;
};

export function createPowerUpState(): PowerUpState {
  return { shieldCharges: 0, shieldsUsed: 0 };
}

/** Grant the single stored shield charge; pickups never stack. */
export function collectShield(state: PowerUpState): PowerUpState {
  if (state.shieldCharges) return state;
  return { ...state, shieldCharges: 1 };
}

/**
 * Resolve a collision using only the explicit state and collision event.
 * Nonfatal contacts leave the charge untouched. Fatal contacts consume it once.
 */
export function resolveCollision(state: PowerUpState, fatal: boolean): CollisionResult {
  if (!fatal || state.shieldCharges === 0) return { state, absorbed: false };
  return {
    state: { shieldCharges: 0, shieldsUsed: state.shieldsUsed + 1 },
    absorbed: true,
  };
}
