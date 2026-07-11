import type { CombatStats } from '../stats';

/** Per-player frame input sent to the authoritative server. */
export interface PlayerInput {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  attack: boolean;
  shield: boolean;
  dash: boolean;
}

export type SimPhase = 'countdown' | 'fight' | 'end';

export interface WizardSnap {
  id: number;
  name: string;
  color: string;
  x: number;
  y: number;
  aimX: number;
  aimY: number;
  pressure: number;
  stocks: number;
  state: 'active' | 'falling' | 'out';
  shieldUp: boolean;
  stamina: number;
  roundWins: number;
}

export interface ProjectileSnap {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radius: number;
  ownerId: number;
}

export interface HazardSnap {
  kind: 'fire' | 'frost' | 'blackhole';
  x: number;
  y: number;
  radius: number;
  ttl: number;
  maxTtl: number;
}

export interface SimSnapshot {
  tick: number;
  phase: SimPhase;
  phaseTimer: number;
  fightTime: number;
  arenaRadius: number;
  blastRadius: number;
  banner: string;
  round: number;
  wizards: WizardSnap[];
  projectiles: ProjectileSnap[];
  hazards: HazardSnap[];
}

export interface LobbyPlayer {
  connId: string;
  slot: number;
  name: string;
  color: string;
  ready: boolean;
  userId?: string;
}

export type RoomPhase = 'lobby' | 'draft' | 'countdown' | 'arena' | 'round_results' | 'match_results';

export interface BoonSnap {
  id: string;
  name: string;
  school: string;
  slot: string;
  rarity: string;
  level: number;
  describe: string;
}

export interface MatchResultPayload {
  placement: number;
  roundsWon: number;
  opponents: number;
  roomCode: string;
  stats: CombatStats;
  won: boolean;
}
