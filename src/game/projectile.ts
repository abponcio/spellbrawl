import type { Vec } from '../engine/vec';
import type { Wizard } from './wizard';

export interface Projectile {
  pos: Vec;
  vel: Vec;
  owner: Wizard;
  damage: number;
  knockback: number;
  radius: number;
  /** Remaining travel distance before fizzling. */
  range: number;
  color: string;
  /** School tint from the owner's attack riders, if any. */
  trailTint: string | null;
  /** Remaining ricochet bounces toward other enemies. */
  bounces: number;
  /** Wizard this bolt cannot hit (just-ricocheted-off target). */
  ignore: Wizard | null;
  /** Turn rate (rad/s) the bolt curves toward its homing target. */
  homing: number;
  /** Current homing target, resolved each frame (for the lock-on brackets). */
  homingTarget: Wizard | null;
  /** Remaining enemies a sniper bolt can punch through. */
  pierce: number;
}

export function renderProjectile(ctx: CanvasRenderingContext2D, p: Projectile): void {
  const a = Math.atan2(p.vel.y, p.vel.x);
  ctx.save();
  ctx.translate(p.pos.x, p.pos.y);
  ctx.rotate(a);
  // faster bolts stretch into streaks (sniper shots read as piercing beams)
  const speed = Math.hypot(p.vel.x, p.vel.y);
  const stretch = Math.min(2.2, Math.max(1, speed / 950));
  ctx.scale(stretch, 1);
  const glow = p.trailTint ?? p.color;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 24;
  if (p.trailTint) {
    // school halo behind the bolt body
    ctx.fillStyle = p.trailTint;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.radius * 2.3, p.radius * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, p.radius * 1.7, p.radius * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(p.radius * 0.4, 0, p.radius * 0.7, p.radius * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
