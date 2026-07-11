import { add, clamp, dist, fromAngle, len, lerp, norm, scale, sub, vec, type Vec } from '../../engine/vec';
import {
  ARENA_MIN_RADIUS,
  ARENA_RADIUS,
  ARENA_SHRINK_DUR,
  ARENA_SHRINK_START,
  BASE_ATTACK_CD,
  BASE_DASH_CD,
  BLAST_MARGIN,
  BLINK_DIST,
  BOLT_DAMAGE,
  BOLT_KB,
  BOLT_RADIUS,
  BOLT_RANGE,
  BOLT_SPEED,
  DASH_DUR,
  FALL_DUR,
  GUARD_BREAK_STUN,
  PLAYER_COLOR,
  RESPAWN_INVULN,
  ROUNDS_TO_WIN,
  SCHOOL_COLORS,
  SHIELD_BLOCK_COST,
  STOCKS_PER_ROUND,
  SUDDEN_DEATH_DPS,
  SUDDEN_DEATH_START,
  WIZARD_RADIUS,
} from '../constants';
import type { Hazard } from '../hazards';
import type { Fighter } from '../match';
import type { Projectile } from '../projectile';
import { MatchStatsTracker } from '../stats';
import type { Mods } from '../types';
import { Wizard } from '../wizard';
import { mulberry32, seededRand } from './seeded-rng';
import type { PlayerInput, SimPhase, SimSnapshot } from './types';

/** Default colors for up to four human player slots. */
export const fighterColors = [
  PLAYER_COLOR,
  '#ff5964',
  '#ff9f43',
  '#c56cf0',
] as const;

type Phase = SimPhase;

function attackTint(mods: Mods): string | null {
  if (mods.boltExplodeRadius > 0 || mods.boltBurnDps > 0) return SCHOOL_COLORS.ember;
  if (mods.boltPull > 0 || mods.pressureVent > 0) return SCHOOL_COLORS.void;
  if (mods.boltChainDamage > 0 || mods.boltRicochet > 0 || mods.boltHoming > 0) {
    return SCHOOL_COLORS.volt;
  }
  if (mods.boltSlow > 0) return SCHOOL_COLORS.frost;
  if (mods.sniperShot > 0) return SCHOOL_COLORS.arcane;
  if (mods.attackKnockback > 0.2) return SCHOOL_COLORS.gale;
  return null;
}

export interface ArenaSimOptions {
  round?: number;
  /** Optional seed for deterministic respawn placement. */
  seed?: number;
}

export class ArenaSim {
  readonly fighters: Fighter[];
  readonly statsTracker = new MatchStatsTracker();

  wizards: Wizard[] = [];
  projectiles: Projectile[] = [];
  hazards: Hazard[] = [];

  phase: Phase = 'countdown';
  phaseTimer = 3.2;
  fightTime = 0;
  arenaRadius = ARENA_RADIUS;
  hitStop = 0;
  time = 0;
  tickCount = 0;
  banner = '';
  roundWinner: Fighter | null = null;

  private round: number;
  private matchEndedFlag = false;
  private prevShield = new Map<number, boolean>();
  private respawnRng: (() => number) | null = null;

  /** The KO line tightens with the platform so late rounds still end. */
  get blastRadius(): number {
    return this.arenaRadius + BLAST_MARGIN;
  }

  get roundEnded(): boolean {
    return this.phase === 'end';
  }

  get matchEnded(): boolean {
    return this.matchEndedFlag;
  }

  constructor(fighters: Fighter[], options: ArenaSimOptions = {}) {
    this.fighters = fighters;
    this.round = options.round ?? 1;
    if (options.seed !== undefined) {
      this.respawnRng = mulberry32(options.seed);
    }
    this.initRound();
  }

  applyInput(fighterId: number, input: PlayerInput): void {
    const w = this.wizards.find((wizard) => wizard.id === fighterId);
    if (!w || w.state !== 'active') return;

    w.aim = vec(input.aimX, input.aimY);
    if (this.phase === 'countdown') {
      w.moveDir = vec();
      w.wantAttack = false;
      w.wantShield = false;
      w.wantDash = false;
      return;
    }

    w.moveDir = vec(input.moveX, input.moveY);
    w.wantAttack = input.attack;
    w.wantShield = input.shield;
    w.wantDash = input.dash;
  }

  tick(dt: number): void {
    this.time += dt;

    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }

    if (this.phase === 'countdown') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phase = 'fight';
      }
      return;
    }

    if (this.phase === 'fight') {
      this.fightTime += dt;
      this.updateArenaRadius();
      if (this.fightTime > SUDDEN_DEATH_START) {
        for (const w of this.wizards) {
          if (w.state === 'active') w.pressure += SUDDEN_DEATH_DPS * dt;
        }
      }
      this.executeSkills(dt);
    }

    for (const w of this.wizards) {
      w.groundRadius = this.arenaRadius;
      if (w.state === 'active') {
        const wasDashing = w.isDashing;
        const prevPos = { x: w.pos.x, y: w.pos.y };
        w.update(dt);
        this.statsTracker.recordDistance(w.id, dist(w.pos, prevPos));
        this.statsTracker.recordPeakPressure(w.id, w.pressure);
        if (wasDashing) this.applyDashEffects(w, dt);
        if (wasDashing && !w.isDashing) this.onDashEnd(w);
      } else if (w.state === 'falling') {
        w.fallTimer -= dt / FALL_DUR;
        w.pos.x += w.fallDir.x * 120 * dt;
        w.pos.y += w.fallDir.y * 120 * dt;
        if (w.fallTimer <= 0) this.finishFall(w);
      }
    }

    this.updateProjectiles(dt);
    this.updateHazards(dt);
    this.updateThorns(dt);
    this.checkBlastZone();

    if (this.phase === 'fight') this.checkRoundEnd();

    this.tickCount++;
  }

  getSnapshot(atTick?: number): SimSnapshot {
    void atTick;
    return {
      tick: this.tickCount,
      phase: this.phase,
      phaseTimer: this.phaseTimer,
      fightTime: this.fightTime,
      arenaRadius: this.arenaRadius,
      blastRadius: this.blastRadius,
      banner: this.banner,
      round: this.round,
      wizards: this.wizards.map((w) => {
        const fighter = this.fighters.find((f) => f.id === w.id);
        return {
          id: w.id,
          name: w.name,
          color: w.color,
          x: w.pos.x,
          y: w.pos.y,
          aimX: w.aim.x,
          aimY: w.aim.y,
          pressure: w.pressure,
          stocks: w.stocks,
          state: w.state,
          shieldUp: w.shieldUp,
          stamina: w.stamina,
          roundWins: fighter?.roundWins ?? 0,
        };
      }),
      projectiles: this.projectiles.map((p) => ({
        x: p.pos.x,
        y: p.pos.y,
        vx: p.vel.x,
        vy: p.vel.y,
        color: p.color,
        radius: p.radius,
        ownerId: p.owner.id,
      })),
      hazards: this.hazards.map((h) => ({
        kind: h.kind,
        x: h.pos.x,
        y: h.pos.y,
        radius: h.radius,
        ttl: h.ttl,
        maxTtl: h.maxTtl,
      })),
    };
  }

  /**
   * Called after a round ends. Awards the win, resets for the next round, or
   * marks the match over. Returns true when the match has finished.
   */
  consumeRoundEnd(): boolean {
    if (this.phase !== 'end') return this.matchEndedFlag;

    const winner = this.roundWinner;
    if (winner) {
      winner.roundWins++;
      if (winner.roundWins >= ROUNDS_TO_WIN) {
        this.matchEndedFlag = true;
        return true;
      }
    }

    this.round++;
    this.initRound();
    return false;
  }

  private initRound(): void {
    const n = this.fighters.length;
    this.wizards = this.fighters.map((f, i) => {
      const w = new Wizard(f.id, f.name, f.color, true, f.boons);
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / n;
      w.pos = fromAngle(angle, ARENA_RADIUS * 0.6);
      w.aim = vec();
      w.stocks = STOCKS_PER_ROUND;
      return w;
    });
    this.projectiles = [];
    this.hazards = [];
    this.prevShield.clear();
    this.phase = 'countdown';
    this.phaseTimer = 3.2;
    this.fightTime = 0;
    this.arenaRadius = ARENA_RADIUS;
    this.hitStop = 0;
    this.banner = '';
    this.roundWinner = null;
  }

  private updateArenaRadius(): void {
    if (this.fightTime <= ARENA_SHRINK_START) return;
    const t = clamp((this.fightTime - ARENA_SHRINK_START) / ARENA_SHRINK_DUR, 0, 1);
    this.arenaRadius = lerp(ARENA_RADIUS, ARENA_MIN_RADIUS, t);
  }

  private executeSkills(dt: number): void {
    void dt;
    for (const w of this.wizards) {
      if (w.state !== 'active' || w.stun > 0) {
        if (w.shieldUp) w.shieldUp = false;
        continue;
      }

      if (w.offstage) {
        w.shieldUp = false;
        this.prevShield.set(w.id, false);
        if (w.wantDash && w.dashCd <= 0 && !w.isDashing) this.startDash(w);
        continue;
      }

      const hadShield = this.prevShield.get(w.id) ?? false;
      const canShield = !w.shieldBroken && w.stamina > 0.05;
      w.shieldUp = w.wantShield && canShield && !w.isDashing;
      if (w.shieldUp && !hadShield && w.mods.wardPulseKb > 0) {
        this.wardPulse(w);
      }
      if (w.stamina <= 0 && w.wantShield && !w.shieldBroken) {
        this.guardBreak(w);
      }
      this.prevShield.set(w.id, w.shieldUp);

      if (w.wantAttack && w.attackCd <= 0 && !w.shieldUp && !w.isDashing) {
        this.fireBolts(w);
      }

      if (w.wantDash && w.dashCd <= 0 && !w.isDashing) {
        this.startDash(w);
      }
    }
  }

  private fireBolts(w: Wizard): void {
    this.statsTracker.recordShot(w.id);
    const dir = norm(sub(w.aim, w.pos));
    if (len(dir) < 0.01) return;
    const count = 1 + w.mods.boltCount;
    const spread = 0.13;
    const baseAngle = Math.atan2(dir.y, dir.x);
    const tint = attackTint(w.mods);
    const sniper = w.mods.sniperShot > 0;
    for (let i = 0; i < count; i++) {
      const a = baseAngle + (i - (count - 1) / 2) * spread;
      this.projectiles.push({
        pos: add(w.pos, fromAngle(a, WIZARD_RADIUS + 16)),
        vel: fromAngle(a, BOLT_SPEED * (sniper ? 1.75 : 1)),
        owner: w,
        damage: BOLT_DAMAGE * (1 + w.mods.attackDamage) * (sniper ? 1.2 + w.mods.sniperShot : 1),
        knockback: BOLT_KB * (1 + w.mods.attackKnockback) * (sniper ? 1.25 : 1),
        radius: BOLT_RADIUS * (1 + w.mods.boltSize) * (sniper ? 0.75 : 1),
        range: BOLT_RANGE * (sniper ? 1.9 : 1),
        color: w.color,
        trailTint: tint,
        bounces: w.mods.boltRicochet,
        ignore: null,
        homing: w.mods.boltHoming,
        homingTarget: null,
        pierce: sniper ? 1 : 0,
      });
    }
    w.attackCd = BASE_ATTACK_CD * (1 - w.mods.attackCooldown) * (sniper ? 1.55 : 1);
  }

  private startDash(w: Wizard): void {
    let dir = len(w.moveDir) > 0.01 ? norm(w.moveDir) : norm(sub(w.aim, w.pos));
    if (len(dir) < 0.01) dir = vec(1, 0);

    w.dashCd = BASE_DASH_CD * (1 - w.mods.dashCooldown);
    w.dashHitIds.clear();

    if (w.mods.enemySwap > 0 && this.trySwap(w, dir)) return;

    if (w.mods.blink > 0) {
      const from = { ...w.pos };
      const blinkDist = BLINK_DIST * (1 + w.mods.dashDist);
      const toCursor = sub(w.aim, w.pos);
      const d = Math.min(len(toCursor), blinkDist);
      let target = add(w.pos, scale(norm(toCursor), d));
      const fromCenter = len(target);
      const maxR = this.arenaRadius - WIZARD_RADIUS;
      if (fromCenter > maxR) target = scale(norm(target), maxR);

      w.pos = target;
      w.knock = vec();

      if (w.mods.blackHolePull > 0) {
        this.hazards.push({
          kind: 'blackhole',
          pos: from,
          radius: 150,
          ttl: 2.4,
          maxTtl: 2.4,
          owner: w,
          value: w.mods.blackHolePull,
        });
      }
      this.onDashEnd(w);
      return;
    }

    w.dashTime = DASH_DUR * (1 + w.mods.dashDist);
    w.dashDir = dir;
    w.shieldUp = false;
  }

  private trySwap(w: Wizard, dir: Vec): boolean {
    let best: Wizard | null = null;
    let bestD = w.mods.enemySwap;
    for (const other of this.wizards) {
      if (other === w || !other.isTargetable) continue;
      const to = sub(other.pos, w.pos);
      const d = len(to);
      if (d >= bestD) continue;
      const facing = (to.x * dir.x + to.y * dir.y) / Math.max(d, 1);
      if (facing < 0.35) continue;
      bestD = d;
      best = other;
    }
    if (!best) return false;

    const a = { ...w.pos };
    const b = { ...best.pos };
    w.pos = b;
    best.pos = a;
    w.knock = vec();
    w.shieldUp = false;
    this.onDashEnd(w);
    return true;
  }

  private applyDashEffects(w: Wizard, dt: number): void {
    void dt;
    if (w.mods.dashTrailBurnDps > 0) {
      this.hazards.push({
        kind: 'fire',
        pos: { ...w.pos },
        radius: 52,
        ttl: 1.9,
        maxTtl: 1.9,
        owner: w,
        value: w.mods.dashTrailBurnDps,
      });
    }
    if (w.mods.dashFrostSlow > 0) {
      this.hazards.push({
        kind: 'frost',
        pos: { ...w.pos },
        radius: 58,
        ttl: 2.4,
        maxTtl: 2.4,
        owner: w,
        value: w.mods.dashFrostSlow,
      });
    }
    if (w.mods.dashZapDamage > 0) {
      for (const other of this.wizards) {
        if (other === w || !other.isTargetable || w.dashHitIds.has(other.id)) continue;
        if (dist(other.pos, w.pos) < WIZARD_RADIUS * 2.4) {
          w.dashHitIds.add(other.id);
          other.pressure += w.mods.dashZapDamage;
          other.applyKnockback(sub(other.pos, w.pos), 180);
        }
      }
    }
  }

  private onDashEnd(w: Wizard): void {
    const push = w.mods.dashShockwaveKb;
    const pull = w.mods.dashVortexPull;
    if (push <= 0 && pull <= 0) return;
    for (const other of this.wizards) {
      if (other === w || !other.isTargetable) continue;
      const d = dist(other.pos, w.pos);
      if (d < 190 && push > 0) {
        other.applyKnockback(sub(other.pos, w.pos), push);
        other.pressure += 3;
      }
      if (d < 280 && pull > 0) {
        other.applyKnockback(sub(w.pos, other.pos), pull);
        other.pressure += 2;
      }
    }
  }

  private wardPulse(w: Wizard): void {
    for (const other of this.wizards) {
      if (other === w || !other.isTargetable) continue;
      if (dist(other.pos, w.pos) < 220) {
        other.applyKnockback(sub(other.pos, w.pos), w.mods.wardPulseKb);
      }
    }
  }

  private guardBreak(w: Wizard): void {
    w.shieldBroken = true;
    w.shieldUp = false;
    w.applyStun(GUARD_BREAK_STUN);
  }

  private steerHoming(p: Projectile, dt: number): void {
    const heading = norm(p.vel);
    let best: Wizard | null = null;
    let bestD = 700;
    for (const w of this.wizards) {
      if (w === p.owner || w === p.ignore || !w.isTargetable) continue;
      const to = sub(w.pos, p.pos);
      const d = len(to);
      if (d >= bestD) continue;
      const facing = (to.x * heading.x + to.y * heading.y) / Math.max(d, 1);
      if (facing < -0.15) continue;
      bestD = d;
      best = w;
    }
    p.homingTarget = best;
    if (!best) return;

    const speed = len(p.vel);
    const cur = Math.atan2(p.vel.y, p.vel.x);
    const want = Math.atan2(best.pos.y - p.pos.y, best.pos.x - p.pos.x);
    let diff = want - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = clamp(diff, -p.homing * dt, p.homing * dt);
    p.vel = fromAngle(cur + turn, speed);
  }

  private updateProjectiles(dt: number): void {
    const list = this.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.homing > 0) this.steerHoming(p, dt);
      const step = len(p.vel) * dt;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.range -= step;

      let dead = p.range <= 0;

      if (!dead) {
        for (const w of this.wizards) {
          if (w === p.owner || w === p.ignore || !w.isTargetable || w.isDashing) continue;
          const hitR = WIZARD_RADIUS + p.radius + (w.shieldUp ? 12 : 0);
          if (dist(w.pos, p.pos) < hitR) {
            dead = this.resolveBoltHit(p, w);
            break;
          }
        }
      }

      if (dead) list.splice(i, 1);
    }
  }

  private resolveBoltHit(p: Projectile, target: Wizard): boolean {
    const owner = p.owner;

    if (target.shieldUp) {
      if (target.mods.parryWindow > 0 && target.shieldHeldFor <= target.mods.parryWindow) {
        p.owner = target;
        p.vel = scale(norm(sub(owner.pos, target.pos)), BOLT_SPEED);
        p.pos = add(target.pos, scale(norm(p.vel), WIZARD_RADIUS + p.radius + 14));
        p.color = target.color;
        p.trailTint = SCHOOL_COLORS.frost;
        p.damage *= 1.25;
        p.range = 900;
        p.ignore = target;
        this.statsTracker.recordBlock(target.id, true);
        return false;
      }

      target.stamina -= SHIELD_BLOCK_COST;
      target.applyKnockback(p.vel, p.knockback * 0.15);
      if (target.mods.wardSlow > 0) owner.applySlow(target.mods.wardSlow, 2);
      if (target.mods.wardBurnDps > 0) owner.applyBurn(target.mods.wardBurnDps, 2, target);
      if (target.mods.wardZapStun > 0) owner.applyStun(target.mods.wardZapStun);
      if (target.mods.wardAbsorb > 0) {
        target.pressure = Math.max(0, target.pressure - target.mods.wardAbsorb);
      }
      this.statsTracker.recordBlock(target.id, false);
      if (target.stamina <= 0) this.guardBreak(target);
      return true;
    }

    this.dealHit(owner, target, p.damage, norm(p.vel), p.knockback);

    if (owner.mods.boltBurnDps > 0) target.applyBurn(owner.mods.boltBurnDps, 2.2, owner);
    if (owner.mods.boltSlow > 0) target.applySlow(owner.mods.boltSlow, 1.6);
    if (owner.mods.boltPull > 0) {
      target.applyKnockback(sub(owner.pos, target.pos), owner.mods.boltPull);
    }
    if (owner.mods.boltChainDamage > 0) this.chainLightning(owner, target, p.damage);
    if (owner.mods.boltExplodeRadius > 0) {
      this.explode(owner, p.pos, p.damage, owner.mods.boltExplodeRadius);
    }

    if (p.pierce > 0) {
      p.pierce--;
      p.ignore = target;
      return false;
    }

    if (p.bounces > 0) {
      let next: Wizard | null = null;
      let bestD = 560;
      for (const w of this.wizards) {
        if (w === p.owner || w === target || !w.isTargetable) continue;
        const d = dist(w.pos, target.pos);
        if (d < bestD) {
          bestD = d;
          next = w;
        }
      }
      if (next) {
        p.bounces--;
        p.ignore = target;
        p.pos = { ...target.pos };
        p.vel = scale(norm(sub(next.pos, target.pos)), BOLT_SPEED);
        p.range = 620;
        return false;
      }
    }

    return true;
  }

  private dealHit(owner: Wizard, target: Wizard, damage: number, dir: Vec, kb: number): void {
    let dmg = damage;
    if (owner.mods.shatterBonus > 0 && target.slowTime > 0) {
      dmg *= 1 + owner.mods.shatterBonus;
    }
    target.pressure = Math.min(999, target.pressure + dmg);
    target.applyKnockback(dir, kb);
    target.lastAttacker = owner;
    target.lastAttackTime = this.time;
    this.statsTracker.recordDamage(owner.id, target.id, dmg);

    if (owner.mods.pressureVent > 0) {
      owner.pressure = Math.max(0, owner.pressure - dmg * owner.mods.pressureVent);
    }

    const oomph = clamp(dmg / 10 + target.pressure / 160, 0.4, 2);
    if (target.pressure > 90) this.hitStop = Math.max(this.hitStop, 0.045);
    void oomph;
  }

  private updateThorns(dt: number): void {
    for (const w of this.wizards) {
      if (w.mods.thorns <= 0 || w.state !== 'active') continue;
      for (const other of this.wizards) {
        if (other === w || !other.isTargetable) continue;
        if (dist(other.pos, w.pos) < WIZARD_RADIUS * 2.3) {
          other.pressure = Math.min(999, other.pressure + w.mods.thorns * dt);
          other.applyKnockback(sub(other.pos, w.pos), 26 * dt * 60);
        }
      }
    }
  }

  private chainLightning(owner: Wizard, from: Wizard, damage: number): void {
    let nearest: Wizard | null = null;
    let bestD = 430;
    for (const w of this.wizards) {
      if (w === owner || w === from || !w.isTargetable) continue;
      const d = dist(w.pos, from.pos);
      if (d < bestD) {
        bestD = d;
        nearest = w;
      }
    }
    if (!nearest) return;
    const dir = norm(sub(nearest.pos, from.pos));
    this.dealHit(owner, nearest, damage * owner.mods.boltChainDamage, dir, 180);
  }

  private explode(owner: Wizard, at: Vec, damage: number, radius: number): void {
    for (const w of this.wizards) {
      if (w === owner || !w.isTargetable) continue;
      const d = dist(w.pos, at);
      if (d < radius + WIZARD_RADIUS) {
        this.dealHit(owner, w, damage * 0.6, norm(sub(w.pos, at)), 320);
      }
    }
  }

  private updateHazards(dt: number): void {
    const list = this.hazards;
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i];
      h.ttl -= dt;
      if (h.ttl <= 0) {
        list.splice(i, 1);
        continue;
      }
      for (const w of this.wizards) {
        if (w === h.owner || !w.isTargetable) continue;
        const d = dist(w.pos, h.pos);
        if (d > h.radius + WIZARD_RADIUS * 0.5) continue;
        if (h.kind === 'fire') {
          w.applyBurn(h.value, 0.4, h.owner);
        } else if (h.kind === 'frost') {
          w.applySlow(h.value, 0.35);
        } else {
          const pull = norm(sub(h.pos, w.pos));
          w.knock.x += pull.x * h.value * 2.6 * dt;
          w.knock.y += pull.y * h.value * 2.6 * dt;
        }
      }
    }
  }

  private checkBlastZone(): void {
    for (const w of this.wizards) {
      if (w.state !== 'active') continue;
      if (len(w.pos) > this.blastRadius) {
        w.state = 'falling';
        w.fallTimer = 1;
        w.fallDir = norm(len(w.knock) > 40 ? w.knock : w.pos);
        w.shieldUp = false;
        this.hitStop = Math.max(this.hitStop, 0.09);
      }
    }
  }

  private finishFall(w: Wizard): void {
    const killer =
      w.lastAttacker && this.time - w.lastAttackTime < 5 && w.lastAttacker.state !== 'out'
        ? w.lastAttacker
        : null;
    if (killer && killer.id !== w.id) this.statsTracker.recordKO(killer.id, w.id);
    else this.statsTracker.get(w.id).deaths++;

    w.stocks--;
    if (w.stocks > 0 && this.phase === 'fight') {
      let best = vec();
      let bestScore = -1;
      for (let i = 0; i < 8; i++) {
        const angle = this.respawnRng ? seededRand(this.respawnRng, 0, Math.PI * 2) : this.randAngle();
        const cand = fromAngle(angle, this.arenaRadius * 0.45);
        let nearest = Infinity;
        for (const o of this.wizards) {
          if (o === w || o.state === 'out') continue;
          nearest = Math.min(nearest, dist(cand, o.pos));
        }
        if (nearest > bestScore) {
          bestScore = nearest;
          best = cand;
        }
      }
      w.pos = best;
      w.vel = vec();
      w.knock = vec();
      w.pressure = 0;
      w.burnTime = 0;
      w.burnDps = 0;
      w.slowTime = 0;
      w.slowFrac = 0;
      w.stun = 0;
      w.stamina = 1;
      w.shieldBroken = false;
      w.invuln = RESPAWN_INVULN;
      w.state = 'active';
    } else {
      w.state = 'out';
    }
  }

  private randAngle(): number {
    return Math.random() * Math.PI * 2;
  }

  private checkRoundEnd(): void {
    const alive = this.wizards.filter((w) => w.state !== 'out');
    if (alive.length > 1) return;
    this.roundWinner =
      alive.length === 1 ? this.fighters.find((f) => f.id === alive[0].id) ?? null : null;
    this.phase = 'end';
    this.phaseTimer = 2.6;
    this.banner = this.roundWinner
      ? `${this.roundWinner.name} takes the round!`
      : 'Nobody survives...';
  }
}
