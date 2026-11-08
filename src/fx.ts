/** Presentation-only juice: pooled particles, screen shake, flashes, popups.
 * Nothing here touches the simulation, so effects never change outcomes. */

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; age: number; size: number; spin: number; angle: number;
  color: string; gravity: number; shape: 0 | 1 | 2;
}

export interface Popup { text: string; x: number; y: number; age: number; life: number; color: string; size: number }

const MAX_PARTICLES = 320;

export class Fx {
  readonly particles: Particle[] = [];
  readonly popups: Popup[] = [];
  /** 0..1, squared for shake amplitude. */
  trauma = 0;
  flash = 0;
  flashColor = '#ffffff';
  private seed = 1;
  /** Halve particle counts when frames run slow. */
  density = 1;

  random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  burst(x: number, y: number, count: number, color: string, opts: Partial<{ speed: number; spread: number; angle: number; life: number; size: number; gravity: number; shape: 0 | 1 | 2 }> = {}) {
    const n = Math.max(1, Math.round(count * this.density));
    const speed = opts.speed ?? 160, spread = opts.spread ?? Math.PI * 2, base = opts.angle ?? 0;
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = base + (this.random() - .5) * spread;
      const v = speed * (.35 + this.random() * .65);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: (opts.life ?? .5) * (.6 + this.random() * .6), age: 0,
        size: (opts.size ?? 3) * (.6 + this.random() * .7),
        spin: (this.random() - .5) * 14, angle: this.random() * Math.PI,
        color, gravity: opts.gravity ?? 300, shape: opts.shape ?? 0,
      });
    }
  }

  shake(amount: number) { this.trauma = Math.min(1, this.trauma + amount); }
  flashOnce(color: string, amount: number) { this.flash = Math.max(this.flash, amount); this.flashColor = color; }
  popup(text: string, x: number, y: number, color: string, size = 18, life = .9) {
    if (this.popups.length > 6) this.popups.shift();
    this.popups.push({ text, x, y, age: 0, life, color, size });
  }

  clear() { this.particles.length = 0; this.popups.length = 0; this.trauma = 0; this.flash = 0; }

  update(dt: number) {
    let live = 0;
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy += p.gravity * dt;
      p.vx *= 1 - Math.min(1, dt * 1.8);
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.angle += p.spin * dt;
      this.particles[live++] = p;
    }
    this.particles.length = live;
    live = 0;
    for (const p of this.popups) {
      p.age += dt;
      if (p.age < p.life) this.popups[live++] = p;
    }
    this.popups.length = live;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 3.2);
  }

  /** Shake offset in CSS pixels. */
  offset(time: number, reducedMotion: boolean): [number, number] {
    if (reducedMotion || this.trauma <= 0) return [0, 0];
    const k = this.trauma * this.trauma * 9;
    return [Math.sin(time * 61.3) * k, Math.cos(time * 47.9) * k];
  }

  /** Draw particles in the current (world) transform with additive light. */
  drawParticles(ctx: CanvasRenderingContext2D, shiftX = 0) {
    if (!this.particles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const t = 1 - p.age / p.life;
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.fillStyle = p.color;
      const s = p.size * (p.shape === 1 ? 1 : .5 + t * .5);
      if (p.shape === 1) {
        ctx.save(); ctx.translate(p.x - shiftX, p.y); ctx.rotate(p.angle);
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      } else if (p.shape === 2) {
        ctx.fillRect(p.x - shiftX - s * 1.6, p.y - s * .2, s * 3.2, s * .4);
      } else {
        ctx.fillRect(p.x - shiftX - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.restore();
  }

  drawPopups(ctx: CanvasRenderingContext2D, shiftX = 0, font = '800 18px "Barlow Condensed", Impact, sans-serif') {
    if (!this.popups.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.popups) {
      const t = p.age / p.life;
      const pop = t < .15 ? .7 + t / .15 * .45 : 1.15 - Math.min(.15, (t - .15) * .5);
      ctx.globalAlpha = t > .7 ? (1 - t) / .3 : 1;
      ctx.font = font.replace(/\d+px/, `${Math.round(p.size * pop)}px`);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#05021a';
      ctx.strokeText(p.text, p.x - shiftX, p.y - t * 26);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x - shiftX, p.y - t * 26);
    }
    ctx.restore();
  }

  drawFlash(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (this.flash <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(.6, this.flash);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
