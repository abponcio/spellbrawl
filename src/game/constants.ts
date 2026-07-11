import type { AIDifficulty } from './settings';

export const ARENA_RADIUS = 620;
export const ARENA_MIN_RADIUS = 260;
export const ARENA_SHRINK_START = 18; // seconds into a round
export const ARENA_SHRINK_DUR = 14;

/**
 * The KO line sits this far beyond the platform rim and tightens with it —
 * `blastRadius = arenaRadius + BLAST_MARGIN` — so the recovery gap stays
 * constant as the arena shrinks and late rounds actually end.
 */
export const BLAST_MARGIN = 230;

/**
 * Hard cap on round length: past this many seconds of fighting, everyone
 * passively gains pressure — soon any hit is a launch.
 */
export const SUDDEN_DEATH_START = ARENA_SHRINK_START + ARENA_SHRINK_DUR + 8; // 40s
export const SUDDEN_DEATH_DPS = 5; // pressure %/s during sudden death
/** Fraction of normal control retained while off-stage (before recovery boons). */
export const OFFSTAGE_CONTROL = 0.42;
/** Outward drift acceleration off-stage — you can't hover there forever. */
export const OFFSTAGE_DRIFT = 170;
/** World diameter that must fit on screen; sized so the blast ring is visible. */
export const WORLD_VIEW = 1900;

export const WIZARD_RADIUS = 30;
export const BASE_MOVE_SPEED = 340;

export const BASE_ATTACK_CD = 0.42;
export const BOLT_SPEED = 950;
export const BOLT_DAMAGE = 8; // pressure %
export const BOLT_KB = 265; // knock velocity at 0% pressure
/** Lower divisor = pressure ramps knockback harder (Smash-style scaling). */
export const PRESSURE_KB_DIVISOR = 55;
export const BOLT_RADIUS = 12;
export const BOLT_RANGE = 900;

export const BASE_DASH_CD = 1.9;
export const DASH_SPEED = 1600;
export const DASH_DUR = 0.16;
export const BLINK_DIST = 270;

export const SHIELD_DRAIN = 0.4; // stamina per second held
export const SHIELD_REGEN = 0.34;
export const SHIELD_BLOCK_COST = 0.2;
export const SHIELD_REARM = 0.5; // stamina needed to raise again after break
export const GUARD_BREAK_STUN = 1.1;

export const KNOCK_DECAY = 2.8; // exponential decay rate of knockback velocity
export const STOCKS_PER_ROUND = 2;
export const ROUNDS_TO_WIN = 3;
export const RESPAWN_INVULN = 1.6;
export const FALL_DUR = 0.75;

export const PLAYER_COLOR = '#4dd8ff';
export const ENEMY_INFO: { name: string; color: string }[] = [
  { name: 'Nyx', color: '#ff5964' },
  { name: 'Grimm', color: '#ff9f43' },
  { name: 'Vex', color: '#c56cf0' },
];

export const SCHOOL_COLORS: Record<string, string> = {
  ember: '#ff6b35',
  frost: '#7ed4ff',
  volt: '#ffe94d',
  gale: '#9dffb0',
  void: '#b06bff',
  arcane: '#e0d7ff',
};

export interface AIDifficultyPreset {
  shieldReactionMin: number;
  shieldReactionMax: number;
  shieldMissChance: number;
  shieldHoldMin: number;
  shieldHoldMax: number;
  lateralTol: number;
  aimErrorMin: number;
  aimErrorMax: number;
  fireDelayMin: number;
  fireDelayMax: number;
  edgeGuardChance: number;
  edgeGuardPressure: number;
  playerSkipChance: number;
  threatEtaMax: number;
}

export const AI_DIFFICULTY_PRESETS: Record<AIDifficulty, AIDifficultyPreset> = {
  easy: {
    shieldReactionMin: 0.22,
    shieldReactionMax: 0.38,
    shieldMissChance: 0.45,
    shieldHoldMin: 0.14,
    shieldHoldMax: 0.22,
    lateralTol: 18,
    aimErrorMin: 0.18,
    aimErrorMax: 0.28,
    fireDelayMin: 0.35,
    fireDelayMax: 0.85,
    edgeGuardChance: 0.2,
    edgeGuardPressure: 100,
    playerSkipChance: 0.55,
    threatEtaMax: 0.22,
  },
  normal: {
    shieldReactionMin: 0.12,
    shieldReactionMax: 0.22,
    shieldMissChance: 0.25,
    shieldHoldMin: 0.18,
    shieldHoldMax: 0.28,
    lateralTol: 26,
    aimErrorMin: 0.1,
    aimErrorMax: 0.18,
    fireDelayMin: 0.22,
    fireDelayMax: 0.65,
    edgeGuardChance: 0.5,
    edgeGuardPressure: 80,
    playerSkipChance: 0.4,
    threatEtaMax: 0.28,
  },
  hard: {
    shieldReactionMin: 0.04,
    shieldReactionMax: 0.1,
    shieldMissChance: 0.08,
    shieldHoldMin: 0.26,
    shieldHoldMax: 0.36,
    lateralTol: 34,
    aimErrorMin: 0.05,
    aimErrorMax: 0.12,
    fireDelayMin: 0.15,
    fireDelayMax: 0.55,
    edgeGuardChance: 0.85,
    edgeGuardPressure: 70,
    playerSkipChance: 0.1,
    threatEtaMax: 0.33,
  },
};
