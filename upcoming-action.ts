import type { Game } from './core';

export const PREVIEW_SECONDS = 1.4;
export interface UpcomingAction { label: string; seconds: number; action: 'jump' | 'switch' | 'pass' }

/** Read the actual seeded course, using simulation time so pause/audio cannot drift the cue. */
export function upcomingAction(game: Game): UpcomingAction | null {
  const { state: s, config: c } = game;
  const front = s.distance + s.runner.x + s.runner.width;
  const acceleration = game.generated && s.speed < c.maxSpeed ? 1.2 : 0;
  const capTime = acceleration ? (c.maxSpeed - s.speed) / acceleration : 0;
  const capDistance = s.speed * capTime + .5 * acceleration * capTime ** 2;
  const secondsTo = (distance: number) => {
    if (distance <= 0) return 0;
    if (s.speed <= 0) return Infinity;
    if (!acceleration) return distance / s.speed;
    if (distance > capDistance) return capTime + (distance - capDistance) / c.maxSpeed;
    return 2 * distance / (s.speed + Math.sqrt(s.speed ** 2 + 2 * acceleration * distance));
  };
  let next: UpcomingAction | null = null;
  const consider = (x: number, width: number, label: string, action: UpcomingAction['action']) => {
    if (x + width <= front - s.runner.width) return;
    const seconds = secondsTo(x - front);
    if (seconds > PREVIEW_SECONDS + 1e-8) return;
    const cue = { label, seconds, action };
    if (!next || seconds < next.seconds) next = cue;
  };
  for (const obstacle of s.obstacles) {
    if (obstacle.cleared || obstacle.shielded) continue;
    const active = obstacle.phase === null || obstacle.phase === s.phase;
    if (obstacle.kind === 'gate') {
      consider(obstacle.x, obstacle.width, active ? `SWITCH TO ${s.phase === 0 ? 'VIOLET' : 'CYAN'}` : 'GATE · PASS', active ? 'switch' : 'pass');
    } else if (active) consider(obstacle.x, obstacle.width, 'JUMP', 'jump');
  }
  for (const terrain of s.terrain) {
    consider(terrain.x, terrain.width, terrain.kind === 'gap' ? 'JUMP · GAP' : 'JUMP · PLATFORM', 'jump');
  }
  return next;
}
