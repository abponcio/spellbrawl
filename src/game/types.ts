export type School = 'ember' | 'frost' | 'volt' | 'gale' | 'void' | 'arcane';
export type Slot = 'attack' | 'shield' | 'movement';
export type Rarity = 'common' | 'rare' | 'epic';

export const RARITY_MULT: Record<Rarity, number> = {
  common: 1,
  rare: 1.5,
  epic: 2.2,
};

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#b8c2cc',
  rare: '#5aa9ff',
  epic: '#c56cf0',
};

/**
 * Accumulated numeric modifiers from all owned boons.
 * Values are additive across boons; rarity scales each boon's contribution.
 */
export interface Mods {
  // attack
  attackDamage: number; // +fraction
  attackKnockback: number; // +fraction
  attackCooldown: number; // -fraction (positive value = faster)
  boltBurnDps: number; // pressure %/s for 2.2s
  boltSlow: number; // slow fraction on hit
  boltChainDamage: number; // % damage zapped to nearest other enemy
  boltPull: number; // pull impulse toward shooter
  boltExplodeRadius: number; // duo: combustion
  boltCount: number; // extra projectiles in spread
  shatterBonus: number; // duo: bonus % damage vs slowed targets
  boltRicochet: number; // bounces toward another enemy after a hit
  boltSize: number; // +fraction projectile radius
  pressureVent: number; // fraction of damage dealt healed off your pressure
  boltHoming: number; // turn rate (rad/s) bolts curve toward the nearest enemy
  sniperShot: number; // >0 = long-range piercing shot mode; value scales the payoff

  // shield
  wardSlow: number; // slow attacker on block
  wardZapStun: number; // stun seconds applied to attacker on block
  wardPulseKb: number; // pushback impulse when raising shield
  wardAbsorb: number; // pressure % healed per block
  shieldEfficiency: number; // -drain fraction
  wardBurnDps: number; // burn applied to attackers on block
  parryWindow: number; // seconds after raising shield where blocks reflect
  thorns: number; // pressure %/s dealt to enemies in contact
  kbResist: number; // fraction of incoming knockback ignored (capped)

  // movement
  moveSpeed: number; // +fraction
  dashCooldown: number; // -fraction
  dashTrailBurnDps: number;
  dashFrostSlow: number; // frost patch slow fraction
  dashZapDamage: number; // damage to enemies passed through
  dashShockwaveKb: number; // impulse at dash end
  dashVortexPull: number; // duo: dash end drags enemies toward you
  dashDist: number; // +fraction dash length / blink distance
  blink: number; // >0 = dash is a teleport
  blackHolePull: number; // duo: event horizon pull strength
  recovery: number; // off-stage control boost and drift reduction
  enemySwap: number; // >0 = dash swaps positions with a nearby enemy
}

export const emptyMods = (): Mods => ({
  attackDamage: 0,
  attackKnockback: 0,
  attackCooldown: 0,
  boltBurnDps: 0,
  boltSlow: 0,
  boltChainDamage: 0,
  boltPull: 0,
  boltExplodeRadius: 0,
  boltCount: 0,
  shatterBonus: 0,
  boltRicochet: 0,
  boltSize: 0,
  pressureVent: 0,
  boltHoming: 0,
  sniperShot: 0,
  wardSlow: 0,
  wardZapStun: 0,
  wardPulseKb: 0,
  wardAbsorb: 0,
  shieldEfficiency: 0,
  wardBurnDps: 0,
  parryWindow: 0,
  thorns: 0,
  kbResist: 0,
  moveSpeed: 0,
  dashCooldown: 0,
  dashTrailBurnDps: 0,
  dashFrostSlow: 0,
  dashZapDamage: 0,
  dashShockwaveKb: 0,
  dashVortexPull: 0,
  dashDist: 0,
  blink: 0,
  blackHolePull: 0,
  recovery: 0,
  enemySwap: 0,
});

export interface BoonDef {
  id: string;
  name: string;
  school: School;
  slot: Slot;
  /** Template description; {v} is replaced with the rarity-scaled main value. */
  describe: (rarityMult: number) => string;
  /** Apply rarity-scaled effects onto a Mods object. */
  apply: (mods: Mods, rarityMult: number) => void;
  /** Both boon ids required before this can be offered (duo boons). */
  requires?: [string, string];
  /** Procedurally generated one-of-a-kind wildcard boon. */
  wild?: boolean;
}

export interface OwnedBoon {
  def: BoonDef;
  rarity: Rarity;
}
