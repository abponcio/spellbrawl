import { rand } from '../engine/rng';
import { add, dist, len, norm, scale, sub, vec } from '../engine/vec';
import { AI_DIFFICULTY_PRESETS, BOLT_SPEED, WIZARD_RADIUS, type AIDifficultyPreset } from './constants';
import type { Hazard } from './hazards';
import type { Projectile } from './projectile';
import type { OwnedBoon, Rarity } from './types';
import type { Wizard } from './wizard';

const RARITY_SCORE: Record<Rarity, number> = { common: 1, rare: 2, epic: 3 };

/** Heuristic boon choice for AI drafting: duos > rarity > attack slot. */
export function aiPickBoon(offers: OwnedBoon[]): OwnedBoon {
  let best = offers[0];
  let bestScore = -1;
  for (const o of offers) {
    let score = RARITY_SCORE[o.rarity] * 2;
    if (o.def.requires) score += 10;
    if (o.def.slot === 'attack') score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

interface ThreatInfo {
  projectile: Projectile;
  eta: number;
}

/**
 * Steering-based AI with difficulty presets: imperfect shields, spread targeting,
 * and at most one bot designated to chase the human in multi-AI modes.
 */
export class AIController {
  private strafeDir = Math.random() < 0.5 ? -1 : 1;
  private strafeTimer = rand(1, 3);
  private shieldHold = 0;
  private shieldReaction = 0;
  private aimError: number;
  private fireDelay = rand(0.5, 1.1);
  private readonly preset: AIDifficultyPreset;

  constructor(
    readonly wizard: Wizard,
    preset: AIDifficultyPreset,
  ) {
    this.preset = preset;
    this.aimError = rand(preset.aimErrorMin, preset.aimErrorMax);
  }

  static presetFor(difficulty: keyof typeof AI_DIFFICULTY_PRESETS): AIDifficultyPreset {
    return AI_DIFFICULTY_PRESETS[difficulty];
  }

  update(
    dt: number,
    wizards: Wizard[],
    projectiles: Projectile[],
    hazards: Hazard[],
    arenaRadius: number,
    playerChaserId: number | null,
  ): void {
    const me = this.wizard;
    me.wantAttack = false;
    me.wantShield = false;
    me.wantDash = false;

    if (me.state !== 'active') return;

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeDir *= -1;
      this.strafeTimer = rand(1.2, 3);
    }
    this.fireDelay = Math.max(0, this.fireDelay - dt);
    this.shieldHold = Math.max(0, this.shieldHold - dt);
    this.shieldReaction = Math.max(0, this.shieldReaction - dt);

    if (me.offstage) {
      const inward = scale(norm(me.pos), -1);
      me.moveDir = inward;
      const outSpeed = me.knock.x * -inward.x + me.knock.y * -inward.y;
      if (me.dashCd <= 0 && (outSpeed > -60 || len(me.pos) > arenaRadius + 120)) {
        me.wantDash = true;
      }
      return;
    }

    const target = this.pickTarget(wizards, playerChaserId);

    let steer = vec();
    if (target) {
      const toTarget = sub(target.pos, me.pos);
      const d = len(toTarget);
      const dir = norm(toTarget);
      if (d > 480) steer = add(steer, scale(dir, 1));
      else if (d < 300) steer = add(steer, scale(dir, -1.1));
      steer = add(steer, scale(vec(-dir.y, dir.x), this.strafeDir * 0.7));
    }

    const fromCenter = len(me.pos);
    const edgeMargin = arenaRadius - fromCenter;
    if (edgeMargin < 150) {
      const inward = scale(norm(me.pos), -1);
      steer = add(steer, scale(inward, 1.6 + (150 - edgeMargin) / 60));
    }

    for (const h of hazards) {
      if (h.owner === me) continue;
      const d = dist(h.pos, me.pos);
      if (d < h.radius + 50) {
        steer = add(steer, scale(norm(sub(me.pos, h.pos)), 1.3));
      }
    }

    me.moveDir = steer;

    const threat = this.scanThreat(me, projectiles);
    if (threat && threat.eta < this.preset.threatEtaMax) {
      if (Math.random() >= this.preset.shieldMissChance) {
        if (this.shieldReaction <= 0) {
          this.shieldReaction = rand(this.preset.shieldReactionMin, this.preset.shieldReactionMax);
        }
        if (this.shieldReaction <= dt + 0.02 && !me.shieldBroken && me.stamina > 0.25) {
          this.shieldHold = rand(this.preset.shieldHoldMin, this.preset.shieldHoldMax);
        }
      } else if (me.dashCd <= 0 && threat.eta < 0.18) {
        const heading = norm(threat.projectile.vel);
        me.moveDir = vec(-heading.y * this.strafeDir, heading.x * this.strafeDir);
        me.wantDash = true;
      }
    }

    const knockSpeed = len(me.knock);
    if (knockSpeed > 350 && edgeMargin < 220 && me.dashCd <= 0) {
      const outward = norm(me.pos);
      const outSpeed = me.knock.x * outward.x + me.knock.y * outward.y;
      if (outSpeed > 250) {
        me.moveDir = scale(outward, -1);
        me.wantDash = true;
      }
    }

    me.wantShield = this.shieldHold > 0;

    if (target && !me.wantShield) {
      const d = dist(target.pos, me.pos);
      const eta = d / BOLT_SPEED;
      const predicted = add(target.pos, scale(add(target.vel, target.knock), eta * 0.85));
      const jitter = this.aimError * d;
      me.aim = {
        x: predicted.x + rand(-jitter, jitter),
        y: predicted.y + rand(-jitter, jitter),
      };
      if (me.attackCd <= 0 && this.fireDelay <= 0 && d < 850) {
        me.wantAttack = true;
        this.fireDelay = rand(this.preset.fireDelayMin, this.preset.fireDelayMax);
      }
    } else if (target) {
      me.aim = { ...target.pos };
    }

    if (
      target &&
      target.pressure > this.preset.edgeGuardPressure &&
      len(target.pos) > arenaRadius - 200 &&
      me.dashCd <= 0 &&
      dist(target.pos, me.pos) > 380 &&
      edgeMargin > 250 &&
      Math.random() < this.preset.edgeGuardChance
    ) {
      me.moveDir = norm(sub(target.pos, me.pos));
      me.wantDash = true;
    }
  }

  private pickTarget(wizards: Wizard[], playerChaserId: number | null): Wizard | null {
    const me = this.wizard;
    const player = wizards.find((w) => w.isPlayer && w.state === 'active');
    const candidates = wizards.filter((w) => w !== me && w.state === 'active' && w.isTargetable);
    if (candidates.length === 0) return null;

    const scored = candidates
      .map((w) => ({ w, d: dist(w.pos, me.pos) }))
      .sort((a, b) => a.d - b.d);

    const nearest = scored[0];
    if (!player || player === me) return nearest.w;

    const playerEntry = scored.find((s) => s.w.isPlayer);
    if (!playerEntry) return nearest.w;

    const isChaser = playerChaserId === me.id;
    if (!isChaser && scored.length > 1) {
      const alt = scored.find((s) => !s.w.isPlayer) ?? scored[1];
      if (Math.random() < this.preset.playerSkipChance && alt.d < playerEntry.d * 1.15) {
        return alt.w;
      }
    }

    if (isChaser) return player;
    if (nearest.w.isPlayer && scored.length > 1 && Math.random() < this.preset.playerSkipChance) {
      return scored[1].w;
    }
    return nearest.w;
  }

  private scanThreat(me: Wizard, projectiles: Projectile[]): ThreatInfo | null {
    let threat: ThreatInfo | null = null;
    for (const p of projectiles) {
      if (p.owner === me) continue;
      const rel = sub(me.pos, p.pos);
      const speed = len(p.vel);
      if (speed < 1) continue;
      const heading = norm(p.vel);
      const along = rel.x * heading.x + rel.y * heading.y;
      if (along < 0) continue;
      const lateral = Math.abs(rel.x * -heading.y + rel.y * heading.x);
      if (lateral > WIZARD_RADIUS + p.radius + this.preset.lateralTol) continue;
      const eta = along / speed;
      if (!threat || eta < threat.eta) {
        threat = { projectile: p, eta };
      }
    }
    return threat;
  }
}

/** Only one AI actively chases the human; others spread targets. */
export function pickPlayerChaserId(wizards: Wizard[]): number | null {
  const player = wizards.find((w) => w.isPlayer && w.state === 'active');
  if (!player) return null;
  let bestId: number | null = null;
  let bestD = Infinity;
  for (const w of wizards) {
    if (w.isPlayer || w.state !== 'active') continue;
    const d = dist(w.pos, player.pos);
    if (d < bestD) {
      bestD = d;
      bestId = w.id;
    }
  }
  return bestId;
}
