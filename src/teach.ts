import type { Game } from '../core';

/** Teach by doing: the first time each mechanic approaches, show one short
 * prompt. A mechanic counts as learned once the runner gets past it alive. */

export type Lesson = 'spike' | 'gate' | 'gap' | 'platform' | 'pulse';

export interface Prompt { lesson: Lesson; text: string; /** Point at the color button. */ target?: 'phase'; slow: boolean }

const LEAD_SECONDS = 1.5;
const STORAGE_KEY = 'neon-dash-learned';

export class Teacher {
  readonly learned = new Set<Lesson>();
  private pending = new Map<Lesson, number>();

  constructor(private touch: boolean) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(saved)) for (const item of saved) this.learned.add(item);
    } catch {}
  }

  private save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.learned])); } catch {}
  }

  text(lesson: Lesson): string {
    switch (lesson) {
      case 'spike': return this.touch ? 'TAP TO JUMP' : 'SPACE TO JUMP';
      case 'gate': return this.touch ? 'TAP ◈ TO SWITCH COLOR' : 'X TO SWITCH COLOR';
      case 'gap': return 'JUMP THE GAP';
      case 'platform': return 'LAND ON TOP';
      case 'pulse': return 'JUMP THE PULSE';
    }
  }

  reset() { this.pending.clear(); }

  /** Returns the prompt to show this frame, if any. */
  update(game: Game): Prompt | null {
    const s = game.state;
    if (game.verticalState || game.verticalWarp !== null) return null;
    const x = s.distance + s.runner.x;
    for (const [lesson, end] of this.pending) {
      if (end >= x - 8 || s.status !== 'running') continue;
      this.learned.add(lesson);
      this.pending.delete(lesson);
      this.save();
    }
    const lead = s.speed * LEAD_SECONDS;
    let best: { lesson: Lesson; x: number } | null = null;
    const consider = (lesson: Lesson, at: number, end: number) => {
      if (this.learned.has(lesson) || end < x || at > x + lead) return;
      if (!best || at < best.x) best = { lesson, x: end };
    };
    for (const o of s.obstacles) {
      if (o.shielded) continue;
      if (o.kind === 'gate') { if (o.phase === s.phase) consider('gate', o.x, o.x + o.width); }
      else consider(o.kind === 'pulse' ? 'pulse' : 'spike', o.x, o.x + o.width);
    }
    for (const t of s.terrain) consider(t.kind === 'gap' ? 'gap' : 'platform', t.x, t.x + t.width);
    if (!best) return null;
    const lesson = (best as { lesson: Lesson; x: number }).lesson;
    if (!this.pending.has(lesson)) this.pending.set(lesson, (best as { x: number }).x);
    const ttc = ((best as { x: number }).x - x) / Math.max(1, s.speed);
    return {
      lesson,
      text: this.text(lesson),
      target: lesson === 'gate' ? 'phase' : undefined,
      slow: (lesson === 'spike' || lesson === 'gate') && ttc > .25 && ttc < 1.1,
    };
  }
}
