/** Achievements are evaluated from a single run; progress is stored by the UI. */
export const ACHIEVEMENTS = Object.freeze([
  { id: 'distance-1000', name: 'First Signal', description: 'Travel 1000 units in one run', test: r => r.distance >= 1000 },
  { id: 'jump-10', name: 'Airborne', description: 'Jump 10 times in one run', test: r => r.stats.jumps >= 10 },
  { id: 'switch-10', name: 'Phase Shifter', description: 'Switch phase 10 times in one run', test: r => r.stats.switches >= 10 },
  { id: 'neutral-5', name: 'Circuit Breaker', description: 'Clear 5 neutral spikes in one run', test: r => r.stats.neutralCleared >= 5 },
  { id: 'distance-5000', name: 'Overdrive', description: 'Travel 5000 units in one run', test: r => r.distance >= 5000 },
  { id: 'distance-15000', name: 'Neon Legend', description: 'Travel 15000 units in one run', test: r => r.distance >= 15000 },
]);
export function evaluateAchievements(run) {
  return ACHIEVEMENTS.filter(a => a.test(run)).map(a => a.id);
}
export function mergeProgress(progress, run) {
  const previous = Array.isArray(progress.unlocked) ? progress.unlocked : [];
  return {
    bestDistance: Math.max(Number(progress.bestDistance) || 0, Math.floor(run.distance)),
    runs: (Number(progress.runs) || 0) + 1,
    unlocked: [...new Set([...previous, ...evaluateAchievements(run)])],
  };
}
