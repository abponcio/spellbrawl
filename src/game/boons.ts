import { pickWeighted } from '../engine/rng';
import { makeWildcard } from './procgen';
import type { BoonDef, Mods, OwnedBoon, Rarity, Slot } from './types';
import { RARITY_MULT, emptyMods } from './types';

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * The full boon catalog. Every boon modifies one of the three skill slots.
 * Effects are deterministic; only the draft offering is random.
 */
export const BOONS: BoonDef[] = [
  // ---- Ember (burn) ----
  {
    id: 'ember-bolt',
    name: 'Cinder Bolt',
    school: 'ember',
    slot: 'attack',
    describe: (m) => `Your bolts ignite targets, burning for ${(4 * m).toFixed(1)}% pressure/s.`,
    apply: (mods, m) => {
      mods.boltBurnDps += 4 * m;
    },
  },
  {
    id: 'ember-dash',
    name: 'Blazing Stride',
    school: 'ember',
    slot: 'movement',
    describe: (m) => `Your dash leaves a burning trail dealing ${(6 * m).toFixed(1)}% pressure/s.`,
    apply: (mods, m) => {
      mods.dashTrailBurnDps += 6 * m;
    },
  },
  {
    id: 'ember-power',
    name: 'Pyric Fury',
    school: 'ember',
    slot: 'attack',
    describe: (m) => `Your attacks deal ${pct(0.2 * m)} more pressure.`,
    apply: (mods, m) => {
      mods.attackDamage += 0.2 * m;
    },
  },
  {
    id: 'ember-magma',
    name: 'Magma Bolt',
    school: 'ember',
    slot: 'attack',
    describe: (m) => `Your bolts are ${pct(0.3 * m)} larger and deal ${pct(0.08 * m)} more pressure.`,
    apply: (mods, m) => {
      mods.boltSize += 0.3 * m;
      mods.attackDamage += 0.08 * m;
    },
  },
  {
    id: 'ember-feast',
    name: 'Ashen Feast',
    school: 'ember',
    slot: 'attack',
    describe: (m) => `Damage you deal vents ${pct(0.15 * m)} of it off your own pressure.`,
    apply: (mods, m) => {
      mods.pressureVent += 0.15 * m;
    },
  },
  {
    id: 'ember-aura',
    name: 'Immolation Aura',
    school: 'ember',
    slot: 'shield',
    describe: (m) => `Enemies touching you burn for ${(5 * m).toFixed(1)}% pressure/s.`,
    apply: (mods, m) => {
      mods.thorns += 5 * m;
    },
  },
  {
    id: 'ember-pyreward',
    name: 'Pyre Ward',
    school: 'ember',
    slot: 'shield',
    describe: (m) => `Attackers whose bolts you block are set ablaze for ${(5 * m).toFixed(1)}%/s.`,
    apply: (mods, m) => {
      mods.wardBurnDps += 5 * m;
    },
  },
  {
    id: 'ember-eruption',
    name: 'Eruption Step',
    school: 'ember',
    slot: 'movement',
    describe: (m) =>
      `Your dash ends in a burning burst — nearby enemies are shoved (${Math.round(150 * m)} force) and singed.`,
    apply: (mods, m) => {
      mods.dashShockwaveKb += 150 * m;
      mods.dashTrailBurnDps += 2.5 * m;
    },
  },

  // ---- Frost (slow) ----
  {
    id: 'frost-bolt',
    name: 'Rime Bolt',
    school: 'frost',
    slot: 'attack',
    describe: (m) => `Your bolts chill targets, slowing them ${pct(Math.min(0.3 * m, 0.7))} for 1.6s.`,
    apply: (mods, m) => {
      mods.boltSlow = Math.min(mods.boltSlow + 0.3 * m, 0.7);
    },
  },
  {
    id: 'frost-ward',
    name: 'Winter Ward',
    school: 'frost',
    slot: 'shield',
    describe: (m) => `Blocking a hit slows the attacker ${pct(Math.min(0.35 * m, 0.75))} for 2s.`,
    apply: (mods, m) => {
      mods.wardSlow = Math.min(mods.wardSlow + 0.35 * m, 0.75);
    },
  },
  {
    id: 'frost-dash',
    name: 'Glacial Wake',
    school: 'frost',
    slot: 'movement',
    describe: (m) => `Your dash leaves frost that slows enemies ${pct(Math.min(0.3 * m, 0.7))}.`,
    apply: (mods, m) => {
      mods.dashFrostSlow = Math.min(mods.dashFrostSlow + 0.3 * m, 0.7);
    },
  },
  {
    id: 'frost-armor',
    name: 'Permafrost Armor',
    school: 'frost',
    slot: 'shield',
    describe: (m) => `You take ${pct(Math.min(0.14 * m, 0.5))} less knockback from all hits.`,
    apply: (mods, m) => {
      mods.kbResist = Math.min(mods.kbResist + 0.14 * m, 0.5);
    },
  },
  {
    id: 'frost-mirror',
    name: 'Mirror of Ice',
    school: 'frost',
    slot: 'shield',
    describe: (m) =>
      `Blocks within ${(0.22 * m).toFixed(2)}s of raising your shield REFLECT the bolt back, cost no stamina.`,
    apply: (mods, m) => {
      mods.parryWindow += 0.22 * m;
    },
  },
  {
    id: 'frost-edge',
    name: 'Frostbite Edge',
    school: 'frost',
    slot: 'attack',
    describe: (m) =>
      `Bolts deal ${pct(0.1 * m)} more pressure and chill ${pct(Math.min(0.15 * m, 0.5))}.`,
    apply: (mods, m) => {
      mods.attackDamage += 0.1 * m;
      mods.boltSlow = Math.min(mods.boltSlow + 0.15 * m, 0.7);
    },
  },
  {
    id: 'frost-anchor',
    name: 'Cryo Anchor',
    school: 'frost',
    slot: 'movement',
    describe: (m) =>
      `Icy grip on the world: ${pct(Math.min(0.3 * m, 0.8))} better control and less drift while off-stage.`,
    apply: (mods, m) => {
      mods.recovery = Math.min(mods.recovery + 0.3 * m, 0.8);
    },
  },

  // ---- Volt (chain/stun) ----
  {
    id: 'volt-bolt',
    name: 'Arc Bolt',
    school: 'volt',
    slot: 'attack',
    describe: (m) => `Hits chain lightning to the nearest other enemy for ${pct(0.5 * m)} damage.`,
    apply: (mods, m) => {
      mods.boltChainDamage += 0.5 * m;
    },
  },
  {
    id: 'volt-ward',
    name: 'Storm Ward',
    school: 'volt',
    slot: 'shield',
    describe: (m) => `Blocking a projectile stuns its caster for ${(0.5 * m).toFixed(1)}s.`,
    apply: (mods, m) => {
      mods.wardZapStun += 0.5 * m;
    },
  },
  {
    id: 'volt-dash',
    name: 'Lightning Step',
    school: 'volt',
    slot: 'movement',
    describe: (m) =>
      `Dashing through enemies zaps them for ${(8 * m).toFixed(1)}% pressure.`,
    apply: (mods, m) => {
      mods.dashZapDamage += 8 * m;
    },
  },
  {
    id: 'volt-haste',
    name: 'Static Charge',
    school: 'volt',
    slot: 'attack',
    describe: (m) => `Your attack recharges ${pct(Math.min(0.22 * m, 0.6))} faster.`,
    apply: (mods, m) => {
      mods.attackCooldown = Math.min(mods.attackCooldown + 0.22 * m, 0.6);
    },
  },
  {
    id: 'volt-ricochet',
    name: 'Ricochet Arc',
    school: 'volt',
    slot: 'attack',
    describe: (m) =>
      `After a hit, your bolt leaps to ${m >= 2 ? 'the next two enemies' : 'another enemy'}.`,
    apply: (mods, m) => {
      mods.boltRicochet += m >= 2 ? 2 : 1;
    },
  },
  {
    id: 'volt-overcharge',
    name: 'Overcharge',
    school: 'volt',
    slot: 'attack',
    describe: (m) =>
      `Bolts deal ${pct(0.14 * m)} more pressure and recharge ${pct(Math.min(0.08 * m, 0.3))} faster.`,
    apply: (mods, m) => {
      mods.attackDamage += 0.14 * m;
      mods.attackCooldown = Math.min(mods.attackCooldown + 0.08 * m, 0.6);
    },
  },
  {
    id: 'volt-rush',
    name: 'Galvanic Rush',
    school: 'volt',
    slot: 'movement',
    describe: (m) =>
      `Dash recharges ${pct(Math.min(0.15 * m, 0.5))} faster and zaps enemies you pass for ${(4 * m).toFixed(1)}%.`,
    apply: (mods, m) => {
      mods.dashCooldown = Math.min(mods.dashCooldown + 0.15 * m, 0.6);
      mods.dashZapDamage += 4 * m;
    },
  },
  {
    id: 'volt-homing',
    name: 'Seeker Arc',
    school: 'volt',
    slot: 'attack',
    describe: (m) =>
      `Your bolts magnetize, curving toward the nearest enemy (${(1.6 * m).toFixed(1)} rad/s turn).`,
    apply: (mods, m) => {
      mods.boltHoming = Math.min(mods.boltHoming + 1.6 * m, 6);
    },
  },
  {
    id: 'volt-tesla',
    name: 'Tesla Skin',
    school: 'volt',
    slot: 'shield',
    describe: (m) => `Enemies in contact with you take ${(4 * m).toFixed(1)}% pressure/s of static.`,
    apply: (mods, m) => {
      mods.thorns += 4 * m;
    },
  },
  {
    id: 'volt-capacitor',
    name: 'Capacitor',
    school: 'volt',
    slot: 'shield',
    describe: (m) =>
      `Shield drains ${pct(Math.min(0.15 * m, 0.5))} slower; blocked casters are stunned ${(0.2 * m).toFixed(1)}s.`,
    apply: (mods, m) => {
      mods.shieldEfficiency = Math.min(mods.shieldEfficiency + 0.15 * m, 0.65);
      mods.wardZapStun += 0.2 * m;
    },
  },

  // ---- Gale (knockback) ----
  {
    id: 'gale-bolt',
    name: 'Tempest Bolt',
    school: 'gale',
    slot: 'attack',
    describe: (m) => `Your bolts knock enemies back ${pct(0.4 * m)} harder.`,
    apply: (mods, m) => {
      mods.attackKnockback += 0.4 * m;
    },
  },
  {
    id: 'gale-ward',
    name: 'Repulsion Ward',
    school: 'gale',
    slot: 'shield',
    describe: (m) => `Raising your shield emits a gust that pushes nearby enemies away (${Math.round(260 * m)} force).`,
    apply: (mods, m) => {
      mods.wardPulseKb += 260 * m;
    },
  },
  {
    id: 'gale-dash',
    name: 'Cyclone Finish',
    school: 'gale',
    slot: 'movement',
    describe: (m) =>
      `Your dash ends in a shockwave that shoves nearby enemies (${Math.round(300 * m)} force).`,
    apply: (mods, m) => {
      mods.dashShockwaveKb += 300 * m;
    },
  },
  {
    id: 'gale-swift',
    name: 'Tailwind',
    school: 'gale',
    slot: 'movement',
    describe: (m) => `You move ${pct(Math.min(0.14 * m, 0.4))} faster.`,
    apply: (mods, m) => {
      mods.moveSpeed = Math.min(mods.moveSpeed + 0.14 * m, 0.4);
    },
  },
  {
    id: 'gale-slipstream',
    name: 'Slipstream',
    school: 'gale',
    slot: 'movement',
    describe: (m) =>
      `Move ${pct(Math.min(0.08 * m, 0.3))} faster; dash and blink reach ${pct(0.18 * m)} further.`,
    apply: (mods, m) => {
      mods.moveSpeed = Math.min(mods.moveSpeed + 0.08 * m, 0.4);
      mods.dashDist += 0.18 * m;
    },
  },
  {
    id: 'gale-zephyr',
    name: 'Zephyr Bolt',
    school: 'gale',
    slot: 'attack',
    describe: (m) =>
      `Bolts recharge ${pct(Math.min(0.1 * m, 0.4))} faster and knock back ${pct(0.15 * m)} harder.`,
    apply: (mods, m) => {
      mods.attackCooldown = Math.min(mods.attackCooldown + 0.1 * m, 0.6);
      mods.attackKnockback += 0.15 * m;
    },
  },
  {
    id: 'gale-eye',
    name: 'Eye of the Storm',
    school: 'gale',
    slot: 'shield',
    describe: (m) =>
      `Raising your shield gusts enemies away (${Math.round(150 * m)} force); it drains ${pct(Math.min(0.1 * m, 0.4))} slower.`,
    apply: (mods, m) => {
      mods.wardPulseKb += 150 * m;
      mods.shieldEfficiency = Math.min(mods.shieldEfficiency + 0.1 * m, 0.65);
    },
  },
  {
    id: 'gale-featherfall',
    name: 'Featherfall',
    school: 'gale',
    slot: 'movement',
    describe: (m) =>
      `The wind holds you: ${pct(Math.min(0.35 * m, 0.8))} better control and far less drift off-stage.`,
    apply: (mods, m) => {
      mods.recovery = Math.min(mods.recovery + 0.35 * m, 0.8);
    },
  },
  {
    id: 'gale-vortex',
    name: 'Vortex Leap',
    school: 'gale',
    slot: 'movement',
    describe: (m) =>
      `Dash reaches ${pct(0.25 * m)} further and ends in a shove (${Math.round(120 * m)} force).`,
    apply: (mods, m) => {
      mods.dashDist += 0.25 * m;
      mods.dashShockwaveKb += 120 * m;
    },
  },

  // ---- Void (displacement) ----
  {
    id: 'void-bolt',
    name: 'Gravity Bolt',
    school: 'void',
    slot: 'attack',
    describe: (m) => `Your bolts drag victims toward you (${Math.round(200 * m)} pull) — yank them off the edge.`,
    apply: (mods, m) => {
      mods.boltPull += 200 * m;
    },
  },
  {
    id: 'void-blink',
    name: 'Umbral Step',
    school: 'void',
    slot: 'movement',
    describe: () => `Your dash becomes a blink — instantly teleport to a spot near your cursor.`,
    apply: (mods) => {
      mods.blink = 1;
    },
  },
  {
    id: 'void-ward',
    name: 'Devouring Ward',
    school: 'void',
    slot: 'shield',
    describe: (m) => `Blocked hits feed you, healing ${(3 * m).toFixed(1)}% pressure.`,
    apply: (mods, m) => {
      mods.wardAbsorb += 3 * m;
    },
  },
  {
    id: 'void-shell',
    name: 'Null Shell',
    school: 'void',
    slot: 'shield',
    describe: (m) =>
      `Take ${pct(Math.min(0.1 * m, 0.4))} less knockback; blocks heal ${(1.5 * m).toFixed(1)}% pressure.`,
    apply: (mods, m) => {
      mods.kbResist = Math.min(mods.kbResist + 0.1 * m, 0.5);
      mods.wardAbsorb += 1.5 * m;
    },
  },
  {
    id: 'void-hunger',
    name: 'Hungering Bolt',
    school: 'void',
    slot: 'attack',
    describe: (m) =>
      `Damage dealt vents ${pct(0.1 * m)} off your pressure and tugs victims toward you (${Math.round(80 * m)} pull).`,
    apply: (mods, m) => {
      mods.pressureVent += 0.1 * m;
      mods.boltPull += 80 * m;
    },
  },
  {
    id: 'void-reach',
    name: 'Abyssal Reach',
    school: 'void',
    slot: 'movement',
    describe: (m) => `Shadow tendrils carry you — dash and blink reach ${pct(0.3 * m)} further.`,
    apply: (mods, m) => {
      mods.dashDist += 0.3 * m;
    },
  },
  {
    id: 'void-darkmatter',
    name: 'Dark Matter Bolt',
    school: 'void',
    slot: 'attack',
    describe: (m) =>
      `Bolts are ${pct(0.2 * m)} larger and drag victims toward you (${Math.round(90 * m)} pull).`,
    apply: (mods, m) => {
      mods.boltSize += 0.2 * m;
      mods.boltPull += 90 * m;
    },
  },
  {
    id: 'void-swap',
    name: 'Umbral Exchange',
    school: 'void',
    slot: 'movement',
    describe: (m) =>
      `Dashing toward an enemy within ${Math.round(230 + 60 * m)} units SWAPS your positions — trade places with someone mid-ring-out.`,
    apply: (mods, m) => {
      mods.enemySwap = Math.max(mods.enemySwap, 230 + 60 * m);
    },
  },
  {
    id: 'void-thorns',
    name: 'Umbral Thorns',
    school: 'void',
    slot: 'shield',
    describe: (m) =>
      `Contact deals ${(3 * m).toFixed(1)}%/s; blocked attackers are slowed ${pct(Math.min(0.1 * m, 0.4))}.`,
    apply: (mods, m) => {
      mods.thorns += 3 * m;
      mods.wardSlow = Math.min(mods.wardSlow + 0.1 * m, 0.75);
    },
  },

  // ---- Arcane (neutral utility) ----
  {
    id: 'arcane-split',
    name: 'Twin Cast',
    school: 'arcane',
    slot: 'attack',
    describe: () => `Fire an additional bolt in a spread. (Stacks.)`,
    apply: (mods) => {
      mods.boltCount += 1;
    },
  },
  {
    id: 'arcane-reserves',
    name: 'Deep Reserves',
    school: 'arcane',
    slot: 'shield',
    describe: (m) => `Your shield drains ${pct(Math.min(0.25 * m, 0.65))} slower.`,
    apply: (mods, m) => {
      mods.shieldEfficiency = Math.min(mods.shieldEfficiency + 0.25 * m, 0.65);
    },
  },
  {
    id: 'arcane-quickstep',
    name: 'Quickened Sigil',
    school: 'arcane',
    slot: 'movement',
    describe: (m) => `Your dash recharges ${pct(Math.min(0.25 * m, 0.6))} faster.`,
    apply: (mods, m) => {
      mods.dashCooldown = Math.min(mods.dashCooldown + 0.25 * m, 0.6);
    },
  },
  {
    id: 'arcane-keen',
    name: 'Keen Sigil',
    school: 'arcane',
    slot: 'attack',
    describe: (m) => `Your attacks deal ${pct(0.12 * m)} more pressure.`,
    apply: (mods, m) => {
      mods.attackDamage += 0.12 * m;
    },
  },
  {
    id: 'arcane-bulwark',
    name: 'Bulwark Sigil',
    school: 'arcane',
    slot: 'shield',
    describe: (m) =>
      `Take ${pct(Math.min(0.08 * m, 0.3))} less knockback; shield drains ${pct(Math.min(0.1 * m, 0.4))} slower.`,
    apply: (mods, m) => {
      mods.kbResist = Math.min(mods.kbResist + 0.08 * m, 0.5);
      mods.shieldEfficiency = Math.min(mods.shieldEfficiency + 0.1 * m, 0.65);
    },
  },
  {
    id: 'arcane-fleet',
    name: 'Fleet Sigil',
    school: 'arcane',
    slot: 'movement',
    describe: (m) => `You move ${pct(Math.min(0.1 * m, 0.35))} faster.`,
    apply: (mods, m) => {
      mods.moveSpeed = Math.min(mods.moveSpeed + 0.1 * m, 0.4);
    },
  },
  {
    id: 'arcane-impact',
    name: 'Impact Sigil',
    school: 'arcane',
    slot: 'attack',
    describe: (m) => `Your bolts knock back ${pct(0.18 * m)} harder.`,
    apply: (mods, m) => {
      mods.attackKnockback += 0.18 * m;
    },
  },
  {
    id: 'arcane-siphon',
    name: 'Siphon Sigil',
    school: 'arcane',
    slot: 'shield',
    describe: (m) => `Blocked hits heal ${(2 * m).toFixed(1)}% of your pressure.`,
    apply: (mods, m) => {
      mods.wardAbsorb += 2 * m;
    },
  },
  {
    id: 'arcane-recall',
    name: 'Aegis Recall',
    school: 'arcane',
    slot: 'movement',
    describe: (m) =>
      `Dash recharges ${pct(Math.min(0.08 * m, 0.3))} faster; ${pct(Math.min(0.2 * m, 0.6))} better off-stage control.`,
    apply: (mods, m) => {
      mods.dashCooldown = Math.min(mods.dashCooldown + 0.08 * m, 0.6);
      mods.recovery = Math.min(mods.recovery + 0.2 * m, 0.8);
    },
  },
  {
    id: 'arcane-sniper',
    name: 'Longshot Sigil',
    school: 'arcane',
    slot: 'attack',
    describe: (m) =>
      `SNIPER: bolts fly far faster and further, pierce one enemy, and deal ${pct(0.25 * m)} bonus pressure — but your attack recharges slower.`,
    apply: (mods, m) => {
      mods.sniperShot += 0.25 * m;
    },
  },
  {
    id: 'arcane-momentum',
    name: 'Momentum',
    school: 'arcane',
    slot: 'movement',
    describe: (m) =>
      `Move ${pct(Math.min(0.06 * m, 0.25))} faster and your hits knock back ${pct(0.1 * m)} harder.`,
    apply: (mods, m) => {
      mods.moveSpeed = Math.min(mods.moveSpeed + 0.06 * m, 0.4);
      mods.attackKnockback += 0.1 * m;
    },
  },

  // ---- Duo boons ----
  {
    id: 'duo-combustion',
    name: 'Combustion',
    school: 'ember',
    slot: 'attack',
    requires: ['ember-bolt', 'gale-bolt'],
    describe: (m) =>
      `DUO — Ember + Gale: your bolts explode on impact (radius ${Math.round(110 * m)}), blasting everyone nearby.`,
    apply: (mods, m) => {
      mods.boltExplodeRadius += 110 * m;
    },
  },
  {
    id: 'duo-shatter',
    name: 'Shatterpoint',
    school: 'frost',
    slot: 'attack',
    requires: ['frost-bolt', 'volt-bolt'],
    describe: (m) =>
      `DUO — Frost + Volt: chilled enemies take ${pct(0.5 * m)} bonus pressure from your hits.`,
    apply: (mods, m) => {
      mods.shatterBonus += 0.5 * m;
    },
  },
  {
    id: 'duo-eventhorizon',
    name: 'Event Horizon',
    school: 'void',
    slot: 'movement',
    requires: ['void-blink', 'gale-dash'],
    describe: (m) =>
      `DUO — Void + Gale: your blink leaves a black hole that drags enemies in (${Math.round(340 * m)} pull).`,
    apply: (mods, m) => {
      mods.blackHolePull += 340 * m;
    },
  },
  {
    id: 'duo-steam',
    name: 'Steam Burst',
    school: 'ember',
    slot: 'attack',
    requires: ['ember-bolt', 'frost-bolt'],
    describe: (m) =>
      `DUO — Ember + Frost: bolts detonate in scalding steam (radius ${Math.round(80 * m)}) that chills everyone caught.`,
    apply: (mods, m) => {
      mods.boltExplodeRadius += 80 * m;
      mods.boltSlow = Math.min(mods.boltSlow + 0.15 * m, 0.7);
    },
  },
  {
    id: 'duo-balllightning',
    name: 'Ball Lightning',
    school: 'volt',
    slot: 'attack',
    requires: ['volt-bolt', 'gale-bolt'],
    describe: (m) =>
      `DUO — Volt + Gale: bolts leap between enemies twice and knock back ${pct(0.2 * m)} harder.`,
    apply: (mods, m) => {
      mods.boltRicochet += 2;
      mods.attackKnockback += 0.2 * m;
    },
  },
  {
    id: 'duo-absolutezero',
    name: 'Absolute Zero',
    school: 'frost',
    slot: 'shield',
    requires: ['frost-ward', 'void-ward'],
    describe: (m) =>
      `DUO — Frost + Void: a ${(0.3 * m).toFixed(2)}s parry window reflects bolts, and blocked attackers are deeply chilled.`,
    apply: (mods, m) => {
      mods.parryWindow += 0.3 * m;
      mods.wardSlow = Math.min(mods.wardSlow + 0.25 * m, 0.75);
    },
  },
  {
    id: 'duo-plasma',
    name: 'Plasma Core',
    school: 'ember',
    slot: 'attack',
    requires: ['ember-power', 'volt-haste'],
    describe: (m) =>
      `DUO — Ember + Volt: attacks deal ${pct(0.25 * m)} more pressure and recharge ${pct(Math.min(0.1 * m, 0.35))} faster.`,
    apply: (mods, m) => {
      mods.attackDamage += 0.25 * m;
      mods.attackCooldown = Math.min(mods.attackCooldown + 0.1 * m, 0.6);
    },
  },
  {
    id: 'duo-maelstrom',
    name: 'Maelstrom',
    school: 'gale',
    slot: 'movement',
    requires: ['gale-dash', 'void-bolt'],
    describe: (m) =>
      `DUO — Gale + Void: your dash ends in a vortex that drags enemies toward you (${Math.round(260 * m)} pull).`,
    apply: (mods, m) => {
      mods.dashVortexPull += 260 * m;
    },
  },
  {
    id: 'duo-seekingscatter',
    name: 'Seeking Scatter',
    school: 'volt',
    slot: 'attack',
    requires: ['volt-homing', 'arcane-split'],
    describe: (m) =>
      `DUO — Volt + Arcane: fire an extra bolt, and every bolt hunts harder (+${(1.4 * m).toFixed(1)} rad/s homing).`,
    apply: (mods, m) => {
      mods.boltCount += 1;
      mods.boltHoming = Math.min(mods.boltHoming + 1.4 * m, 6);
    },
  },
  {
    id: 'duo-deadeye',
    name: 'Deadeye Tempest',
    school: 'gale',
    slot: 'attack',
    requires: ['arcane-sniper', 'gale-bolt'],
    describe: (m) =>
      `DUO — Arcane + Gale: sniper shots hit like a hurricane, knocking back ${pct(0.5 * m)} harder.`,
    apply: (mods, m) => {
      mods.sniperShot += 0.1 * m;
      mods.attackKnockback += 0.5 * m;
    },
  },
];

const RARITY_WEIGHTS: readonly (readonly [Rarity, number])[] = [
  ['common', 60],
  ['rare', 30],
  ['epic', 10],
];

/** Compute the merged modifier set from a wizard's owned boons. */
export function computeMods(owned: OwnedBoon[]): Mods {
  const mods = emptyMods();
  for (const { def, rarity } of owned) {
    def.apply(mods, RARITY_MULT[rarity]);
  }
  return mods;
}

/** Chance that a draft's last slot is a procedurally generated wildcard. */
const WILDCARD_CHANCE = 0.35;

/**
 * Roll a draft of up to 3 boon offers.
 * - Never offers a boon already owned (upgrading rarity instead is allowed if rolled higher).
 * - Duo boons only appear once both prerequisites are owned, and are guaranteed
 *   to be included when eligible (they're the fun payoff).
 * - Offers skew toward skill slots the drafter has invested in less.
 * - The last slot has a chance to be a one-of-a-kind wildcard boon.
 */
export function rollDraft(owned: OwnedBoon[], count = 3): OwnedBoon[] {
  const ownedIds = new Map(owned.map((o) => [o.def.id, o.rarity]));

  const eligible = BOONS.filter((b) => {
    if (b.requires && !b.requires.every((r) => ownedIds.has(r))) return false;
    const have = ownedIds.get(b.id);
    if (have === 'epic') return false; // maxed out
    return true;
  });

  const duos = eligible.filter((b) => b.requires && !ownedIds.has(b.id));
  const normal = eligible.filter((b) => !duos.includes(b));

  const picked: BoonDef[] = [];
  if (duos.length > 0) picked.push(duos[0]);

  // weight offers toward slots with less investment, to keep builds varied
  const slotCounts: Record<Slot, number> = { attack: 0, shield: 0, movement: 0 };
  for (const o of owned) slotCounts[o.def.slot]++;
  const pool = [...normal];
  while (picked.length < count && pool.length > 0) {
    const weighted = pool.map(
      (b) => [b, 1 / (1 + slotCounts[b.slot] * 0.6)] as const,
    );
    const chosen = pickWeighted(weighted);
    pool.splice(pool.indexOf(chosen), 1);
    picked.push(chosen);
  }

  const offers = picked.map((def) => {
    let rarity = def.requires ? ('epic' as Rarity) : pickWeighted(RARITY_WEIGHTS);
    // If already owned at some rarity, offer strictly higher rarity (an upgrade).
    const have = ownedIds.get(def.id);
    if (have === 'common' && rarity === 'common') rarity = 'rare';
    if (have === 'rare') rarity = 'epic';
    return { def, rarity };
  });

  if (offers.length >= 2 && Math.random() < WILDCARD_CHANCE) {
    offers[offers.length - 1] = makeWildcard();
  }
  return offers;
}

/** Add or upgrade a boon in the owned list. */
export function grantBoon(owned: OwnedBoon[], boon: OwnedBoon): void {
  const existing = owned.find((o) => o.def.id === boon.def.id);
  if (existing) {
    existing.rarity = boon.rarity;
  } else {
    owned.push(boon);
  }
}
