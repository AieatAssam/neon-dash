// Plays the real simulation with scripted bots and prints how far they get.
// Usage: npx tsx scripts/bot-report.mjs [courseSeeds=40] [attempts=5] [--json]
// Two cohorts: many course seeds (one player each), and the shipped level
// (seed 7) played by 200 different sloppy players.
import { createGame } from '../core.ts';
import { simulate, botFor } from '../src/autoplay.ts';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const json = process.argv.includes('--json');
const seeds = Number(args[0] ?? 40);
const attempts = Number(args[1] ?? 5);

const pct = n => `${(n * 100).toFixed(0)}%`;
const median = values => { const v = [...values].sort((a, b) => a - b); return v[Math.floor(v.length / 2)] ?? 0; };

const LEVEL_SEED = 7;
const courseCohort = Array.from({ length: seeds }, (_, i) => ({ course: i + 1, player: i + 1 }));
const levelCohort = Array.from({ length: 200 }, (_, i) => ({ course: LEVEL_SEED, player: i + 1 }));

function profile(kind, cohort) {
  const runs = [];
  const firstVertical = [];
  for (const { course, player } of cohort) {
    let reachedOn = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const game = createGame({ mode: 'challenge', seed: course });
      // Attempt numbers start at 1, matching the in-browser harness.
      const result = simulate(game, botFor(kind, player * 1000 + attempt + 1), 120);
      runs.push(result);
      if (reachedOn === null && result.reachedVertical) reachedOn = attempt + 1;
    }
    firstVertical.push(reachedOn);
  }
  const reached = runs.filter(r => r.reachedVertical);
  const killers = {};
  for (const r of runs) if (r.killer) killers[r.killer] = (killers[r.killer] ?? 0) + 1;
  return {
    kind,
    attempts: runs.length,
    survive10: runs.filter(r => r.status !== 'dead' || r.time >= 10).length / runs.length,
    survive15: runs.filter(r => r.status !== 'dead' || r.time >= 15).length / runs.length,
    medianSeconds: median(runs.map(r => r.time)),
    medianProgress: median(runs.map(r => r.progress)),
    verticalPerAttempt: reached.length / runs.length,
    verticalWithin1: firstVertical.filter(n => n !== null && n <= 1).length / cohort.length,
    verticalWithin3: firstVertical.filter(n => n !== null && n <= 3).length / cohort.length,
    verticalWithin5: firstVertical.filter(n => n !== null && n <= 5).length / cohort.length,
    verticalFirst5s: reached.length ? reached.filter(r => r.clearedVertical || r.verticalSeconds >= 5).length / reached.length : 0,
    verticalClear: reached.length ? reached.filter(r => r.clearedVertical).length / reached.length : 0,
    wins: runs.filter(r => r.status === 'won').length / runs.length,
    killers,
  };
}

const kinds = ['good', 'sloppy', 'very-sloppy'];
const sections = [
  { title: `${seeds} course seeds x ${attempts} attempts each (challenge mode)`, report: kinds.map(kind => profile(kind, courseCohort)) },
  { title: `Shipped level (seed ${LEVEL_SEED}): 200 players x ${attempts} attempts each`, report: kinds.map(kind => profile(kind, levelCohort)) },
];
if (json) console.log(JSON.stringify(sections, null, 2));
else for (const { title, report } of sections) {
  console.log(`${title}\n`);
  for (const r of report) {
    console.log(`${r.kind.padEnd(12)} survive 10s ${pct(r.survive10).padStart(4)} | 15s ${pct(r.survive15).padStart(4)} | median ${r.medianSeconds.toFixed(1)}s (${r.medianProgress.toFixed(0)}%)`);
    console.log(`${''.padEnd(12)} reach vertical: per attempt ${pct(r.verticalPerAttempt)}, within 1/3/5 attempts ${pct(r.verticalWithin1)}/${pct(r.verticalWithin3)}/${pct(r.verticalWithin5)}`);
    console.log(`${''.padEnd(12)} in vertical: survive first 5s ${pct(r.verticalFirst5s)}, clear ${pct(r.verticalClear)} | wins ${pct(r.wins)}`);
    console.log(`${''.padEnd(12)} deaths by ${Object.entries(r.killers).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}\n`);
  }
}
