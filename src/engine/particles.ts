import { rand } from './rng';
import type { Vec } from './vec';

/**
 * Pooled particle system with purpose-built particle kinds:
 * - `spark`: elongated streak oriented to velocity (hits, volt)
 * - `mote`:  soft radial-gradient blob (ambient magic, trails)
 * - `smoke`: expanding fading puff (explosions, guard break)
 * - `ring`:  expanding shockwave stroke (AOE, dash shockwave, ring-outs)
 * - `shard`: rotating diamond (frost, platform cracks)
 *
 * Glow-tagged particles render in an additive pass so overlapping magic
 * stacks brightness. Mote gradients are stamped from pre-rendered offscreen
 * canvases (one per color) instead of per-particle gradients.
 */
export type ParticleKind = 'spark' | 'mote' | 'smoke' | 'ring' | 'shard';

interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  drag: number;
  glow: boolean;
  rot: number;
  rotVel: number;
}

const MAX_PARTICLES = 900;

// ---------------------------------------------------------------- stamps

const stampCache = new Map<string, HTMLCanvasElement>();
const STAMP_SIZE = 64;

/** Pre-rendered radial-gradient blob, one per color, drawn once at first use. */
function moteStamp(color: string): HTMLCanvasElement {
  let stamp = stampCache.get(color);
  if (stamp) return stamp;
  stamp = document.createElement('canvas');
  stamp.width = STAMP_SIZE;
  stamp.height = STAMP_SIZE;
  const c = stamp.getContext('2d')!;
  const half = STAMP_SIZE / 2;
  const grad = c.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, color);
  grad.addColorStop(0.4, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = grad;
  c.fillRect(0, 0, STAMP_SIZE, STAMP_SIZE);
  stampCache.set(color, stamp);
  return stamp;
}

// ---------------------------------------------------------------- system

export class ParticleSystem {
  private pool: Particle[] = [];
  private alive = 0;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({
        kind: 'mote',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        color: '#fff',
        drag: 0,
        glow: true,
        rot: 0,
        rotVel: 0,
      });
    }
  }

  emit(opts: {
    pos: Vec;
    count: number;
    color: string;
    kind?: ParticleKind;
    speed?: [number, number];
    life?: [number, number];
    size?: [number, number];
    spread?: number; // radians, centered on angle
    angle?: number;
    drag?: number;
    glow?: boolean;
    /** Low-priority emissions (ambient trails) are dropped first when full. */
    lowPriority?: boolean;
  }): void {
    const {
      pos,
      count,
      color,
      kind = 'mote',
      speed = [40, 220],
      life = [0.25, 0.7],
      size = [3, 8],
      spread = Math.PI * 2,
      angle = 0,
      drag = 3,
      glow = kind !== 'smoke',
      lowPriority = false,
    } = opts;

    for (let i = 0; i < count; i++) {
      let p: Particle;
      if (this.alive < MAX_PARTICLES) {
        p = this.pool[this.alive++];
      } else if (lowPriority) {
        return; // ambient effects degrade first under load
      } else {
        // gameplay-critical effect: recycle the oldest slot
        p = this.pool[i % MAX_PARTICLES];
      }
      const a = angle + rand(-spread / 2, spread / 2);
      const s = rand(speed[0], speed[1]);
      const l = rand(life[0], life[1]);
      p.kind = kind;
      p.x = pos.x;
      p.y = pos.y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = l;
      p.maxLife = l;
      p.size = rand(size[0], size[1]);
      p.color = color;
      p.drag = drag;
      p.glow = glow;
      p.rot = rand(0, Math.PI * 2);
      p.rotVel = kind === 'shard' ? rand(-7, 7) : 0;
    }
  }

  update(dt: number): void {
    for (let i = this.alive - 1; i >= 0; i--) {
      const p = this.pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        // swap-remove: keep the alive particles densely packed at the front
        this.alive--;
        const last = this.pool[this.alive];
        this.pool[this.alive] = p;
        this.pool[i] = last;
        continue;
      }
      const f = Math.max(0, 1 - p.drag * dt);
      p.vx *= f;
      p.vy *= f;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.rotVel * dt;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    // pass 1: non-glow (smoke) with normal compositing
    for (let i = 0; i < this.alive; i++) {
      const p = this.pool[i];
      if (!p.glow) this.renderOne(ctx, p);
    }
    // pass 2: glow particles, additively composed for the production look
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.alive; i++) {
      const p = this.pool[i];
      if (p.glow) this.renderOne(ctx, p);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prevOp;
  }

  private renderOne(ctx: CanvasRenderingContext2D, p: Particle): void {
    const t = p.life / p.maxLife;

    switch (p.kind) {
      case 'spark': {
        // streak oriented to velocity; length scales with speed
        const speed = Math.hypot(p.vx, p.vy);
        const stretch = Math.min(0.045, 14 / Math.max(speed, 1));
        ctx.globalAlpha = t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * (0.35 + 0.65 * t);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * stretch, p.y - p.vy * stretch);
        ctx.stroke();
        break;
      }
      case 'mote': {
        const d = p.size * (0.8 + 1.2 * t) * 2.6;
        ctx.globalAlpha = t * 0.9;
        ctx.drawImage(moteStamp(p.color), p.x - d / 2, p.y - d / 2, d, d);
        break;
      }
      case 'smoke': {
        // grows and thins as it dies
        const r = p.size * (1 + 2.2 * (1 - t));
        ctx.globalAlpha = t * 0.3;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'ring': {
        // expanding shockwave stroke; size is the final radius
        const r = p.size * (0.25 + 0.75 * (1 - t));
        ctx.globalAlpha = t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 + 4 * t;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'shard': {
        // rotating diamond
        const s = p.size * (0.5 + 0.5 * t);
        ctx.globalAlpha = t;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.moveTo(0, -s * 1.6);
        ctx.lineTo(s, 0);
        ctx.lineTo(0, s * 1.6);
        ctx.lineTo(-s, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
    }
  }

  clear(): void {
    this.alive = 0;
  }
}
