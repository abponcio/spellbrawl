import { pick, pickWeighted, rand } from '../engine/rng';
import type { BoonDef, Mods, OwnedBoon, Rarity, School, Slot } from './types';

/**
 * Procedural "wildcard" boons: one-of-a-kind skills rolled at draft time.
 * A wildcard combines 2-3 upside primitives (weighted toward a school's
 * identity) plus one drawback that buys extra budget. All randomness happens
 * here, at the draft — once taken, the boon is a fixed set of numbers and
 * combat stays fully deterministic.
 */

const pctStr = (v: number) => `${Math.round(v * 100)}%`;

interface GenEffect {
  key: keyof Mods;
  schools: School[];
  slot: Slot;
  /** Magnitude granted per budget point. */
  perPoint: number;
  cap?: number;
  fmt: (v: number) => string;
}

const UPSIDES: GenEffect[] = [
  { key: 'attackDamage', schools: ['ember', 'arcane'], slot: 'attack', perPoint: 0.09, fmt: (v) => `bolts deal ${pctStr(v)} more pressure` },
  { key: 'attackKnockback', schools: ['gale', 'arcane'], slot: 'attack', perPoint: 0.11, fmt: (v) => `bolts knock back ${pctStr(v)} harder` },
  { key: 'attackCooldown', schools: ['volt'], slot: 'attack', perPoint: 0.08, cap: 0.6, fmt: (v) => `attack recharges ${pctStr(v)} faster` },
  { key: 'boltSize', schools: ['ember', 'void'], slot: 'attack', perPoint: 0.15, fmt: (v) => `bolts are ${pctStr(v)} larger` },
  { key: 'boltSlow', schools: ['frost'], slot: 'attack', perPoint: 0.1, cap: 0.6, fmt: (v) => `bolts chill targets ${pctStr(v)}` },
  { key: 'boltBurnDps', schools: ['ember'], slot: 'attack', perPoint: 2.2, fmt: (v) => `bolts ignite for ${v.toFixed(1)}%/s` },
  { key: 'boltPull', schools: ['void'], slot: 'attack', perPoint: 60, fmt: (v) => `bolts drag victims toward you (${Math.round(v)} pull)` },
  { key: 'boltChainDamage', schools: ['volt'], slot: 'attack', perPoint: 0.2, fmt: (v) => `hits chain to another enemy for ${pctStr(v)} damage` },
  { key: 'boltHoming', schools: ['volt', 'arcane'], slot: 'attack', perPoint: 1.1, cap: 5, fmt: (v) => `bolts curve toward enemies (${v.toFixed(1)} rad/s)` },
  { key: 'pressureVent', schools: ['void', 'ember'], slot: 'attack', perPoint: 0.07, fmt: (v) => `damage dealt vents ${pctStr(v)} off your pressure` },
  { key: 'moveSpeed', schools: ['gale', 'arcane'], slot: 'movement', perPoint: 0.06, cap: 0.4, fmt: (v) => `move ${pctStr(v)} faster` },
  { key: 'dashCooldown', schools: ['volt', 'gale'], slot: 'movement', perPoint: 0.1, cap: 0.6, fmt: (v) => `dash recharges ${pctStr(v)} faster` },
  { key: 'dashDist', schools: ['void', 'gale'], slot: 'movement', perPoint: 0.12, fmt: (v) => `dash reaches ${pctStr(v)} further` },
  { key: 'recovery', schools: ['gale', 'frost', 'arcane'], slot: 'movement', perPoint: 0.15, cap: 0.8, fmt: (v) => `${pctStr(v)} better off-stage control` },
  { key: 'dashZapDamage', schools: ['volt'], slot: 'movement', perPoint: 3.5, fmt: (v) => `dashing through enemies zaps them for ${v.toFixed(1)}%` },
  { key: 'dashShockwaveKb', schools: ['gale', 'ember'], slot: 'movement', perPoint: 100, fmt: (v) => `dash ends in a shove (${Math.round(v)} force)` },
  { key: 'shieldEfficiency', schools: ['arcane', 'frost'], slot: 'shield', perPoint: 0.1, cap: 0.65, fmt: (v) => `shield drains ${pctStr(v)} slower` },
  { key: 'wardAbsorb', schools: ['void'], slot: 'shield', perPoint: 1.2, fmt: (v) => `blocks heal ${v.toFixed(1)}% pressure` },
  { key: 'wardSlow', schools: ['frost'], slot: 'shield', perPoint: 0.12, cap: 0.75, fmt: (v) => `blocked attackers are slowed ${pctStr(v)}` },
  { key: 'wardPulseKb', schools: ['gale'], slot: 'shield', perPoint: 90, fmt: (v) => `raising your shield gusts enemies away (${Math.round(v)} force)` },
  { key: 'thorns', schools: ['ember', 'volt', 'void'], slot: 'shield', perPoint: 2, fmt: (v) => `contact deals ${v.toFixed(1)}%/s` },
  { key: 'kbResist', schools: ['frost', 'arcane'], slot: 'shield', perPoint: 0.07, cap: 0.5, fmt: (v) => `take ${pctStr(v)} less knockback` },
];

interface GenDrawback {
  key: keyof Mods;
  value: number; // applied as-is (negative)
  text: string;
}

const DRAWBACKS: GenDrawback[] = [
  { key: 'moveSpeed', value: -0.1, text: 'you move 10% slower' },
  { key: 'attackCooldown', value: -0.12, text: 'your attack recharges 12% slower' },
  { key: 'dashCooldown', value: -0.15, text: 'your dash recharges 15% slower' },
  { key: 'shieldEfficiency', value: -0.15, text: 'your shield drains 15% faster' },
  { key: 'kbResist', value: -0.12, text: 'you take 12% more knockback' },
];

const NAME_PREFIX: Record<School, string[]> = {
  ember: ['Cinder', 'Ashen', 'Molten', 'Pyric', 'Smoldering'],
  frost: ['Rime', 'Glacial', 'Boreal', 'Hoarfrost', 'Winterbound'],
  volt: ['Static', 'Ion', 'Stormcall', 'Arclight', 'Thunderstruck'],
  gale: ['Zephyr', 'Squall', 'Tempest', 'Sirocco', 'Galewoven'],
  void: ['Umbral', 'Abyssal', 'Null', 'Ebon', 'Hollow'],
  arcane: ['Runic', 'Prismatic', 'Sidereal', 'Gleaming', 'Woven'],
};

const NAME_CORE = ['Sigil', 'Brand', 'Pact', 'Rune', 'Hex', 'Charm', 'Covenant', 'Relic', 'Oath'];

const BUDGET: Record<Rarity, number> = { common: 2, rare: 3, epic: 4.5 };
const DRAWBACK_BONUS = 1.3;

const RARITY_WEIGHTS: readonly (readonly [Rarity, number])[] = [
  ['common', 45],
  ['rare', 38],
  ['epic', 17],
];

let wildCounter = 0;

/** Roll a unique wildcard boon. All values are baked; rarity is display/pricing only. */
export function makeWildcard(): OwnedBoon {
  const rarity = pickWeighted(RARITY_WEIGHTS);
  const school = pick(['ember', 'frost', 'volt', 'gale', 'void', 'arcane'] as School[]);

  // primary effect from the school's identity, extras from anywhere
  const schoolPool = UPSIDES.filter((u) => u.schools.includes(school));
  const primary = pick(schoolPool.length > 0 ? schoolPool : UPSIDES);
  const effectCount = Math.random() < 0.45 ? 3 : 2;
  const chosen: GenEffect[] = [primary];
  while (chosen.length < effectCount) {
    const cand = pick(UPSIDES);
    if (!chosen.includes(cand)) chosen.push(cand);
  }

  const drawback = pick(DRAWBACKS);
  let budget = BUDGET[rarity] + DRAWBACK_BONUS;

  // primary gets the larger share
  const shares = chosen.map((_, i) => (i === 0 ? 1.6 : 1));
  const shareTotal = shares.reduce((a, b) => a + b, 0);
  const rolled = chosen.map((eff, i) => {
    const pts = (budget * shares[i]) / shareTotal;
    let v = eff.perPoint * pts * rand(0.85, 1.15);
    if (eff.cap !== undefined) v = Math.min(v, eff.cap);
    return { eff, value: v };
  });

  const name = `${pick(NAME_PREFIX[school])} ${pick(NAME_CORE)}`;
  const slot = primary.slot;
  const descParts = rolled.map((r) => r.eff.fmt(r.value));
  const description = `${descParts.join('; ')} — BUT ${drawback.text}.`;

  const def: BoonDef = {
    id: `wild-${++wildCounter}`,
    name,
    school,
    slot,
    wild: true,
    describe: () => description.charAt(0).toUpperCase() + description.slice(1),
    apply: (mods) => {
      for (const r of rolled) {
        (mods[r.eff.key] as number) += r.value;
        if (r.eff.cap !== undefined) {
          (mods[r.eff.key] as number) = Math.min(mods[r.eff.key] as number, r.eff.cap);
        }
      }
      (mods[drawback.key] as number) += drawback.value;
    },
  };

  return { def, rarity };
}
