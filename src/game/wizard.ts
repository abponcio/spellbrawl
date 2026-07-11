import { getAsset } from '../engine/assets';
import { clamp, len, norm, scale, vec, type Vec } from '../engine/vec';
import {
  ARENA_RADIUS,
  BASE_MOVE_SPEED,
  DASH_SPEED,
  KNOCK_DECAY,
  OFFSTAGE_CONTROL,
  OFFSTAGE_DRIFT,
  PRESSURE_KB_DIVISOR,
  SCHOOL_COLORS,
  SHIELD_DRAIN,
  SHIELD_REGEN,
  SHIELD_REARM,
  WIZARD_RADIUS,
} from './constants';
import type { Mods, OwnedBoon } from './types';
import { computeMods } from './boons';

export type WizardState = 'active' | 'falling' | 'out';

/**
 * A wizard combatant. Controllers (player input / AI) write intent fields;
 * the arena executes skills and resolves combat.
 */
export class Wizard {
  pos: Vec = vec();
  vel: Vec = vec(); // self-propelled movement
  knock: Vec = vec(); // decaying knockback velocity
  aim: Vec = vec(1, 0); // world-space point the wizard aims at

  pressure = 0; // Smash-style damage %
  stocks = 2;
  state: WizardState = 'active';
  fallTimer = 0;
  fallDir: Vec = vec();
  invuln = 0;

  // intents, written by controller each frame
  moveDir: Vec = vec();
  wantAttack = false;
  wantShield = false;
  wantDash = false;

  // skill state
  attackCd = 0;
  dashCd = 0;
  dashTime = 0;
  dashDir: Vec = vec(1, 0);
  dashHitIds = new Set<number>(); // enemies zapped during current dash
  shieldUp = false;
  stamina = 1;
  shieldBroken = false;
  /** Seconds the shield has been held; used for parry-window checks. */
  shieldHeldFor = 0;

  /** Current arena platform radius, written by the arena each frame. */
  groundRadius = ARENA_RADIUS;
  /** School color of the wizard's shield boons (for the ward bubble tint). */
  wardColor = 'rgba(140, 220, 255, 0.9)';

  // status effects
  stun = 0;
  slowFrac = 0;
  slowTime = 0;
  burnDps = 0;
  burnTime = 0;
  burnSource: Wizard | null = null;

  /** Last wizard that dealt pressure damage; used for KO credit. */
  lastAttacker: Wizard | null = null;
  lastAttackTime = 0;

  mods: Mods;
  /** Painted sprite asset name, keyed by fighter slot. */
  private readonly spriteName: string;

  constructor(
    readonly id: number,
    readonly name: string,
    readonly color: string,
    readonly isPlayer: boolean,
    public boons: OwnedBoon[],
  ) {
    this.mods = computeMods(boons);
    this.refreshMods();
    this.spriteName = ['wizard-cyan', 'wizard-red', 'wizard-orange', 'wizard-purple'][id] ?? 'wizard-cyan';
  }

  refreshMods(): void {
    this.mods = computeMods(this.boons);
    const ward = this.boons.find((b) => b.def.slot === 'shield');
    this.wardColor = ward ? SCHOOL_COLORS[ward.def.school] : 'rgba(140, 220, 255, 0.9)';
  }

  /** Airborne past the platform rim — weak control, no attack/shield. */
  get offstage(): boolean {
    return this.state === 'active' && len(this.pos) > this.groundRadius;
  }

  get moveSpeed(): number {
    let s = BASE_MOVE_SPEED * (1 + this.mods.moveSpeed);
    if (this.shieldUp) s *= 0.45;
    if (this.slowTime > 0) s *= 1 - this.slowFrac;
    if (this.offstage) s *= Math.min(0.95, OFFSTAGE_CONTROL * (1 + this.mods.recovery));
    return s;
  }

  get isTargetable(): boolean {
    return this.state === 'active' && this.invuln <= 0;
  }

  get isDashing(): boolean {
    return this.dashTime > 0;
  }

  applySlow(frac: number, dur: number): void {
    if (frac <= 0) return;
    this.slowFrac = Math.max(this.slowFrac, frac);
    this.slowTime = Math.max(this.slowTime, dur);
  }

  applyBurn(dps: number, dur: number, source: Wizard): void {
    if (dps <= 0) return;
    this.burnDps = Math.max(this.burnDps, dps);
    this.burnTime = Math.max(this.burnTime, dur);
    this.burnSource = source;
  }

  applyStun(dur: number): void {
    if (dur <= 0) return;
    this.stun = Math.max(this.stun, dur);
    this.shieldUp = false;
  }

  /** Physics + timers. Combat and skills are handled by the arena. */
  update(dt: number): void {
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.stun = Math.max(0, this.stun - dt);
    if (this.slowTime > 0) {
      this.slowTime -= dt;
      if (this.slowTime <= 0) this.slowFrac = 0;
    }
    if (this.burnTime > 0) {
      this.burnTime -= dt;
      this.pressure += this.burnDps * dt;
      if (this.burnTime <= 0) this.burnDps = 0;
    }

    // stamina drain/regen
    if (this.shieldUp) {
      this.shieldHeldFor += dt;
      this.stamina -= SHIELD_DRAIN * (1 - this.mods.shieldEfficiency) * dt;
      if (this.stamina <= 0) this.stamina = 0;
    } else {
      this.shieldHeldFor = 0;
      this.stamina = Math.min(1, this.stamina + SHIELD_REGEN * dt);
      if (this.shieldBroken && this.stamina >= SHIELD_REARM) this.shieldBroken = false;
    }

    // movement
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.vel.x = this.dashDir.x * DASH_SPEED;
      this.vel.y = this.dashDir.y * DASH_SPEED;
    } else if (this.stun <= 0) {
      const dir = len(this.moveDir) > 0.01 ? norm(this.moveDir) : vec();
      const target = scale(dir, this.moveSpeed);
      const blend = clamp(dt * 12, 0, 1);
      this.vel.x += (target.x - this.vel.x) * blend;
      this.vel.y += (target.y - this.vel.y) * blend;
    } else {
      const blend = clamp(dt * 6, 0, 1);
      this.vel.x -= this.vel.x * blend;
      this.vel.y -= this.vel.y * blend;
    }

    // knockback decay
    const decay = Math.exp(-KNOCK_DECAY * dt);
    this.knock.x *= decay;
    this.knock.y *= decay;

    // off-stage: no footing — drift outward (recovery boons dampen it)
    if (this.offstage) {
      const out = norm(this.pos);
      const drift = OFFSTAGE_DRIFT * Math.max(0.15, 1 - this.mods.recovery);
      this.knock.x += out.x * drift * dt;
      this.knock.y += out.y * drift * dt;
    }

    this.pos.x += (this.vel.x + this.knock.x) * dt;
    this.pos.y += (this.vel.y + this.knock.y) * dt;
  }

  /** Impulse scaled by current pressure (the Smash formula). */
  applyKnockback(dir: Vec, base: number): void {
    const resist = 1 - clamp(this.mods.kbResist, 0, 0.6);
    const mult = (1 + this.pressure / PRESSURE_KB_DIVISOR) * resist;
    const d = norm(dir);
    this.knock.x += d.x * base * mult;
    this.knock.y += d.y * base * mult;
  }

  render(ctx: CanvasRenderingContext2D, time: number): void {
    if (this.state === 'out') return;

    const { x, y } = this.pos;
    ctx.save();
    ctx.translate(x, y);

    if (this.state === 'falling') {
      const t = this.fallTimer; // 1 -> 0
      ctx.globalAlpha = t;
      ctx.scale(t, t);
      ctx.rotate((1 - t) * 9);
    }

    const airborne = this.offstage;
    if (airborne) {
      // fallen below platform level: smaller, dimmer, spinning slightly
      ctx.scale(0.8, 0.8);
      ctx.globalAlpha *= 0.75;
      ctx.rotate(Math.sin(time * 6) * 0.18);
    }

    if (this.invuln > 0 && Math.sin(time * 30) > 0) ctx.globalAlpha *= 0.35;

    // heat glow at high pressure
    const danger = clamp(this.pressure / 150, 0, 1);
    if (danger > 0.2) {
      ctx.shadowColor = `rgba(255, ${Math.round(120 - danger * 100)}, 40, 1)`;
      ctx.shadowBlur = 14 + danger * 20;
    } else {
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 12;
    }

    const a = Math.atan2(this.aim.y - y, this.aim.x - x);
    const sprite = getAsset(this.spriteName);

    if (sprite) {
      // painted sprite: rotate toward aim (art points "up"), with procedural
      // idle bob and squash/stretch on dashes and heavy knockback
      ctx.save();

      if (this.isDashing) {
        const da = Math.atan2(this.dashDir.y, this.dashDir.x);
        ctx.rotate(da);
        ctx.scale(1.22, 0.82);
        ctx.rotate(-da);
      } else {
        const knockSpeed = len(this.knock);
        if (knockSpeed > 220) {
          const ka = Math.atan2(this.knock.y, this.knock.x);
          const sq = Math.min(0.2, (knockSpeed - 220) / 1800);
          ctx.rotate(ka);
          ctx.scale(1 + sq, 1 - sq);
          ctx.rotate(-ka);
        }
        const bob = 1 + Math.sin(time * 3.1 + this.id * 1.7) * 0.025;
        ctx.scale(bob, bob);
      }

      ctx.rotate(a + Math.PI / 2);
      const size = WIZARD_RADIUS * 2.9;
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
      ctx.shadowBlur = 0;

      // frost tint while slowed
      if (this.slowTime > 0) {
        ctx.fillStyle = 'rgba(126, 212, 255, 0.22)';
        ctx.beginPath();
        ctx.arc(0, 0, WIZARD_RADIUS * 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // vector fallback
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, 0, WIZARD_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(10, 10, 25, 0.55)';
      ctx.beginPath();
      ctx.arc(0, 0, WIZARD_RADIUS * 0.62, 0, Math.PI * 2);
      ctx.fill();

      const ex = Math.cos(a) * 7;
      const ey = Math.sin(a) * 7;
      ctx.fillStyle = this.slowTime > 0 ? '#9fe8ff' : '#ffffff';
      for (const side of [-1, 1]) {
        const px = ex + Math.cos(a + Math.PI / 2) * 5.5 * side;
        const py = ey + Math.sin(a + Math.PI / 2) * 5.5 * side;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * WIZARD_RADIUS * 0.8, Math.sin(a) * WIZARD_RADIUS * 0.8);
      ctx.lineTo(Math.cos(a) * (WIZARD_RADIUS + 14), Math.sin(a) * (WIZARD_RADIUS + 14));
      ctx.stroke();
    }

    // shield bubble, tinted by the ward's school; archetype changes the shader
    if (this.shieldUp) {
      const prevAlpha = ctx.globalAlpha;
      const bubbleR = WIZARD_RADIUS + 12 + Math.sin(time * 8) * 1.5;
      ctx.strokeStyle = this.wardColor;
      ctx.lineWidth = 3;
      ctx.shadowColor = this.wardColor;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, bubbleR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = this.wardColor;
      ctx.globalAlpha = prevAlpha * 0.15;
      ctx.fill();
      ctx.globalAlpha = prevAlpha;

      // parry archetype: gold timing rim while the perfect-block window is live
      if (this.mods.parryWindow > 0 && this.shieldHeldFor <= this.mods.parryWindow) {
        const left = 1 - this.shieldHeldFor / this.mods.parryWindow;
        ctx.strokeStyle = `rgba(255, 214, 80, ${0.5 + 0.5 * left})`;
        ctx.lineWidth = 4;
        ctx.shadowColor = '#ffd650';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(0, 0, bubbleR + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // reduction archetype: hardened hex lattice overlay
      if (this.mods.kbResist > 0 || this.mods.wardAbsorb > 0) {
        ctx.strokeStyle = 'rgba(190, 205, 235, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
          const ha = (i / 6) * Math.PI * 2 + time * 0.8;
          const px = Math.cos(ha) * bubbleR * 0.92;
          const py = Math.sin(ha) * bubbleR * 0.92;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    // off-stage warning marker
    if (airborne) {
      const pulse = 0.55 + 0.45 * Math.sin(time * 12);
      ctx.strokeStyle = `rgba(255, 80, 60, ${pulse})`;
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, WIZARD_RADIUS + 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // stun stars
    if (this.stun > 0) {
      ctx.fillStyle = '#ffe94d';
      for (let i = 0; i < 3; i++) {
        const sa = time * 5 + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(Math.cos(sa) * 24, Math.sin(sa) * 10 - WIZARD_RADIUS - 12, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
