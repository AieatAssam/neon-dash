/** Keep individual runs visible; incomplete runs never count toward the aggregate. */
export function summarizeRuns(runs, requiredFrames) {
 const round = n => Math.round(n * 10) / 10;
 const summaries = runs.map(run => {
  const samples = [...run.samples];
  const complete = !run.endedEarly && samples.length === requiredFrames;
  return { complete, endedEarly: run.endedEarly, samples, meanMs: samples.length ? round(samples.reduce((a, b) => a + b, 0) / samples.length) : null };
 });
 const means = summaries.filter(run => run.complete).map(run => run.meanMs).sort((a, b) => a - b);
 const middle = Math.floor(means.length / 2);
 const median = means.length ? round(means.length % 2 ? means[middle] : (means[middle - 1] + means[middle]) / 2) : null;
 return { completedRuns: means.length, incompleteRuns: summaries.length - means.length, medianRunMeanMs: median, runs: summaries };
}
