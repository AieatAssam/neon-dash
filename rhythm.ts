/** Space City source tempo. Keep the effect local to luminous geometry. */
export const TRACK_BPM = 115;
export const BEAT_SECONDS = 60 / TRACK_BPM;

/** Smooth, restrained downbeat accent with no discontinuity at the loop edge. */
export function beatEnvelope(seconds: number): number {
  const phase = ((seconds / BEAT_SECONDS) % 1 + 1) % 1;
  return Math.pow((1 + Math.cos(phase * Math.PI * 2)) / 2, 3);
}

/** Follow audio while playing; continue its phase on the simulation clock if muted. */
export class BeatClock {
  private offset = 0;

  reset(): void { this.offset = 0; }

  sample(simulationTime: number, audioTime?: number): number {
    if (audioTime !== undefined && Number.isFinite(audioTime)) {
      this.offset = audioTime - simulationTime;
      return audioTime;
    }
    return simulationTime + this.offset;
  }
}

/** Simulation is the musical transport, including when sound is muted. */
export function musicPosition(simulationTime: number, duration: number): number {
  const time = Math.max(0, simulationTime);
  return Number.isFinite(duration) && duration > 0 ? time % duration : time;
}

/** Ignore ordinary media clock jitter, including either side of a loop edge. */
export function musicNeedsSync(audioTime: number, simulationTime: number, duration: number): boolean {
  let drift = Math.abs(audioTime - musicPosition(simulationTime, duration));
  if (Number.isFinite(duration) && duration > 0) drift = Math.min(drift, Math.abs(duration - drift));
  return drift > .12;
}
