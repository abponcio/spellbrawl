import type { BoonDef, Mods, Rarity } from './types';
import { RARITY_MULT, emptyMods } from './types';

/**
 * Skill archetypes: each of the three slots has a base behavior plus
 * archetype modes granted by boons. Archetypes stack (you keep everything
 * you draft); these helpers resolve which modes a Mods set carries so the
 * HUD, draft cards, and VFX can present them consistently.
 */

export type AttackArchetype =
  | 'bolt'
  | 'multishot'
  | 'ricochet'
  | 'aoe'
  | 'homing'
  | 'sniper';

export type ShieldArchetype = 'block' | 'reduction' | 'parry' | 'reflect';

export type MoveArchetype = 'dash' | 'blink' | 'speed' | 'swap';

export const ARCHETYPE_LABELS: Record<string, string> = {
  bolt: 'BOLT',
  multishot: 'MULTI-SHOT',
  ricochet: 'RICOCHET',
  aoe: 'AOE',
  homing: 'HOMING',
  sniper: 'SNIPER',
  block: 'BLOCK',
  reduction: 'BULWARK',
  parry: 'PARRY',
  reflect: 'REFLECT',
  dash: 'DASH',
  blink: 'BLINK',
  speed: 'SWIFT',
  swap: 'SWAP',
};

/** All attack modes present, dominant first (baseline excluded unless alone). */
export function attackArchetypes(mods: Mods): AttackArchetype[] {
  const out: AttackArchetype[] = [];
  if (mods.sniperShot > 0) out.push('sniper');
  if (mods.boltHoming > 0) out.push('homing');
  if (mods.boltExplodeRadius > 0) out.push('aoe');
  if (mods.boltRicochet > 0) out.push('ricochet');
  if (mods.boltCount > 0) out.push('multishot');
  return out.length > 0 ? out : ['bolt'];
}

export function shieldArchetypes(mods: Mods): ShieldArchetype[] {
  const out: ShieldArchetype[] = [];
  // parry implies reflect in this game (perfect blocks send the bolt back)
  if (mods.parryWindow > 0) out.push('parry', 'reflect');
  if (mods.kbResist > 0 || mods.wardAbsorb > 0) out.push('reduction');
  return out.length > 0 ? out : ['block'];
}

export function moveArchetypes(mods: Mods): MoveArchetype[] {
  const out: MoveArchetype[] = [];
  if (mods.enemySwap > 0) out.push('swap');
  if (mods.blink > 0) out.push('blink');
  if (mods.moveSpeed > 0.05) out.push('speed');
  return out.length > 0 ? out : ['dash'];
}

/** Short label for a boon card / chip, judged by what the boon itself grants. */
export function archetypeLabelFor(
  slot: 'attack' | 'shield' | 'movement',
  mods: Mods,
): string {
  const modes =
    slot === 'attack'
      ? attackArchetypes(mods)
      : slot === 'shield'
        ? shieldArchetypes(mods)
        : moveArchetypes(mods);
  return ARCHETYPE_LABELS[modes[0]];
}

/** Archetype label for a single boon, judged by the mods it alone grants. */
export function boonArchetypeLabel(def: BoonDef, rarity: Rarity): string {
  const mods = emptyMods();
  def.apply(mods, RARITY_MULT[rarity]);
  return archetypeLabelFor(def.slot, mods);
}
