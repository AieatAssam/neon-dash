import { step as stepGame, type Game, type Input, type Obstacle, type Terrain } from '../core';
import { verticalForwardSpeed, VERTICAL_PLAYER_RADIUS, VERTICAL_WIDTH } from '../vertical-section';

/** Jumps fire when the next hazard is this many seconds away. The center of
 * the spike window at the default speeds is about 0.23 s. */
const IDEAL_LEAD = .19;
const PLATFORM_EXIT = 40;

/** Seconds from takeoff to the top of the jump arc. */
const APEX = .344;
/** Measured centre of the window for landing on a 28-unit stepping stone. */
const PLATFORM_AIM = .42;

/** `ttc` counts down to the moment the runner's back edge meets the feature;
 * `aim` is where a practised human presses: the arc's apex over its middle. */
type Target = { key: string; ttc: number; aim: number };

function nextGate(game: Game) {
  const v = game.verticalState!;
  return game.verticalObstacles.find(o => !o.passive && o.y + o.height > v.y - VERTICAL_PLAYER_RADIUS - 2);
}

/** Time until the runner must leave the ground for the next jump. */
function nextJump(game: Game): Target | null {
  const s = game.state;
  const x = s.distance + s.runner.x;
  const bottom = s.runner.y + s.runner.height;
  const platform = s.terrain.find(t => t.kind === 'platform' && x + s.runner.width > t.x && x < t.x + t.width &&
    Math.abs(bottom - (game.config.groundY - t.height)) < .01);
  if (platform) return { key: `p${platform.x}`, ttc: (platform.x + platform.width - PLATFORM_EXIT - x) / s.speed + IDEAL_LEAD, aim: IDEAL_LEAD };
  let next: Obstacle | Terrain | null = null;
  for (const o of [...s.obstacles, ...s.terrain]) {
    if (o.x + o.width <= x - 3 || o.kind === 'gap' && x + s.runner.width / 2 >= o.x + o.width) continue;
    if (!next || o.x < next.x) next = o;
  }
  if (!next || next.kind === 'gate') return null;
  const ttc = (next.x - x) / s.speed;
  if (next.kind === 'platform') return { key: `platform${next.x}`, ttc, aim: PLATFORM_AIM };
  let end = next.x + next.width;
  if (next.kind !== 'gap') {
    for (let grew = true; grew;) {
      grew = false;
      for (const o of s.obstacles) if (o.kind !== 'gate' && o.x > next.x && o.x <= end + 6 && o.x + o.width > end) { end = o.x + o.width; grew = true; }
    }
  }
  return { key: `${next.kind ?? 'spike'}${next.x}`, ttc, aim: APEX - ((end - next.x) / 2 - s.runner.width / 2) / s.speed };
}

function gateAhead(game: Game): Obstacle | undefined {
  const s = game.state;
  const x = s.distance + s.runner.x;
  return s.obstacles.find(o => o.kind === 'gate' && o.x + o.width > x);
}

/** Deterministic expert: switch before gates, jump before hazards, and use
 * the last forty units of each stepping stone as the next takeoff runway. */
export function courseInput(game: Game): Input {
  const s = game.state;
  if (game.verticalState) {
    const v = game.verticalState;
    const gate = nextGate(game);
    const lookahead = Math.max(600, Math.min(310, s.speed) * 2.1);
    const safe = gate && v.y >= gate.y - lookahead ? (gate.x === 0 ? 1 : 0) : v.phase;
    return { jump: false, togglePhase: safe !== v.phase };
  }
  if (game.verticalWarp !== null) return {};
  const jump = nextJump(game);
  const gate = gateAhead(game);
  const x = s.distance + s.runner.x;
  return {
    jump: Boolean(s.runner.grounded && jump && jump.ttc < IDEAL_LEAD),
    togglePhase: Boolean(gate && gate.x - x < s.speed * .6 && gate.phase === s.phase),
  };
}

/** Seeded uniform PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ a >>> 15, a | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export interface SloppyProfile {
  /** Mean tap lateness in seconds (positive is late). */
  late: number;
  /** Standard deviation of tap timing in seconds. */
  jitter: number;
  /** Chance of not reacting to a hazard at all. */
  miss: number;
  /** Random extra taps per second. */
  spurious: number;
  /** Reaction delay range for color switches once a gate is noticed. */
  switchDelay: [number, number];
  verticalDelay: [number, number];
  /** Delay before tapping again after a press was swallowed mid-air. */
  retryDelay: [number, number];
  /** Seconds before contact that a gate is noticed. */
  notice: number;
  verticalNotice: number;
}

/** A casual phone player: late, jittery taps, occasional misses and stray taps. */
export const SLOPPY: Readonly<SloppyProfile> = Object.freeze({
  late: .04, jitter: .085, miss: .02, spurious: .1,
  switchDelay: [.15, .35], verticalDelay: [.15, .45], retryDelay: [.1, .25], notice: 1, verticalNotice: 1.2,
} as SloppyProfile);

/** A first-time young player: roughly half again as noisy. */
export const VERY_SLOPPY: Readonly<SloppyProfile> = Object.freeze({
  late: .06, jitter: .12, miss: .04, spurious: .2,
  switchDelay: [.2, .45], verticalDelay: [.2, .55], retryDelay: [.15, .3], notice: 1, verticalNotice: 1.2,
} as SloppyProfile);

/** Human-like ghost input. Every random draw comes from the seed, so a run is
 * repeatable given the same game seed and bot seed. */
export class SloppyBot {
  private rand: () => number;
  private target = '';
  private pressTtc = 0;
  private skip = false;
  private holdUntil = -1;
  private switchAt: number | null = null;
  private nextSpurious: number;
  private jumpsAtPress = 0;
  private pressedAt: number | null = null;
  private retryAt: number | null = null;

  constructor(seed: number, private profile: SloppyProfile = SLOPPY) {
    this.rand = mulberry32(seed ^ 0x9E3779B9);
    this.nextSpurious = this.exp(profile.spurious);
  }

  private gauss(): number {
    const u = Math.max(1e-9, this.rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rand());
  }
  private between([lo, hi]: [number, number]): number { return lo + (hi - lo) * this.rand(); }
  private exp(rate: number): number { return rate > 0 ? -Math.log(Math.max(1e-9, this.rand())) / rate : Infinity; }

  input(game: Game): Input {
    const s = game.state;
    const t = s.time;
    const p = this.profile;
    let tap = false;
    if (t >= this.nextSpurious) { tap = true; this.nextSpurious = t + this.exp(p.spurious); }

    if (game.verticalState) {
      const v = game.verticalState;
      const gate = nextGate(game);
      const speed = verticalForwardSpeed(v.ticks * game.config.fixedStep);
      let ttc = gate ? (gate.y - v.y) / speed : Infinity;
      let want = gate ? (gate.x === 0 ? 1 : 0) : v.phase;
      // Follow the tutorial prompt toward a shield when no gate is close.
      const shield = game.verticalOrbs.find(o => o.shield && o.y > v.y);
      if (shield && (shield.y - v.y) / speed < Math.min(ttc - .6, p.verticalNotice)) {
        want = shield.x < VERTICAL_WIDTH / 2 ? 0 : 1;
        ttc = (shield.y - v.y) / speed;
      }
      if (want === v.phase) this.switchAt = null;
      else if (this.switchAt === null && ttc < p.verticalNotice) this.switchAt = t + this.between(p.verticalDelay);
      if (this.switchAt !== null && t >= this.switchAt) { tap = !tap; this.switchAt = null; }
      return { jump: false, togglePhase: tap };
    }
    if (game.verticalWarp !== null) return {};

    let togglePhase = false;
    const gate = gateAhead(game);
    const x = s.distance + s.runner.x;
    if (!gate || gate.phase !== s.phase) this.switchAt = null;
    else if (this.switchAt === null && (gate.x - x) / s.speed < p.notice) {
      this.switchAt = this.rand() < p.miss ? Infinity : t + this.between(p.switchDelay);
    }
    if (this.switchAt !== null && t >= this.switchAt) { togglePhase = true; this.switchAt = null; }

    const jump = nextJump(game);
    if (jump && jump.key !== this.target) {
      this.target = jump.key;
      this.skip = this.rand() < p.miss;
      this.pressTtc = jump.aim - (p.late + p.jitter * this.gauss());
    }
    if (jump && !this.skip && jump.ttc <= this.pressTtc) {
      this.skip = true;
      tap = true;
      this.jumpsAtPress = s.stats.jumps;
      this.pressedAt = t;
      this.retryAt = null;
    }
    // A press swallowed mid-air (after a stray hop) gets one more try once
    // the runner lands and the hazard is still ahead.
    if (jump && jump.key === this.target && this.pressedAt !== null && s.runner.grounded &&
        s.stats.jumps === this.jumpsAtPress && t > this.pressedAt + .15 && jump.ttc > 0) {
      this.retryAt ??= t + this.between(p.retryDelay);
      if (t >= this.retryAt) { tap = true; this.pressedAt = null; }
    }
    if (tap) this.holdUntil = t + this.between([.05, .18]);
    return { jump: t < this.holdUntil, togglePhase };
  }
}

export type Bot = (game: Game) => Input;

export function botFor(kind: 'good' | 'sloppy' | 'very-sloppy' | 'none', seed = 1): Bot {
  if (kind === 'good') return courseInput;
  if (kind === 'none') return () => ({});
  const bot = new SloppyBot(seed, kind === 'sloppy' ? SLOPPY : VERY_SLOPPY);
  return game => bot.input(game);
}

export interface RunResult {
  status: 'running' | 'dead' | 'won';
  time: number;
  progress: number;
  reachedVertical: boolean;
  clearedVertical: boolean;
  /** Seconds survived inside the shaft (0 when never reached). */
  verticalSeconds: number;
  deathReason: string | null;
  /** What killed the runner, for reports. */
  killer: string | null;
}

/** Step a game with a bot until it ends, or until `until` returns true. */
export function simulate(game: Game, bot: Bot, maxSeconds = 120, until?: (game: Game) => boolean): RunResult {
  const s = game.state;
  let enteredAt: number | null = null;
  const limit = Math.ceil(maxSeconds / game.config.fixedStep);
  for (let i = 0; i < limit && s.status === 'running'; i++) {
    if (until?.(game)) break;
    stepGame(game, bot(game));
    if (game.verticalState && enteredAt === null) enteredAt = s.time;
  }
  let killer: string | null = null;
  if (s.status === 'dead') {
    if (game.verticalState) killer = 'vertical gate';
    else if (s.deathReason === 'fall') killer = 'gap';
    else if (s.deathReason === 'platform') killer = 'platform';
    else {
      const x = s.distance + s.runner.x;
      const hit = s.obstacles.filter(o => o.x < x + s.runner.width + 8 && o.x + o.width > x - 8 && !o.shielded)[0];
      killer = hit ? hit.kind ?? 'spike' : 'spike';
    }
  }
  const finish = game.config.finishX;
  return {
    status: s.status,
    time: s.time,
    progress: Number.isFinite(finish) ? Math.min(100, s.distance / (finish - s.runner.x) * 100) : 0,
    reachedVertical: enteredAt !== null || game.verticalComplete,
    clearedVertical: game.verticalComplete,
    verticalSeconds: enteredAt === null ? 0 : (game.verticalExitedAt ?? s.time) - enteredAt,
    deathReason: s.deathReason,
    killer,
  };
}
