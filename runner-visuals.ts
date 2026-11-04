export type TrailSample = { time: number; x: number; y: number };

// Positions stay in world space: the renderer applies the current scroll offset.
export class RunnerTrail {
 readonly samples: TrailSample[] = [];
 reset() { this.samples.length = 0; }
 record(time: number, x: number, y: number) {
  const previous = this.samples.at(-1);
  if (previous && time <= previous.time) this.reset();
  this.samples.push({ time, x, y });
  while (this.samples.length > 2 && this.samples[1].time < time - .3) this.samples.shift();
 }
 at(time: number): TrailSample | undefined {
  if (!this.samples.length || time < this.samples[0].time) return;
  for (let i = 1; i < this.samples.length; i++) {
   const right = this.samples[i], left = this.samples[i - 1];
   if (right.time >= time) {
    const t = (time - left.time) / (right.time - left.time);
    return { time, x: left.x + (right.x - left.x) * t, y: left.y + (right.y - left.y) * t };
   }
  }
  return this.samples.at(-1);
 }
}

// Symmetric about the cube's local origin, including half-pixel centers.
export const RUNNER_FACE = [[-6, -5, 3, 3], [3, -5, 3, 3], [-5, 3, 10, 2]] as const;
