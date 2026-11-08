/** Music plus small synthesized effects. Everything starts on the first user
 * gesture (browser autoplay rules) and stays silent when muted. */

export type Sfx = 'jump' | 'land' | 'orb' | 'phase' | 'death' | 'whoosh' | 'shield' | 'shieldBreak' | 'streak' | 'win' | 'perfect' | 'cue';

export class Audio2 {
  enabled = true;
  readonly music: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  constructor(musicUrl: string) {
    this.music = new Audio(musicUrl);
    this.music.loop = true;
    this.music.volume = .38;
    (this.music as any).preservesPitch = false;
    (this.music as any).webkitPreservesPitch = false;
  }

  /** Call from a user gesture. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const Context = window.AudioContext || (window as any).webkitAudioContext;
    if (!Context) return;
    try {
      this.ctx = new Context();
      this.master = this.ctx.createGain();
      this.master.gain.value = .5;
      this.master.connect(this.ctx.destination);
      const length = this.ctx.sampleRate * .6;
      this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      let seed = 9;
      for (let i = 0; i < length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
    } catch { this.ctx = null; }
  }

  setRate(rate: number) {
    const r = Math.max(.25, Math.min(1, rate));
    if (Math.abs(this.music.playbackRate - r) > .01) this.music.playbackRate = r;
  }

  private tone(type: OscillatorType, from: number, to: number, duration: number, gain: number, delay = 0) {
    const c = this.ctx!, t = c.currentTime + delay;
    const osc = c.createOscillator(), amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(gain, t + .006);
    amp.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(amp).connect(this.master!);
    osc.start(t); osc.stop(t + duration + .02);
  }

  private hiss(duration: number, gain: number, fromHz: number, toHz: number, q = 1.2) {
    const c = this.ctx!, t = c.currentTime;
    const src = c.createBufferSource(), filter = c.createBiquadFilter(), amp = c.createGain();
    src.buffer = this.noise;
    filter.type = 'bandpass'; filter.Q.value = q;
    filter.frequency.setValueAtTime(fromHz, t);
    filter.frequency.exponentialRampToValueAtTime(toHz, t + duration);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(gain, t + duration * .3);
    amp.gain.exponentialRampToValueAtTime(.0001, t + duration);
    src.connect(filter).connect(amp).connect(this.master!);
    src.start(t); src.stop(t + duration + .02);
  }

  play(name: Sfx) {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    switch (name) {
      case 'jump': this.tone('square', 330, 660, .09, .07); break;
      case 'land': this.tone('sine', 140, 60, .08, .12); break;
      case 'orb': this.tone('triangle', 988, 988, .08, .1); this.tone('triangle', 1319, 1319, .12, .09, .05); break;
      case 'perfect': this.tone('triangle', 1568, 1568, .1, .07); this.tone('triangle', 2093, 2093, .14, .06, .05); break;
      case 'phase': this.tone('sawtooth', 520, 780, .07, .05); break;
      case 'shield': this.tone('sine', 660, 1320, .25, .1); break;
      case 'shieldBreak': this.hiss(.3, .25, 3000, 800, .8); this.tone('square', 880, 220, .25, .06); break;
      case 'death': this.hiss(.45, .4, 1800, 120, .7); this.tone('sawtooth', 220, 40, .4, .12); break;
      case 'whoosh': this.hiss(1.1, .35, 300, 4200, 2.2); this.tone('sine', 110, 55, 1, .1); break;
      case 'cue': this.tone('square', 784, 784, .08, .05); this.tone('square', 1175, 1175, .1, .05, .12); break;
      case 'streak': [523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, .14, .07, i * .05)); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, .3, .08, i * .09)); break;
    }
  }
}
