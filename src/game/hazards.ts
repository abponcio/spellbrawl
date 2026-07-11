import type { Vec } from '../engine/vec';
import { SCHOOL_COLORS } from './constants';
import type { Wizard } from './wizard';

export type HazardKind = 'fire' | 'frost' | 'blackhole';

export interface Hazard {
  kind: HazardKind;
  pos: Vec;
  radius: number;
  ttl: number;
  maxTtl: number;
  owner: Wizard;
  /** fire: burn dps; frost: slow fraction; blackhole: pull strength. */
  value: number;
}

export function renderHazard(ctx: CanvasRenderingContext2D, h: Hazard, time: number): void {
  const t = h.ttl / h.maxTtl;
  ctx.save();
  ctx.translate(h.pos.x, h.pos.y);
  if (h.kind === 'fire') {
    ctx.globalAlpha = 0.35 * t + 0.1;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, h.radius);
    g.addColorStop(0, SCHOOL_COLORS.ember);
    g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, h.radius * (0.9 + Math.sin(time * 9) * 0.08), 0, Math.PI * 2);
    ctx.fill();
  } else if (h.kind === 'frost') {
    ctx.globalAlpha = 0.3 * t + 0.08;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, h.radius);
    g.addColorStop(0, SCHOOL_COLORS.frost);
    g.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // black hole
    ctx.globalAlpha = 0.85 * Math.min(1, t * 3);
    ctx.fillStyle = '#0a0114';
    ctx.shadowColor = SCHOOL_COLORS.void;
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.arc(0, 0, h.radius * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = SCHOOL_COLORS.void;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        h.radius * (0.55 + i * 0.3),
        h.radius * (0.2 + i * 0.12),
        time * (2 - i * 0.8),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
