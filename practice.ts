import type { Game, GameConfig } from './core';

/** An in-memory checkpoint handle. Simulation data cannot be edited through it. */
export interface PracticeCheckpoint {
  readonly time: number;
  readonly distance: number;
  readonly seed: number;
  readonly mode: GameConfig['mode'];
}

const snapshots = new WeakMap<PracticeCheckpoint, Game>();

function validGame(game: Game): boolean {
  if (!game || !game.config || !game.state || game.state.status !== 'running') return false;
  const c = game.config, s = game.state;
  if (!['endless', 'challenge'].includes(c.mode) || !(c.fixedStep > 0) ||
      !(c.finishX > c.runnerX) || (c.mode === 'challenge' && !Number.isFinite(c.finishX)) ||
      !Number.isInteger(game.randomState) || game.randomState < 0 || game.randomState > 0xffffffff ||
      !Array.isArray(game.phrasePattern) || !game.phrasePattern.length ||
      !Number.isInteger(game.phraseIndex) || game.phraseIndex < 0 || game.phraseIndex >= game.phrasePattern.length ||
      !s.runner || !s.stats || !game.pendingInput || ![0, 1].includes(s.phase) ||
      s.time < 0 || s.distance < 0 || s.deathReason !== null ||
      !Array.isArray(s.obstacles) || !Array.isArray(s.terrain) || !Array.isArray(s.collectibles)) return false;
  // Reject corrupt numeric values without JSON serialization (endless finish is Infinity).
  const finiteTree = (value: unknown, key = ''): boolean => {
    if (typeof value === 'number') return Number.isFinite(value) || (key === 'finishX' && value === Infinity);
    if (value && typeof value === 'object') return Object.entries(value).every(([k, v]) => finiteTree(v, k));
    return true;
  };
  return finiteTree(game);
}

/** Capture only a live simulation. Callers also enforce their external pause state. */
export function createCheckpoint(game: Game): PracticeCheckpoint | null {
  try {
    if (!validGame(game)) return null;
    const snapshot = structuredClone(game);
    const checkpoint: PracticeCheckpoint = Object.freeze({
      time: snapshot.state.time, distance: snapshot.state.distance,
      seed: snapshot.config.seed, mode: snapshot.config.mode,
    });
    snapshots.set(checkpoint, snapshot);
    return checkpoint;
  } catch { return null; }
}

/** Each restoration is independent. Invalid or copied handles fail without changing a game. */
export function restoreCheckpoint(checkpoint: unknown): Game | null {
  if (!checkpoint || typeof checkpoint !== 'object') return null;
  const snapshot = snapshots.get(checkpoint as PracticeCheckpoint);
  if (!snapshot) return null;
  const game = structuredClone(snapshot);
  game.accumulator = 0;
  game.pendingInput = { jump: false, togglePhase: false };
  game.state.jumpHeld = false;
  game.state.jumpBuffer = 0;
  return game;
}
