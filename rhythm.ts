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
