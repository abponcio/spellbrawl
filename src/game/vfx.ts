import type { ParticleSystem } from '../engine/particles';
import { rand } from '../engine/rng';
import { len, type Vec } from '../engine/vec';
import { SCHOOL_COLORS } from './constants';
import type { Projectile } from './projectile';
import type { Mods } from './types';
import type { Wizard } from './wizard';

/**
 * Layered VFX: each effect primitive owns a visual layer, and a skill's
 * appearance is composed from the layers of the primitives it carries.
 * Any boon combo — curated or wildcard — automatically looks unique.
 */

/** Dominant school tint for an attack, judged by its strongest riders. */
export function attackTint(mods: Mods): string | null {
  if (mods.boltExplodeRadius > 0 || mods.boltBurnDps > 0) return SCHOOL_COLORS.ember;
  if (mods.boltPull > 0 || mods.pressureVent > 0) return SCHOOL_COLORS.void;
  if (mods.boltChainDamage > 0 || mods.boltRicochet > 0 || mods.boltHoming > 0)
    return SCHOOL_COLORS.volt;
  if (mods.boltSlow > 0) return SCHOOL_COLORS.frost;
  if (mods.sniperShot > 0) return SCHOOL_COLORS.arcane;
  if (mods.attackKnockback > 0.2) return SCHOOL_COLORS.gale;
  return null;
}

/** Per-frame trail layers behind a bolt in flight. */
export function emitBoltTrail(ps: ParticleSystem, p: Projectile, dt: number): void {
  const mods = p.owner.mods;
  const budget = dt * 60; // emissions tuned for 60fps frames

  // base motion trail: soft motes
  if (Math.random() < 0.85 * budget) {
    ps.emit({
      pos: { ...p.pos },
      count: 1,
      kind: 'mote',
      color: p.trailTint ?? p.color,
      speed: [2, 24],
      life: [0.2, 0.38],
      size: [3.5, 7],
      drag: 5,
      lowPriority: true,
    });
  }
  // flame licks
  if (mods.boltBurnDps > 0 && Math.random() < 0.5 * budget) {
    ps.emit({
      pos: { ...p.pos },
      count: 1,
      kind: 'spark',
      color: SCHOOL_COLORS.ember,
      angle: Math.atan2(-p.vel.y, -p.vel.x),
      spread: 1.2,
      speed: [30, 110],
      life: [0.15, 0.35],
      size: [2, 5],
      lowPriority: true,
    });
  }
  // crystalline shimmer
  if (mods.boltSlow > 0 && Math.random() < 0.35 * budget) {
    ps.emit({
      pos: { x: p.pos.x + rand(-8, 8), y: p.pos.y + rand(-8, 8) },
      count: 1,
      kind: 'shard',
      color: SCHOOL_COLORS.frost,
      speed: [1, 12],
      life: [0.2, 0.45],
      size: [1.5, 3],
      drag: 1,
      lowPriority: true,
    });
  }
  // crackling arcs
  if ((mods.boltChainDamage > 0 || mods.boltRicochet > 0 || mods.boltHoming > 0) && Math.random() < 0.4 * budget) {
    ps.emit({
      pos: { x: p.pos.x + rand(-12, 12), y: p.pos.y + rand(-12, 12) },
      count: 1,
      kind: 'spark',
      color: SCHOOL_COLORS.volt,
      speed: [40, 140],
      life: [0.06, 0.14],
      size: [1.5, 3],
      drag: 0.5,
      lowPriority: true,
    });
  }
  // violet gravity swirl
  if (mods.boltPull > 0 && Math.random() < 0.5 * budget) {
    const a = rand(0, Math.PI * 2);
    ps.emit({
      pos: { x: p.pos.x + Math.cos(a) * 14, y: p.pos.y + Math.sin(a) * 14 },
      count: 1,
      kind: 'mote',
      color: SCHOOL_COLORS.void,
      angle: a + Math.PI / 2,
      spread: 0.3,
      speed: [50, 90],
      life: [0.12, 0.25],
      size: [1.5, 3.5],
      drag: 1,
      lowPriority: true,
    });
  }
  // pulsing unstable core (explosive payload)
  if (mods.boltExplodeRadius > 0 && Math.random() < 0.3 * budget) {
    ps.emit({
      pos: { ...p.pos },
      count: 1,
      kind: 'mote',
      color: '#ffd9a0',
      speed: [0, 8],
      life: [0.08, 0.16],
      size: [4, 8],
      drag: 0,
      lowPriority: true,
    });
  }
}

/** Impact burst composed from the hit's properties. */
export function emitImpact(
  ps: ParticleSystem,
  at: Vec,
  dir: Vec,
  oomph: number,
  color: string,
): void {
  const angle = Math.atan2(dir.y, dir.x);
  ps.emit({
    pos: at,
    count: Math.round(12 * oomph),
    kind: 'spark',
    color,
    angle,
    spread: 1.6,
    speed: [140, 420],
    size: [3, 6.5],
    life: [0.2, 0.45],
  });
  // hot flash at the point of contact
  ps.emit({
    pos: at,
    count: 3,
    kind: 'mote',
    color: '#ffffff',
    speed: [0, 30],
    life: [0.08, 0.18],
    size: [8, 16],
    drag: 2,
  });
  // shockwave ring scaled to knockback
  ps.emit({
    pos: at,
    count: 1,
    kind: 'ring',
    color: '#ffffff',
    speed: [0, 0],
    life: [0.2, 0.3],
    size: [46 * oomph, 64 * oomph],
    drag: 0,
  });
}

/** Per-frame status auras around a wizard. */
export function emitAuras(ps: ParticleSystem, w: Wizard, dt: number): void {
  if (w.state !== 'active') return;
  const budget = dt * 60;

  // burning: rising embers
  if (w.burnTime > 0 && Math.random() < 0.6 * budget) {
    ps.emit({
      pos: { x: w.pos.x + rand(-16, 16), y: w.pos.y + rand(-16, 16) },
      count: 1,
      kind: Math.random() < 0.5 ? 'spark' : 'mote',
      color: SCHOOL_COLORS.ember,
      angle: -Math.PI / 2,
      spread: 0.8,
      speed: [30, 90],
      life: [0.25, 0.55],
      size: [2, 5],
      lowPriority: true,
    });
  }
  // chilled: slow rime shards
  if (w.slowTime > 0 && Math.random() < 0.4 * budget) {
    ps.emit({
      pos: { x: w.pos.x + rand(-20, 20), y: w.pos.y + rand(-20, 20) },
      count: 1,
      kind: 'shard',
      color: SCHOOL_COLORS.frost,
      speed: [1, 15],
      life: [0.3, 0.6],
      size: [1.5, 3],
      drag: 1,
      lowPriority: true,
    });
  }
  // thorns: hostile aura sparks
  if (w.mods.thorns > 0 && Math.random() < 0.25 * budget) {
    const a = rand(0, Math.PI * 2);
    ps.emit({
      pos: { x: w.pos.x + Math.cos(a) * 30, y: w.pos.y + Math.sin(a) * 30 },
      count: 1,
      kind: 'spark',
      color: SCHOOL_COLORS.ember,
      speed: [4, 20],
      life: [0.15, 0.3],
      size: [1.5, 3],
      lowPriority: true,
    });
  }
  // tailwind: wind streaks while moving fast
  if (w.mods.moveSpeed > 0.05 && len(w.vel) > 260 && Math.random() < 0.35 * budget) {
    ps.emit({
      pos: { x: w.pos.x - w.vel.x * 0.06, y: w.pos.y - w.vel.y * 0.06 },
      count: 1,
      kind: 'spark',
      color: SCHOOL_COLORS.gale,
      angle: Math.atan2(-w.vel.y, -w.vel.x),
      spread: 0.4,
      speed: [40, 100],
      life: [0.12, 0.28],
      size: [1.5, 3],
      lowPriority: true,
    });
  }
  // void blink/swap owner: drifting wisps
  if ((w.mods.blink > 0 || w.mods.enemySwap > 0) && Math.random() < 0.15 * budget) {
    ps.emit({
      pos: { x: w.pos.x + rand(-18, 18), y: w.pos.y + rand(-18, 18) },
      count: 1,
      kind: 'mote',
      color: SCHOOL_COLORS.void,
      speed: [4, 24],
      life: [0.3, 0.6],
      size: [1.5, 3.5],
      drag: 1,
      lowPriority: true,
    });
  }
}
