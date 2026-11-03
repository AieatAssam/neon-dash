/** Achievements are evaluated from a single run; progress is stored by the UI. */
export const ACHIEVEMENTS = Object.freeze([
  { id: 'distance-1000', name: 'First Signal', description: 'Travel 1000 units in one run', test: r => r.distance >= 1000 },
  { id: 'jump-10', name: 'Airborne', description: 'Jump 10 times in one run', test: r => r.stats.jumps >= 10 },
  { id: 'switch-10', name: 'Phase Shifter', description: 'Switch phase 10 times in one run', test: r => r.stats.switches >= 10 },
  { id: 'neutral-5', name: 'Circuit Breaker', description: 'Clear 5 neutral spikes in one run', test: r => r.stats.neutralCleared >= 5 },
  { id: 'orb-10', name: 'Signal Collector', description: 'Collect 10 orbs in one run', test: r => r.stats.orbs >= 10 },
  { id: 'distance-5000', name: 'Overdrive', description: 'Travel 5000 units in one run', test: r => r.distance >= 5000 },
  { id: 'distance-15000', name: 'Neon Legend', description: 'Travel 15000 units in one run', test: r => r.distance >= 15000 },
]);
export function evaluateAchievements(run) {
  return ACHIEVEMENTS.filter(a => a.test(run)).map(a => a.id);
}
export function mergeProgress(progress, run, mode = 'endless', challengeProgress = 0) {
  const previous = Array.isArray(progress.unlocked) ? progress.unlocked : [];
  return {
    bestDistance: mode === 'endless' ? Math.max(Number(progress.bestDistance) || 0, Math.floor(run.distance)) : (Number(progress.bestDistance) || 0),
    challengeBest: mode === 'challenge' ? Math.max(Number(progress.challengeBest) || 0, Math.min(100, Math.max(0, Math.floor(challengeProgress)))) : (Number(progress.challengeBest) || 0),
    challengeWins: (Number(progress.challengeWins) || 0) + (mode === 'challenge' && run.status === 'won' ? 1 : 0),
    runs: (Number(progress.runs) || 0) + 1,
    unlocked: [...new Set([...previous, ...evaluateAchievements(run)])],
  };
}
