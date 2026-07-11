import { getAsset } from '../engine/assets';
import { sfx } from '../engine/audio';
import { ParticleSystem } from '../engine/particles';
import { rand } from '../engine/rng';
import type { Scene } from '../engine/scene';
import { ScreenShake } from '../engine/shake';
import { add, clamp, dist, fromAngle, len, lerp, norm, scale, sub, vec, type Vec } from '../engine/vec';
import { AIController, pickPlayerChaserId } from '../game/ai';
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
  RESPAWN_INVULN,
  SCHOOL_COLORS,
  SHIELD_BLOCK_COST,
  STOCKS_PER_ROUND,
  SUDDEN_DEATH_DPS,
  SUDDEN_DEATH_START,
  WIZARD_RADIUS,
  WORLD_VIEW,
  AI_DIFFICULTY_PRESETS,
} from '../game/constants';
import type { GameCtx } from '../game/context';
import { loadSettings } from '../game/settings';
import { renderHazard, type Hazard } from '../game/hazards';
import type { Fighter } from '../game/match';
import { renderProjectile, type Projectile } from '../game/projectile';
import { attackTint, emitAuras, emitBoltTrail, emitImpact } from '../game/vfx';
import { Wizard } from '../game/wizard';
import { drawHud } from '../ui/hud';

type Phase = 'countdown' | 'fight' | 'end';

/** Ambient arcane mote drifting in the void behind the arena. */
interface Mote {
  x: number;
  y: number;
  size: number;
  tw: number;
  drift: number; // radians/sec of slow orbit around the center
  color: string;
}

const MOTE_COLORS = ['#8f7bff', '#5fd8d0', '#b06bff', '#6f8cff'];

export class ArenaScene implements Scene {
  wizards: Wizard[] = [];
  projectiles: Projectile[] = [];
  hazards: Hazard[] = [];
  particles = new ParticleSystem();
  shake = new ScreenShake();

  /** Brief void-tether flashes drawn between swap partners. */
  tethers: { a: Vec; b: Vec; ttl: number }[] = [];

  phase: Phase = 'countdown';
  phaseTimer = 3.2;
  fightTime = 0;
  arenaRadius = ARENA_RADIUS;
  hitStop = 0;
  time = 0;
  banner = '';
  roundWinner: Fighter | null = null;

  private ais: AIController[] = [];
  private motes: Mote[] = [];
  private prevShield = new Map<number, boolean>();
  private lastCountdownSecond = 4;
  /** Smoothed dynamic camera: visible world diameter. */
  private camView = WORLD_VIEW;

  /** The KO line tightens with the platform so late rounds still end. */
  get blastRadius(): number {
    return this.arenaRadius + BLAST_MARGIN;
  }

  constructor(readonly ctx: GameCtx) {
    for (let i = 0; i < 90; i++) {
      this.motes.push({
        x: rand(-1700, 1700),
        y: rand(-1700, 1700),
        size: rand(1.2, 4),
        tw: rand(0, Math.PI * 2),
        drift: rand(0.004, 0.02) * (Math.random() < 0.5 ? -1 : 1),
        color: MOTE_COLORS[i % MOTE_COLORS.length],
      });
    }
  }

  enter(): void {
    const match = this.ctx.match!;
    const n = match.fighters.length;
    this.wizards = match.fighters.map((f, i) => {
      const w = new Wizard(f.id, f.name, f.color, f.isPlayer, f.boons);
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / n;
      w.pos = fromAngle(angle, ARENA_RADIUS * 0.6);
      w.aim = vec();
      w.stocks = STOCKS_PER_ROUND;
      return w;
    });
    this.ais = this.wizards
      .filter((w) => !w.isPlayer)
      .map((w) => new AIController(w, AI_DIFFICULTY_PRESETS[loadSettings().aiDifficulty]));
    this.projectiles = [];
    this.hazards = [];
    this.tethers = [];
    this.particles.clear();
    this.phase = 'countdown';
    this.phaseTimer = 3.2;
    this.fightTime = 0;
    this.arenaRadius = ARENA_RADIUS;
    this.lastCountdownSecond = 4;
    this.camView = (ARENA_RADIUS + 110) * 2;
    this.ctx.viewport.setWorldView(this.camView);
  }

  /**
   * Camera zoom: hug the platform while everyone has footing, pull back just
   * enough to keep off-stage wizards (and the KO ring they're nearing) framed.
   */
  private updateCamera(dt: number): void {
    let need = this.arenaRadius + 110;
    for (const w of this.wizards) {
      if (w.state === 'out') continue;
      const d = len(w.pos);
      if (d + 130 > need) need = Math.min(d + 130, this.blastRadius + 110);
    }
    const target = need * 2;
    this.camView += (target - this.camView) * clamp(dt * 2.5, 0, 1);
    this.ctx.viewport.setWorldView(this.camView);
  }

  // ---------------------------------------------------------------- update

  update(dt: number): void {
    this.time += dt;

    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.shake.update(dt, this.ctx.viewport.shake);
      return;
    }

    if (this.phase === 'countdown') {
      this.phaseTimer -= dt;
      const sec = Math.ceil(this.phaseTimer);
      if (sec < this.lastCountdownSecond && sec > 0) {
        this.lastCountdownSecond = sec;
        sfx.countdown();
      }
      if (this.phaseTimer <= 0) {
        this.phase = 'fight';
        sfx.fight();
      }
      // let wizards look around during countdown
      this.readPlayerIntent(true);
      this.updateCamera(dt);
      this.shake.update(dt, this.ctx.viewport.shake);
      this.particles.update(dt);
      return;
    }

    if (this.phase === 'fight') {
      this.fightTime += dt;
      this.updateArenaRadius();
      // sudden death: pressure creeps up on everyone so the round must end
      if (this.fightTime > SUDDEN_DEATH_START) {
        for (const w of this.wizards) {
          if (w.state === 'active') w.pressure += SUDDEN_DEATH_DPS * dt;
        }
      }
      this.readPlayerIntent(false);
      const playerChaserId = pickPlayerChaserId(this.wizards);
      for (const ai of this.ais) {
        ai.update(
          dt,
          this.wizards,
          this.projectiles,
          this.hazards,
          this.arenaRadius,
          playerChaserId,
        );
      }
      this.executeSkills(dt);
    }

    // world simulation continues during the end banner so ragdolls settle
    for (const w of this.wizards) {
      w.groundRadius = this.arenaRadius;
      const stats = this.ctx.match!.statsTracker;
      if (w.state === 'active') {
        const wasDashing = w.isDashing;
        const prevPos = { x: w.pos.x, y: w.pos.y };
        w.update(dt);
        stats.recordDistance(w.id, dist(w.pos, prevPos));
        stats.recordPeakPressure(w.id, w.pressure);
        if (wasDashing) this.applyDashEffects(w, dt);
        if (wasDashing && !w.isDashing) this.onDashEnd(w);
        emitAuras(this.particles, w, dt);
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
    for (let i = this.tethers.length - 1; i >= 0; i--) {
      this.tethers[i].ttl -= dt;
      if (this.tethers[i].ttl <= 0) this.tethers.splice(i, 1);
    }
    this.particles.update(dt);
    this.updateCamera(dt);
    this.shake.update(dt, this.ctx.viewport.shake);

    if (this.phase === 'fight') this.checkRoundEnd();

    if (this.phase === 'end') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        const match = this.ctx.match!;
        const winnerFighter = this.roundWinner;
        const over = match.scoreRound(winnerFighter);
        if (over) this.ctx.endMatch();
        else this.ctx.startDraft();
      }
    }
  }

  private updateArenaRadius(): void {
    if (this.fightTime <= ARENA_SHRINK_START) return;
    const t = clamp((this.fightTime - ARENA_SHRINK_START) / ARENA_SHRINK_DUR, 0, 1);
    this.arenaRadius = lerp(ARENA_RADIUS, ARENA_MIN_RADIUS, t);
  }

  private readPlayerIntent(aimOnly: boolean): void {
    const player = this.wizards.find((w) => w.isPlayer);
    if (!player || player.state !== 'active') return;
    const { input, viewport } = this.ctx;

    player.aim = viewport.screenToWorld(input.mouse);
    if (aimOnly) {
      player.moveDir = vec();
      player.wantAttack = false;
      player.wantShield = false;
      player.wantDash = false;
      return;
    }

    player.moveDir = vec(
      (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0),
      (input.isDown('KeyS') ? 1 : 0) - (input.isDown('KeyW') ? 1 : 0),
    );
    player.wantAttack = input.isMouseDown(0) || input.wasClicked(0);
    player.wantShield = input.isMouseDown(2) || input.wasClicked(2);
    player.wantDash =
      input.wasPressed('Space') || input.wasPressed('ShiftLeft') || input.wasPressed('ShiftRight');
  }

  private executeSkills(dt: number): void {
    void dt;
    for (const w of this.wizards) {
      if (w.state !== 'active' || w.stun > 0) {
        if (w.shieldUp) w.shieldUp = false;
        continue;
      }

      // off-stage: no footing to cast from — only dash/blink (your recovery)
      if (w.offstage) {
        w.shieldUp = false;
        this.prevShield.set(w.id, false);
        if (w.wantDash && w.dashCd <= 0 && !w.isDashing) this.startDash(w);
        continue;
      }

      // --- shield ---
      const hadShield = this.prevShield.get(w.id) ?? false;
      const canShield = !w.shieldBroken && w.stamina > 0.05;
      w.shieldUp = w.wantShield && canShield && !w.isDashing;
      if (w.shieldUp && !hadShield) {
        sfx.shieldUp();
        if (w.mods.wardPulseKb > 0) this.wardPulse(w);
      }
      if (w.stamina <= 0 && w.wantShield && !w.shieldBroken) {
        this.guardBreak(w);
      }
      this.prevShield.set(w.id, w.shieldUp);

      // --- attack ---
      if (w.wantAttack && w.attackCd <= 0 && !w.shieldUp && !w.isDashing) {
        this.fireBolts(w);
      }

      // --- dash / blink ---
      if (w.wantDash && w.dashCd <= 0 && !w.isDashing) {
        this.startDash(w);
      }
    }
  }

  private fireBolts(w: Wizard): void {
    this.ctx.match!.statsTracker.recordShot(w.id);
    const dir = norm(sub(w.aim, w.pos));
    if (len(dir) < 0.01) return;
    const count = 1 + w.mods.boltCount;
    const spread = 0.13;
    const baseAngle = Math.atan2(dir.y, dir.x);
    const tint = attackTint(w.mods);
    // sniper archetype: fewer, faster, further, harder — and it pierces
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
    this.particles.emit({
      pos: add(w.pos, scale(dir, WIZARD_RADIUS + 10)),
      count: 4,
      color: w.color,
      angle: baseAngle,
      spread: 0.9,
      speed: [80, 200],
      life: [0.1, 0.25],
    });
    sfx.shot();
  }

  private startDash(w: Wizard): void {
    let dir = len(w.moveDir) > 0.01 ? norm(w.moveDir) : norm(sub(w.aim, w.pos));
    if (len(dir) < 0.01) dir = vec(1, 0);

    w.dashCd = BASE_DASH_CD * (1 - w.mods.dashCooldown);
    w.dashHitIds.clear();
    sfx.dash();

    // enemy swap: dashing toward a nearby enemy trades places instead
    if (w.mods.enemySwap > 0 && this.trySwap(w, dir)) return;

    if (w.mods.blink > 0) {
      // teleport: player blinks toward cursor, AI along its steering direction
      const from = { ...w.pos };
      const blinkDist = BLINK_DIST * (1 + w.mods.dashDist);
      let target: Vec;
      if (w.isPlayer) {
        const toCursor = sub(w.aim, w.pos);
        const d = Math.min(len(toCursor), blinkDist);
        target = add(w.pos, scale(norm(toCursor), d));
      } else {
        target = add(w.pos, scale(dir, blinkDist));
      }
      // never blink out of the arena
      const fromCenter = len(target);
      const maxR = this.arenaRadius - WIZARD_RADIUS;
      if (fromCenter > maxR) target = scale(norm(target), maxR);

      this.particles.emit({ pos: from, count: 18, color: SCHOOL_COLORS.void, speed: [60, 260] });
      w.pos = target;
      w.knock = vec();
      this.particles.emit({ pos: target, count: 18, color: SCHOOL_COLORS.void, speed: [60, 260] });

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
      // a blink still counts as a "dash end" for shockwave purposes
      this.onDashEnd(w);
      return;
    }

    w.dashTime = DASH_DUR * (1 + w.mods.dashDist);
    w.dashDir = dir;
    w.shieldUp = false;
  }

  /**
   * Umbral Exchange: swap positions with the closest enemy roughly along the
   * dash direction. Returns false (falling through to a normal dash/blink)
   * when nobody is in range. Great for baiting ring-outs — and as a desperate
   * off-stage recovery that leaves the victim in your predicament.
   */
  private trySwap(w: Wizard, dir: Vec): boolean {
    let best: Wizard | null = null;
    let bestD = w.mods.enemySwap;
    for (const other of this.wizards) {
      if (other === w || !other.isTargetable) continue;
      const to = sub(other.pos, w.pos);
      const d = len(to);
      if (d >= bestD) continue;
      const facing = (to.x * dir.x + to.y * dir.y) / Math.max(d, 1);
      if (facing < 0.35) continue; // must be roughly where you're dashing
      bestD = d;
      best = other;
    }
    if (!best) return false;

    const a = { ...w.pos };
    const b = { ...best.pos };
    w.pos = b;
    best.pos = a;
    w.knock = vec(); // the caster arrives clean; the victim keeps their momentum
    w.shieldUp = false;

    this.tethers.push({ a, b, ttl: 0.22 });
    for (const at of [a, b]) {
      this.particles.emit({
        pos: at,
        count: 16,
        color: SCHOOL_COLORS.void,
        speed: [80, 300],
        life: [0.15, 0.4],
      });
    }
    this.shake.add(4);
    sfx.zap();
    this.onDashEnd(w);
    return true;
  }

  /** Trail hazards + pass-through zaps while a dash is in progress. */
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
          this.particles.emit({ pos: other.pos, count: 12, color: SCHOOL_COLORS.volt });
          sfx.zap();
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
    this.particles.emit({
      pos: w.pos,
      count: 14,
      kind: 'spark',
      color: pull > 0 ? SCHOOL_COLORS.void : SCHOOL_COLORS.gale,
      speed: [200, 480],
      life: [0.15, 0.35],
    });
    this.particles.emit({
      pos: w.pos,
      count: 1,
      kind: 'ring',
      color: pull > 0 ? SCHOOL_COLORS.void : SCHOOL_COLORS.gale,
      speed: [0, 0],
      life: [0.2, 0.3],
      size: [pull > 0 ? 280 : 190, pull > 0 ? 280 : 190],
    });
    this.shake.add(4);
  }

  private wardPulse(w: Wizard): void {
    for (const other of this.wizards) {
      if (other === w || !other.isTargetable) continue;
      if (dist(other.pos, w.pos) < 220) {
        other.applyKnockback(sub(other.pos, w.pos), w.mods.wardPulseKb);
      }
    }
    this.particles.emit({
      pos: w.pos,
      count: 20,
      color: SCHOOL_COLORS.gale,
      speed: [220, 420],
      life: [0.15, 0.3],
    });
  }

  private guardBreak(w: Wizard): void {
    w.shieldBroken = true;
    w.shieldUp = false;
    w.applyStun(GUARD_BREAK_STUN);
    this.particles.emit({ pos: w.pos, count: 18, kind: 'shard', color: '#8cd0ff', speed: [100, 380] });
    this.particles.emit({
      pos: w.pos,
      count: 6,
      kind: 'smoke',
      color: '#40506a',
      speed: [20, 80],
      life: [0.35, 0.7],
      size: [7, 14],
    });
    this.shake.add(6);
    sfx.guardBreak();
  }

  // ------------------------------------------------------------ combat

  /** Homing bolts curve toward the nearest enemy roughly ahead of them. */
  private steerHoming(p: Projectile, dt: number): void {
    const heading = norm(p.vel);
    let best: Wizard | null = null;
    let bestD = 700;
    for (const w of this.wizards) {
      if (w === p.owner || w === p.ignore || !w.isTargetable) continue;
      const to = sub(w.pos, p.pos);
      const d = len(to);
      if (d >= bestD) continue;
      // only track targets within ~100 degrees of the flight path
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
      emitBoltTrail(this.particles, p, dt);

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

      if (dead) {
        this.particles.emit({
          pos: p.pos,
          count: 6,
          color: p.color,
          speed: [30, 140],
          life: [0.1, 0.3],
        });
        list.splice(i, 1);
      }
    }
  }

  /** Resolve a bolt touching a wizard. Returns true if the bolt is consumed. */
  private resolveBoltHit(p: Projectile, target: Wizard): boolean {
    const owner = p.owner;

    if (target.shieldUp) {
      // perfect parry: block landed within the parry window of raising the shield
      if (target.mods.parryWindow > 0 && target.shieldHeldFor <= target.mods.parryWindow) {
        p.owner = target;
        p.vel = scale(norm(sub(owner.pos, target.pos)), BOLT_SPEED);
        p.pos = add(target.pos, scale(norm(p.vel), WIZARD_RADIUS + p.radius + 14));
        p.color = target.color;
        p.trailTint = SCHOOL_COLORS.frost;
        p.damage *= 1.25;
        p.range = 900;
        p.ignore = target;
        this.particles.emit({
          pos: target.pos,
          count: 18,
          color: '#dff4ff',
          speed: [150, 380],
          life: [0.12, 0.3],
        });
        this.shake.add(3);
        sfx.block();
        sfx.zap();
        this.ctx.match!.statsTracker.recordBlock(target.id, true);
        return false; // the bolt lives on, reflected
      }

      // normal block
      target.stamina -= SHIELD_BLOCK_COST;
      target.applyKnockback(p.vel, p.knockback * 0.15);
      if (target.mods.wardSlow > 0) owner.applySlow(target.mods.wardSlow, 2);
      if (target.mods.wardBurnDps > 0) owner.applyBurn(target.mods.wardBurnDps, 2, target);
      if (target.mods.wardZapStun > 0) {
        owner.applyStun(target.mods.wardZapStun);
        this.particles.emit({ pos: owner.pos, count: 10, color: SCHOOL_COLORS.volt });
        sfx.zap();
      }
      if (target.mods.wardAbsorb > 0) {
        target.pressure = Math.max(0, target.pressure - target.mods.wardAbsorb);
      }
      this.particles.emit({
        pos: p.pos,
        count: 12,
        color: '#9fdcff',
        speed: [80, 260],
        life: [0.12, 0.3],
      });
      sfx.block();
      this.ctx.match!.statsTracker.recordBlock(target.id, false);
      if (target.stamina <= 0) this.guardBreak(target);
      return true;
    }

    this.dealHit(owner, target, p.damage, norm(p.vel), p.knockback);

    // on-hit riders
    if (owner.mods.boltBurnDps > 0) target.applyBurn(owner.mods.boltBurnDps, 2.2, owner);
    if (owner.mods.boltSlow > 0) target.applySlow(owner.mods.boltSlow, 1.6);
    if (owner.mods.boltPull > 0) {
      target.applyKnockback(sub(owner.pos, target.pos), owner.mods.boltPull);
    }
    if (owner.mods.boltChainDamage > 0) this.chainLightning(owner, target, p.damage);
    if (owner.mods.boltExplodeRadius > 0) this.explode(owner, p.pos, p.damage, owner.mods.boltExplodeRadius);

    // sniper pierce: the beam punches straight through its first victim
    if (p.pierce > 0) {
      p.pierce--;
      p.ignore = target;
      return false;
    }

    // ricochet: the bolt leaps toward the nearest other enemy
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
        this.particles.emit({ pos: target.pos, count: 8, color: SCHOOL_COLORS.volt, speed: [60, 200] });
        sfx.zap();
        return false;
      }
    }

    return true;
  }

  /** Core hit: pressure, shatter bonus, Smash-scaled knockback, feedback. */
  private dealHit(owner: Wizard, target: Wizard, damage: number, dir: Vec, kb: number): void {
    let dmg = damage;
    if (owner.mods.shatterBonus > 0 && target.slowTime > 0) {
      dmg *= 1 + owner.mods.shatterBonus;
      this.particles.emit({ pos: target.pos, count: 14, color: SCHOOL_COLORS.frost, speed: [150, 380] });
    }
    target.pressure = Math.min(999, target.pressure + dmg);
    target.applyKnockback(dir, kb);
    target.lastAttacker = owner;
    target.lastAttackTime = this.time;
    this.ctx.match!.statsTracker.recordDamage(owner.id, target.id, dmg);

    // venting: damage dealt heals the attacker's own pressure
    if (owner.mods.pressureVent > 0) {
      owner.pressure = Math.max(0, owner.pressure - dmg * owner.mods.pressureVent);
    }

    const oomph = clamp(dmg / 10 + target.pressure / 160, 0.4, 2);
    emitImpact(this.particles, target.pos, dir, oomph, owner.color);
    this.shake.add(2.5 * oomph);
    if (target.pressure > 90) this.hitStop = Math.max(this.hitStop, 0.045);
    sfx.hit(Math.min(1.4, oomph));
  }

  /** Contact damage from Immolation Aura / Tesla Skin / Umbral Thorns. */
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
    // crude lightning: particles along the arc
    const steps = 7;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.particles.emit({
        pos: {
          x: lerp(from.pos.x, nearest.pos.x, t) + rand(-14, 14),
          y: lerp(from.pos.y, nearest.pos.y, t) + rand(-14, 14),
        },
        count: 2,
        color: SCHOOL_COLORS.volt,
        speed: [5, 40],
        life: [0.1, 0.22],
      });
    }
    sfx.zap();
  }

  private explode(owner: Wizard, at: Vec, damage: number, radius: number): void {
    for (const w of this.wizards) {
      if (w === owner || !w.isTargetable) continue;
      const d = dist(w.pos, at);
      if (d < radius + WIZARD_RADIUS) {
        this.dealHit(owner, w, damage * 0.6, norm(sub(w.pos, at)), 320);
      }
    }
    this.particles.emit({
      pos: at,
      count: 22,
      kind: 'spark',
      color: SCHOOL_COLORS.ember,
      speed: [150, 520],
      life: [0.2, 0.5],
      size: [4, 12],
    });
    this.particles.emit({
      pos: at,
      count: 8,
      kind: 'smoke',
      color: '#5c4a3a',
      speed: [20, 90],
      life: [0.4, 0.9],
      size: [8, 18],
    });
    this.particles.emit({
      pos: at,
      count: 1,
      kind: 'ring',
      color: '#ffd9a0',
      speed: [0, 0],
      life: [0.25, 0.35],
      size: [radius, radius * 1.2],
    });
    this.shake.add(6);
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
          if (Math.random() < dt * 8) {
            this.particles.emit({ pos: w.pos, count: 2, color: SCHOOL_COLORS.ember, speed: [20, 90] });
          }
        } else if (h.kind === 'frost') {
          w.applySlow(h.value, 0.35);
        } else {
          // black hole pull
          const pull = norm(sub(h.pos, w.pos));
          w.knock.x += pull.x * h.value * 2.6 * dt;
          w.knock.y += pull.y * h.value * 2.6 * dt;
        }
      }
    }
  }

  /** KO only past the blast zone — the arena rim just puts you off-stage. */
  private checkBlastZone(): void {
    for (const w of this.wizards) {
      if (w.state !== 'active') continue;
      if (len(w.pos) > this.blastRadius) {
        w.state = 'falling';
        w.fallTimer = 1;
        w.fallDir = norm(len(w.knock) > 40 ? w.knock : w.pos);
        w.shieldUp = false;
        this.shake.add(10);
        this.hitStop = Math.max(this.hitStop, 0.09);
        sfx.ringOut();
        this.particles.emit({
          pos: w.pos,
          count: 20,
          kind: 'spark',
          color: w.color,
          speed: [80, 300],
          life: [0.3, 0.8],
        });
        this.particles.emit({
          pos: w.pos,
          count: 1,
          kind: 'ring',
          color: w.color,
          speed: [0, 0],
          life: [0.3, 0.4],
          size: [90, 110],
        });
      }
    }
  }

  private finishFall(w: Wizard): void {
    const stats = this.ctx.match!.statsTracker;
    const killer =
      w.lastAttacker && this.time - w.lastAttackTime < 5 && w.lastAttacker.state !== 'out'
        ? w.lastAttacker
        : null;
    if (killer && killer.id !== w.id) stats.recordKO(killer.id, w.id);
    else stats.get(w.id).deaths++;

    w.stocks--;
    if (w.stocks > 0 && this.phase === 'fight') {
      // respawn at a safe interior point away from other wizards
      let best = vec();
      let bestScore = -1;
      for (let i = 0; i < 8; i++) {
        const cand = fromAngle(rand(0, Math.PI * 2), this.arenaRadius * 0.45);
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
      this.particles.emit({ pos: w.pos, count: 20, color: w.color, speed: [50, 240] });
    } else {
      w.state = 'out';
    }
  }

  private checkRoundEnd(): void {
    const alive = this.wizards.filter((w) => w.state !== 'out');
    if (alive.length > 1) return;
    const match = this.ctx.match!;
    this.roundWinner =
      alive.length === 1 ? match.fighters.find((f) => f.id === alive[0].id) ?? null : null;
    this.phase = 'end';
    this.phaseTimer = 2.6;
    this.banner = this.roundWinner
      ? this.roundWinner.isPlayer
        ? 'You take the round!'
        : `${this.roundWinner.name} takes the round!`
      : 'Nobody survives...';
    if (this.roundWinner?.isPlayer) sfx.victory();
    else sfx.defeat();
  }

  // ---------------------------------------------------------------- render

  render(g: CanvasRenderingContext2D): void {
    const { viewport } = this.ctx;
    g.fillStyle = '#07070f';
    g.fillRect(0, 0, viewport.width, viewport.height);

    g.save();
    viewport.applyWorld(g);

    this.renderBackdrop(g);
    this.renderArena(g);
    this.renderBlastRing(g);

    for (const h of this.hazards) renderHazard(g, h, this.time);
    this.renderSniperSights(g);
    for (const w of this.wizards) w.render(g, this.time);
    for (const p of this.projectiles) renderProjectile(g, p);
    this.renderSwapTethers(g);
    this.renderHomingLocks(g);
    this.particles.render(g);

    g.restore();

    drawHud(g, this);
    this.renderSuddenDeath(g);
  }

  /** Pulsing warning frame + label once sudden death pressure kicks in. */
  private renderSuddenDeath(g: CanvasRenderingContext2D): void {
    if (this.phase !== 'fight' || this.fightTime <= SUDDEN_DEATH_START) return;
    const { width: W, height: H } = this.ctx.viewport;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);

    const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
    grad.addColorStop(0, 'rgba(255, 40, 40, 0)');
    grad.addColorStop(1, `rgba(255, 40, 40, ${0.12 + 0.1 * pulse})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    g.textAlign = 'center';
    g.font = '800 26px system-ui, sans-serif';
    g.fillStyle = `rgba(255, 90, 70, ${0.7 + 0.3 * pulse})`;
    g.shadowColor = '#ff3020';
    g.shadowBlur = 18;
    g.fillText('SUDDEN DEATH', W / 2, 92);
    g.shadowBlur = 0;
  }

  /** Faint laser sight for sniper builds whose shot is loaded. */
  private renderSniperSights(g: CanvasRenderingContext2D): void {
    if (this.phase !== 'fight') return;
    for (const w of this.wizards) {
      if (w.mods.sniperShot <= 0 || w.state !== 'active' || w.offstage) continue;
      if (w.attackCd > 0 || w.shieldUp || w.isDashing) continue;
      const dir = norm(sub(w.aim, w.pos));
      if (len(dir) < 0.01) continue;
      const from = add(w.pos, scale(dir, WIZARD_RADIUS + 14));
      const to = add(w.pos, scale(dir, 900));
      const grad = g.createLinearGradient(from.x, from.y, to.x, to.y);
      grad.addColorStop(0, `${w.color}55`);
      grad.addColorStop(1, `${w.color}00`);
      g.strokeStyle = grad;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(from.x, from.y);
      g.lineTo(to.x, to.y);
      g.stroke();
    }
  }

  /** Void tether flash between the two ends of an Umbral Exchange. */
  private renderSwapTethers(g: CanvasRenderingContext2D): void {
    for (const t of this.tethers) {
      const fade = t.ttl / 0.22;
      g.strokeStyle = `rgba(178, 110, 255, ${0.85 * fade})`;
      g.lineWidth = 3 + 5 * fade;
      g.shadowColor = SCHOOL_COLORS.void;
      g.shadowBlur = 16;
      g.beginPath();
      g.moveTo(t.a.x, t.a.y);
      g.lineTo(t.b.x, t.b.y);
      g.stroke();
      g.shadowBlur = 0;
      // cross-flash at both endpoints
      g.strokeStyle = `rgba(240, 220, 255, ${fade})`;
      g.lineWidth = 2.5;
      for (const p of [t.a, t.b]) {
        const s = 14 + 22 * (1 - fade);
        g.beginPath();
        g.moveTo(p.x - s, p.y);
        g.lineTo(p.x + s, p.y);
        g.moveTo(p.x, p.y - s);
        g.lineTo(p.x, p.y + s);
        g.stroke();
      }
    }
  }

  /** Soft lock-on brackets around whatever a homing bolt is hunting. */
  private renderHomingLocks(g: CanvasRenderingContext2D): void {
    const locked = new Set<Wizard>();
    for (const p of this.projectiles) {
      if (p.homingTarget && !locked.has(p.homingTarget)) locked.add(p.homingTarget);
    }
    for (const w of locked) {
      const r = WIZARD_RADIUS + 18;
      const spin = this.time * 2.4;
      g.strokeStyle = 'rgba(255, 233, 77, 0.75)';
      g.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) {
        const a = spin + (i * Math.PI) / 2;
        g.beginPath();
        g.arc(w.pos.x, w.pos.y, r, a, a + 0.5);
        g.stroke();
      }
    }
  }

  /**
   * The KO line, drawn as a containment ward: a slowly-rotating dashed sigil
   * circle that tightens with the arena. Calm arcane violet at rest, red-hot
   * warning when someone is fighting for their life beyond the rim.
   */
  private renderBlastRing(g: CanvasRenderingContext2D): void {
    const r = this.blastRadius;
    const anyOffstage = this.wizards.some((w) => w.offstage);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 9);

    g.save();
    g.rotate(this.time * 0.02);

    // outer dashed ward circle
    g.strokeStyle = anyOffstage
      ? `rgba(255, 70, 50, ${0.35 + 0.45 * pulse})`
      : 'rgba(178, 130, 255, 0.16)';
    g.lineWidth = anyOffstage ? 5 : 3;
    g.setLineDash([26, 20]);
    if (anyOffstage) {
      g.shadowColor = '#ff4632';
      g.shadowBlur = 18;
    }
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.shadowBlur = 0;

    // ward glyphs: short radial notches every 30 degrees, counter-rotating
    g.rotate(-this.time * 0.05);
    g.strokeStyle = anyOffstage
      ? `rgba(255, 110, 80, ${0.25 + 0.3 * pulse})`
      : 'rgba(178, 130, 255, 0.12)';
    g.lineWidth = 2.5;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * (r - 14), Math.sin(a) * (r - 14));
      g.lineTo(Math.cos(a) * (r + 14), Math.sin(a) * (r + 14));
      g.stroke();
    }
    g.restore();
  }

  private renderBackdrop(g: CanvasRenderingContext2D): void {
    const nebula = getAsset('nebula');
    if (nebula) {
      g.globalAlpha = 0.55;
      g.drawImage(nebula, -1960, -1960, 3920, 3920);
      g.globalAlpha = 1;
    }

    // faint ley-line arcs sweeping around the arena
    g.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const lr = 760 + i * 260;
      const sweep = this.time * (0.03 + i * 0.012) * (i % 2 === 0 ? 1 : -1);
      g.strokeStyle = `rgba(140, 120, 255, ${0.05 + 0.02 * i})`;
      g.beginPath();
      g.arc(0, 0, lr, sweep, sweep + Math.PI * 1.25);
      g.stroke();
    }

    // drifting arcane motes (slow orbit + twinkle), softly glowing
    for (const m of this.motes) {
      const a = this.time * m.drift;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const x = m.x * cos - m.y * sin;
      const y = m.x * sin + m.y * cos;
      g.globalAlpha = 0.18 + 0.3 * Math.abs(Math.sin(this.time * 0.6 + m.tw));
      g.fillStyle = m.color;
      g.beginPath();
      g.arc(x, y, m.size, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  private renderArena(g: CanvasRenderingContext2D): void {
    const r = this.arenaRadius;

    // falling shadow / depth
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath();
    g.arc(14, 22, r, 0, Math.PI * 2);
    g.fill();

    // platform: generated runic stone disc, clipped to the shrinking radius
    const disc = getAsset('arena-disc');
    if (disc) {
      g.save();
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.clip();
      // texture stays at full size so shrinking eats it from the outside in
      g.drawImage(disc, -ARENA_RADIUS, -ARENA_RADIUS, ARENA_RADIUS * 2, ARENA_RADIUS * 2);
      g.restore();
    } else {
      // vector fallback: obsidian glass with a cool inner sheen
      const grad = g.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
      grad.addColorStop(0, '#1c1a30');
      grad.addColorStop(0.7, '#151327');
      grad.addColorStop(1, '#0e0d1e');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
    }

    // etched sigil rings: a breathing inner circle + hex lattice ring
    const breathe = 1 + Math.sin(this.time * 1.4) * 0.006;
    g.strokeStyle = 'rgba(150, 120, 255, 0.16)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, r * 0.42 * breathe, 0, Math.PI * 2);
    g.stroke();

    // hexagonal rune band, slowly rotating
    g.save();
    g.rotate(this.time * 0.03);
    g.strokeStyle = 'rgba(120, 200, 220, 0.12)';
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * r * 0.72;
      const py = Math.sin(a) * r * 0.72;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
    // rune dots at the hex vertices
    g.fillStyle = 'rgba(150, 120, 255, 0.28)';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath();
      g.arc(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // rim: cool arcane at rest, collapsing-ward ember-magenta while shrinking
    const shrinking =
      this.phase === 'fight' &&
      this.fightTime > ARENA_SHRINK_START &&
      this.arenaRadius > ARENA_MIN_RADIUS + 1;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (shrinking ? 10 : 2));
    g.strokeStyle = shrinking
      ? `rgba(255, 90, 150, ${0.55 + 0.45 * pulse})`
      : 'rgba(158, 140, 255, 0.8)';
    g.lineWidth = shrinking ? 7 : 5;
    g.shadowColor = shrinking ? '#ff5a96' : '#8f7bff';
    g.shadowBlur = 22;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
    g.shadowBlur = 0;

    // collapsing ward sheds sparks from the rim
    if (shrinking && Math.random() < 0.5) {
      const a = rand(0, Math.PI * 2);
      this.particles.emit({
        pos: { x: Math.cos(a) * r, y: Math.sin(a) * r },
        count: 1,
        color: '#ff7ab0',
        speed: [20, 90],
        life: [0.2, 0.5],
        size: [1.5, 3.5],
      });
    }
  }
}
